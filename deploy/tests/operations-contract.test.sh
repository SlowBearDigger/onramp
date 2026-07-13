#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)

required=(
  deploy/deploy-release.sh
  deploy/rollback-release.sh
  deploy/deploy-backend.sh
  deploy/rollback-backend.sh
  deploy/backup.sh
  deploy/healthcheck.sh
  deploy/install-operations.sh
  deploy/onoff-backup.service
  deploy/onoff-backup.timer
  deploy/onoff-healthcheck.service
  deploy/onoff-healthcheck.timer
  deploy/Caddyfile.pre-dns
)

for relative in "${required[@]}"; do
  test -f "$ROOT/$relative" || { echo "missing $relative" >&2; exit 1; }
done

grep -q '/var/www/onoff/current' "$ROOT/deploy/Caddyfile"
grep -q 'https://app.onoff.finance' "$ROOT/deploy/Caddyfile.pre-cutover"
grep -q '^app.onoff.finance {' "$ROOT/deploy/Caddyfile.pre-cutover"
grep -q '^http://app.onoff.finance {' "$ROOT/deploy/Caddyfile.pre-dns"
grep -q 'bind 127.0.0.1' "$ROOT/deploy/Caddyfile.pre-cutover"
grep -q '127.0.0.1:3001' "$ROOT/deploy/Caddyfile"
grep -q '127.0.0.1:8081' "$ROOT/deploy/healthcheck.sh"
grep -q 'ONOFF_FRONTEND_HEALTH_URL' "$ROOT/deploy/deploy-release.sh"
grep -q 'Caddyfile.pre-cutover' "$ROOT/deploy/setup-vps.sh"
grep -q 'Caddyfile.pre-dns' "$ROOT/deploy/setup-vps.sh"
grep -q 'ONOFF_CADDY_PHASE' "$ROOT/deploy/setup-vps.sh"
grep -q 'if \[ ! -f /etc/onoff/backend.env \]' "$ROOT/deploy/setup-vps.sh"
grep -q 'rm -f -- "$APP_DIR/backend/.env"' "$ROOT/deploy/setup-vps.sh"
grep -q 'runuser -u "$SVC_USER" -- git' "$ROOT/deploy/setup-vps.sh"
grep -q 'sqlite3' "$ROOT/deploy/backup.sh"
grep -q 'onoff-backup.timer' "$ROOT/deploy/install-operations.sh"
grep -q 'onoff-healthcheck.timer' "$ROOT/deploy/install-operations.sh"
grep -q '/srv/onoff-app/current/backend' "$ROOT/deploy/onramp-backend.service"
grep -q '/etc/onoff/backend.env' "$ROOT/deploy/onramp-backend.service"
grep -q '^CapabilityBoundingSet=$' "$ROOT/deploy/onramp-backend.service"
grep -q '^SystemCallFilter=@system-service$' "$ROOT/deploy/onramp-backend.service"
grep -q '^ProtectKernelTunables=true$' "$ROOT/deploy/onramp-backend.service"
grep -q 'npm --prefix "$STAGING/backend" test' "$ROOT/deploy/deploy-backend.sh"
grep -q 'npm --prefix "$STAGING/backend" prune --omit=dev' "$ROOT/deploy/deploy-backend.sh"
grep -q -- "--exclude='._\*'" "$ROOT/deploy/deploy-backend.sh"
grep -q 'automatic restore is also unhealthy' "$ROOT/deploy/deploy-backend.sh"
grep -q 'restored release is also unhealthy' "$ROOT/deploy/rollback-backend.sh"
grep -q 'frontend_is_healthy' "$ROOT/deploy/rollback-release.sh"
grep -q "PayRecipientPage-\*.js" "$ROOT/.github/workflows/deploy-frontend.yml"

for script in "$ROOT"/deploy/*.sh "$ROOT"/deploy/tests/*.sh; do
  bash -n "$script"
done

echo 'operations contract: OK'
