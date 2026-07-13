#!/usr/bin/env bash
set -euo pipefail
umask 077

BACKUP_ROOT=${ONOFF_BACKUP_ROOT:-/var/backups/onoff}
DB_PATH=${DB_PATH:-/var/lib/onramp/data.db}
ENV_PATH=${ONOFF_ENV_PATH:-/etc/onoff/backend.env}
RETENTION_DAYS=${ONOFF_BACKUP_RETENTION_DAYS:-14}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
TARGET="$BACKUP_ROOT/$STAMP"

command -v sqlite3 >/dev/null || { echo 'sqlite3 is required' >&2; exit 1; }
[[ "$RETENTION_DAYS" =~ ^[0-9]{1,3}$ ]] || { echo 'invalid retention period' >&2; exit 2; }
test -f "$DB_PATH" || { echo "database missing: $DB_PATH" >&2; exit 1; }

install -d -m 0700 "$BACKUP_ROOT"
install -d -m 0700 "$TARGET"
sqlite3 "$DB_PATH" ".timeout 10000" ".backup '$TARGET/data.db'"
if [[ $(sqlite3 "$TARGET/data.db" 'PRAGMA integrity_check;') != ok ]]; then
  echo 'backup integrity check failed' >&2
  exit 1
fi
chmod 0600 "$TARGET/data.db"

if [[ -f "$ENV_PATH" ]]; then
  install -m 0600 "$ENV_PATH" "$TARGET/backend.env"
fi
if [[ -f /etc/caddy/Caddyfile ]]; then
  install -m 0600 /etc/caddy/Caddyfile "$TARGET/Caddyfile"
fi

(
  cd "$TARGET"
  files=(data.db)
  [[ -f backend.env ]] && files+=(backend.env)
  [[ -f Caddyfile ]] && files+=(Caddyfile)
  sha256sum "${files[@]}" > SHA256SUMS
)
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime "+$RETENTION_DAYS" -exec rm -rf -- {} +
printf 'backup created: %s\n' "$STAMP"
