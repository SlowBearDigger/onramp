#!/usr/bin/env bash
# OnOff Finance backend — VPS provisioning (Debian 12).
#
# Installs Node 20 + Caddy, clones the repo, installs the backend as a systemd
# service behind Caddy (auto-HTTPS for api.onoff.finance), and locks the
# firewall. Safe to re-run (idempotent-ish). Run as root:
#
#   curl -fsSL https://raw.githubusercontent.com/SlowBearDigger/onramp/main/deploy/setup-vps.sh | bash
#   # or: git clone the repo and `bash deploy/setup-vps.sh`
#
# Before the FIRST run you still need to place the secrets file:
#   /opt/onramp/backend/.env   (see deploy/env.production.template)
# The script clones the repo first, then stops and tells you if .env is missing.
set -euo pipefail

REPO="https://github.com/SlowBearDigger/onramp.git"
APP_DIR="/opt/onramp"
DATA_DIR="/var/lib/onramp"
SVC_USER="onramp"

log() { printf '\n==> %s\n' "$*"; }

log "apt dependencies"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git ca-certificates gnupg build-essential python3 sqlite3 ufw \
  debian-keyring debian-archive-keyring apt-transport-https

log "Node 20 LTS (NodeSource)"
if ! command -v node >/dev/null 2>&1 || ! node -v | grep -q '^v20'; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node -v

log "Caddy (official repo)"
if ! command -v caddy >/dev/null 2>&1; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -y
  apt-get install -y caddy
fi

log "service user + data dir"
id -u "$SVC_USER" >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$SVC_USER"
mkdir -p "$DATA_DIR"
chown -R "$SVC_USER:$SVC_USER" "$DATA_DIR"

log "clone / update repo"
if [ -d "$APP_DIR/.git" ]; then
  runuser -u "$SVC_USER" -- git -C "$APP_DIR" pull --ff-only
else
  install -d -m 0755 -o "$SVC_USER" -g "$SVC_USER" "$APP_DIR"
  runuser -u "$SVC_USER" -- git clone "$REPO" "$APP_DIR"
fi
chown -R "$SVC_USER:$SVC_USER" "$APP_DIR"
GIT_SHA=$(runuser -u "$SVC_USER" -- git -C "$APP_DIR" rev-parse --short HEAD)
RELEASE_ID="$GIT_SHA-$(date -u +%Y%m%dT%H%M%SZ)"

log "npm ci + frontend build"
cd "$APP_DIR"
sudo -u "$SVC_USER" npm ci --legacy-peer-deps
sudo -u "$SVC_USER" env BASE_PATH=/ \
  VITE_API_BASE_URL=https://api.onoff.finance \
  VITE_USE_MOCK=false \
  VITE_ENABLE_PAY=false npm run build

log ".env check"
install -d -m 0750 -o root -g "$SVC_USER" /etc/onoff
if [ ! -f /etc/onoff/backend.env ] && [ ! -f "$APP_DIR/backend/.env" ]; then
  cat >&2 <<EOF

!! MISSING /etc/onoff/backend.env
   Create it before the service can start:
     install -m 0640 -o root -g $SVC_USER $APP_DIR/deploy/env.production.template /etc/onoff/backend.env
     \$EDITOR /etc/onoff/backend.env     # fill secrets
   A legacy $APP_DIR/backend/.env is imported only when the canonical file
   does not exist; it never overwrites a rotated canonical environment.
   Then re-run this script.
EOF
  exit 1
fi
if [ ! -f /etc/onoff/backend.env ]; then
  install -m 0640 -o root -g "$SVC_USER" "$APP_DIR/backend/.env" /etc/onoff/backend.env
else
  chown root:"$SVC_USER" /etc/onoff/backend.env
  chmod 0640 /etc/onoff/backend.env
fi
rm -f -- "$APP_DIR/backend/.env"

log "systemd service"
cp "$APP_DIR/deploy/onramp-backend.service" /etc/systemd/system/onramp-backend.service
systemctl daemon-reload
systemctl enable onramp-backend

log "Caddy reverse proxy"
CADDY_PHASE=${ONOFF_CADDY_PHASE:-pre-dns}
case "$CADDY_PHASE" in
  pre-dns) CADDY_SOURCE="$APP_DIR/deploy/Caddyfile.pre-dns" ;;
  pre-cutover) CADDY_SOURCE="$APP_DIR/deploy/Caddyfile.pre-cutover" ;;
  final) CADDY_SOURCE="$APP_DIR/deploy/Caddyfile" ;;
  *) echo "ONOFF_CADDY_PHASE must be pre-dns, pre-cutover or final" >&2; exit 2 ;;
esac
caddy validate --config "$CADDY_SOURCE" --adapter caddyfile
cp "$CADDY_SOURCE" /etc/caddy/Caddyfile
systemctl reload caddy || systemctl restart caddy

log "frontend release + operations"
ONOFF_SKIP_HEALTHCHECK=true bash "$APP_DIR/deploy/deploy-release.sh" \
  "$APP_DIR/dist" "$RELEASE_ID"
bash "$APP_DIR/deploy/deploy-backend.sh" \
  "$APP_DIR" "$RELEASE_ID"
bash "$APP_DIR/deploy/install-operations.sh"

log "firewall (ssh + http/https only; :3001 stays internal)"
ufw allow OpenSSH 2>/dev/null || ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

log "checks"
sleep 2
systemctl --no-pager --full status onramp-backend | head -n 8 || true
if curl -fsS http://127.0.0.1:3001/healthz >/dev/null 2>&1; then
  echo "backend healthz: OK (localhost:3001)"
else
  echo "backend healthz: FAILED — inspect: journalctl -u onramp-backend -n 50 --no-pager"
fi
echo "Public endpoint (after DNS + Caddy cert): https://api.onoff.finance/healthz"
