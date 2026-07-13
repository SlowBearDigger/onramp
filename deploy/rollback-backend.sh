#!/usr/bin/env bash
set -euo pipefail

APP_ROOT=${ONOFF_BACKEND_ROOT:-/srv/onoff-app}
RELEASE_ID=${1:-}
SERVICE=${ONOFF_BACKEND_SERVICE:-onramp-backend.service}

replace_link() {
  local source=$1 destination=$2
  if mv -Tf "$source" "$destination" 2>/dev/null; then return; fi
  rm -f -- "$destination"
  mv -f "$source" "$destination"
}

backend_is_healthy() {
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS --max-time 5 http://127.0.0.1:3001/healthz | grep -q '"ok":true'; then
      return 0
    fi
    sleep 1
  done
  return 1
}
if [[ ! "$RELEASE_ID" =~ ^[A-Za-z0-9._-]{6,80}$ ]]; then
  echo "usage: $0 <existing-release-id>" >&2
  exit 2
fi

TARGET="$APP_ROOT/releases/$RELEASE_ID"
CURRENT_LINK="$APP_ROOT/current"
test -s "$TARGET/backend/app.js" || { echo "release not found: $RELEASE_ID" >&2; exit 2; }

PREVIOUS=$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)
ln -s "$TARGET" "$CURRENT_LINK.rollback"
replace_link "$CURRENT_LINK.rollback" "$CURRENT_LINK"
systemctl restart "$SERVICE"

if ! backend_is_healthy; then
  if [[ -n "$PREVIOUS" && -d "$PREVIOUS" ]]; then
    ln -s "$PREVIOUS" "$CURRENT_LINK.failed-rollback"
    replace_link "$CURRENT_LINK.failed-rollback" "$CURRENT_LINK"
    systemctl restart "$SERVICE"
    if ! backend_is_healthy; then
      echo 'backend rollback failed; restored release is also unhealthy' >&2
      exit 1
    fi
  fi
  echo 'backend rollback failed; previous release restored' >&2
  exit 1
fi

printf 'backend rolled back to: %s\n' "$RELEASE_ID"
