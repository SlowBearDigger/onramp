#!/usr/bin/env bash
set -euo pipefail

WEB_ROOT=${ONOFF_WEB_ROOT:-/var/www/onoff}
RELEASE_ID=${1:-}
HEALTH_URL=${ONOFF_FRONTEND_HEALTH_URL:-http://127.0.0.1:8081/}

replace_link() {
  local source=$1 destination=$2
  if mv -Tf "$source" "$destination" 2>/dev/null; then return; fi
  rm -f -- "$destination"
  mv -f "$source" "$destination"
}

frontend_is_healthy() {
  local html asset base_url
  html=$(curl -fsS --max-time 5 "$HEALTH_URL") || return 1
  grep -qi '<!doctype html' <<<"$html" || return 1
  asset=$(sed -n 's/.*<script[^>]*src="\([^"]*\.js\)".*/\1/p' <<<"$html" | head -n 1)
  test -n "$asset" || return 1
  base_url=${HEALTH_URL%/}
  if [[ "$base_url" == */index.html ]]; then
    base_url=${base_url%/index.html}
  fi
  curl -fsS --max-time 5 "$base_url$asset" >/dev/null
}
if [[ ! "$RELEASE_ID" =~ ^[A-Za-z0-9._-]{6,80}$ ]]; then
  echo "usage: $0 <existing-release-id>" >&2
  exit 2
fi

TARGET="$WEB_ROOT/releases/$RELEASE_ID"
CURRENT_LINK="$WEB_ROOT/current"
test -s "$TARGET/index.html" || { echo "release not found: $RELEASE_ID" >&2; exit 2; }

PREVIOUS=$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)
ln -s "$TARGET" "$CURRENT_LINK.rollback"
replace_link "$CURRENT_LINK.rollback" "$CURRENT_LINK"

if ! frontend_is_healthy; then
  if [[ -n "$PREVIOUS" && -d "$PREVIOUS" ]]; then
    ln -s "$PREVIOUS" "$CURRENT_LINK.failed-rollback"
    replace_link "$CURRENT_LINK.failed-rollback" "$CURRENT_LINK"
  fi
  echo "rollback target failed health check; previous release restored" >&2
  exit 1
fi

printf 'rolled back to: %s\n' "$RELEASE_ID"
