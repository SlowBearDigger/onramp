#!/usr/bin/env bash
set -euo pipefail

BACKEND_URL=${ONOFF_BACKEND_HEALTH_URL:-http://127.0.0.1:3001/healthz}
FRONTEND_URL=${ONOFF_FRONTEND_HEALTH_URL:-http://127.0.0.1:8081/}
BACKEND=$(curl -fsS --max-time 5 "$BACKEND_URL")
grep -q '"ok":true' <<<"$BACKEND"
HTML=$(curl -fsS --max-time 5 "$FRONTEND_URL")
grep -qi '<!doctype html' <<<"$HTML"
ASSET=$(sed -n 's/.*<script[^>]*src="\([^"]*\.js\)".*/\1/p' <<<"$HTML" | head -n 1)
test -n "$ASSET"
curl -fsS --max-time 5 "${FRONTEND_URL%/}$ASSET" >/dev/null
test -s /var/www/onoff/current/index.html

echo 'onoff health check: OK'
