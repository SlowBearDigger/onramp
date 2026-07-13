#!/usr/bin/env bash
set -euo pipefail

APP_ROOT=${ONOFF_BACKEND_ROOT:-/srv/onoff-app}
RELEASES_DIR="$APP_ROOT/releases"
CURRENT_LINK="$APP_ROOT/current"
SOURCE_ROOT=${1:-}
RELEASE_ID=${2:-$(date -u +%Y%m%dT%H%M%SZ)}
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

if [[ -z "$SOURCE_ROOT" || ! -f "$SOURCE_ROOT/backend/package-lock.json" ]]; then
  echo "usage: $0 <repository-directory> [release-id]" >&2
  exit 2
fi
if [[ ! "$RELEASE_ID" =~ ^[A-Za-z0-9._-]{6,80}$ ]]; then
  echo 'invalid release id' >&2
  exit 2
fi
test -s /etc/onoff/backend.env || { echo 'missing /etc/onoff/backend.env' >&2; exit 1; }
id -u onramp >/dev/null 2>&1 || { echo 'missing onramp service user' >&2; exit 1; }

install -d -m 0755 "$RELEASES_DIR"
TARGET="$RELEASES_DIR/$RELEASE_ID"
[[ ! -e "$TARGET" ]] || { echo "release already exists: $RELEASE_ID" >&2; exit 2; }

STAGING="$RELEASES_DIR/.${RELEASE_ID}.tmp.$$"
cleanup() { rm -rf -- "$STAGING"; }
trap cleanup EXIT
install -d -m 0755 "$STAGING/backend"
tar -C "$SOURCE_ROOT/backend" \
  --exclude='./.env*' --exclude='./node_modules' --exclude='./.npm' \
  --exclude='./data.db*' --exclude='._*' --exclude='.DS_Store' \
  -cf - . | tar -C "$STAGING/backend" -xf -
test -s "$STAGING/backend/app.js"
test -s "$STAGING/backend/package-lock.json"
chown -R onramp:onramp "$STAGING"
runuser -u onramp -- env HOME=/var/lib/onramp npm --prefix "$STAGING/backend" ci
runuser -u onramp -- env HOME=/var/lib/onramp npm --prefix "$STAGING/backend" test
runuser -u onramp -- env HOME=/var/lib/onramp npm --prefix "$STAGING/backend" prune --omit=dev
mv "$STAGING" "$TARGET"
trap - EXIT

PREVIOUS=$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)
ln -s "$TARGET" "$CURRENT_LINK.next"
replace_link "$CURRENT_LINK.next" "$CURRENT_LINK"

systemctl restart "$SERVICE"
if ! backend_is_healthy; then
  if [[ -n "$PREVIOUS" && -d "$PREVIOUS" ]]; then
    ln -s "$PREVIOUS" "$CURRENT_LINK.rollback"
    replace_link "$CURRENT_LINK.rollback" "$CURRENT_LINK"
    systemctl restart "$SERVICE"
    if ! backend_is_healthy; then
      echo "backend health check failed; automatic restore is also unhealthy" >&2
      exit 1
    fi
  else
    systemctl stop "$SERVICE" || true
    rm -f -- "$CURRENT_LINK"
    echo "backend health check failed; no previous release was available" >&2
    exit 1
  fi
  echo "backend health check failed; previous release restored" >&2
  exit 1
fi

printf 'active backend release: %s\n' "$RELEASE_ID"
