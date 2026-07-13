#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
TMP=$(mktemp -d)
trap 'rm -rf -- "$TMP"' EXIT

sqlite3 "$TMP/source.db" 'CREATE TABLE checks (value TEXT); INSERT INTO checks VALUES ("present");'
printf 'HOST=127.0.0.1\n' > "$TMP/backend.env"

ONOFF_BACKUP_ROOT="$TMP/backups" \
DB_PATH="$TMP/source.db" \
ONOFF_ENV_PATH="$TMP/backend.env" \
  bash "$ROOT/deploy/backup.sh" >/dev/null

BACKUP=$(find "$TMP/backups" -mindepth 1 -maxdepth 1 -type d -print -quit)
test -n "$BACKUP"
test "$(sqlite3 "$BACKUP/data.db" 'SELECT value FROM checks;')" = present
grep -q '^HOST=127.0.0.1$' "$BACKUP/backend.env"
(cd "$BACKUP" && sha256sum -c SHA256SUMS >/dev/null)
! grep -q 'SHA256SUMS$' "$BACKUP/SHA256SUMS"

echo 'backup flow: OK'
