#!/usr/bin/env bash
set -euo pipefail

WEB_ROOT=${ONOFF_WEB_ROOT:-/var/www/onoff}
RELEASES_DIR="$WEB_ROOT/releases"
CURRENT_LINK="$WEB_ROOT/current"
SOURCE_DIR=${1:-}
RELEASE_ID=${2:-$(date -u +%Y%m%dT%H%M%SZ)}
HEALTH_URL=${ONOFF_FRONTEND_HEALTH_URL:-http://127.0.0.1:8081/}

replace_link() {
  local source=$1 destination=$2
  if mv -Tf "$source" "$destination" 2>/dev/null; then return; fi
  rm -f -- "$destination"
  mv -f "$source" "$destination"
}

if [[ -z "$SOURCE_DIR" || ! -f "$SOURCE_DIR/index.html" ]]; then
  echo "usage: $0 <built-dist-directory> [release-id]" >&2
  exit 2
fi
if [[ ! "$RELEASE_ID" =~ ^[A-Za-z0-9._-]{6,80}$ ]]; then
  echo "invalid release id" >&2
  exit 2
fi
if find "$SOURCE_DIR" -type l -print -quit | grep -q .; then
  echo "release source must not contain symlinks" >&2
  exit 2
fi

install -d -m 0755 "$RELEASES_DIR"
TARGET="$RELEASES_DIR/$RELEASE_ID"
if [[ -e "$TARGET" ]]; then
  echo "release already exists: $RELEASE_ID" >&2
  exit 2
fi

STAGING="$RELEASES_DIR/.${RELEASE_ID}.tmp.$$"
cleanup() { rm -rf -- "$STAGING"; }
trap cleanup EXIT
install -d -m 0755 "$STAGING"
cp -a "$SOURCE_DIR"/. "$STAGING"/
test -s "$STAGING/index.html"
find "$STAGING" -type d -exec chmod 0755 {} +
find "$STAGING" -type f -exec chmod 0644 {} +
mv "$STAGING" "$TARGET"
trap - EXIT

PREVIOUS=$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)
ln -s "$TARGET" "$CURRENT_LINK.next"
replace_link "$CURRENT_LINK.next" "$CURRENT_LINK"

if [[ ${ONOFF_SKIP_HEALTHCHECK:-false} != true ]]; then
  healthy=false
  for _ in 1 2 3 4 5; do
    HTML=$(curl -fsS --max-time 5 "$HEALTH_URL" || true)
    if grep -qi '<!doctype html' <<<"$HTML"; then
      ASSET=$(sed -n 's/.*<script[^>]*src="\([^"]*\.js\)".*/\1/p' <<<"$HTML" | head -n 1)
      if [[ -n "$ASSET" ]] && curl -fsS --max-time 5 "${HEALTH_URL%/}$ASSET" >/dev/null; then
        healthy=true
        break
      fi
    fi
    sleep 1
  done
  if [[ "$healthy" != true ]]; then
    if [[ -n "$PREVIOUS" && -d "$PREVIOUS" ]]; then
      ln -s "$PREVIOUS" "$CURRENT_LINK.rollback"
      replace_link "$CURRENT_LINK.rollback" "$CURRENT_LINK"
    else
      rm -f -- "$CURRENT_LINK"
    fi
    echo "release health check failed; active release restored" >&2
    exit 1
  fi
fi

printf 'active release: %s\n' "$RELEASE_ID"
