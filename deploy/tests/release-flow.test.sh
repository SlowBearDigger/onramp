#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
TMP=$(mktemp -d)
trap 'rm -rf -- "$TMP"' EXIT

mkdir -p "$TMP/dist-v1/assets" "$TMP/dist-v2/assets" "$TMP/dist-bad/assets"
printf '<!doctype html><script type="module" src="/assets/v1.js"></script>\n' > "$TMP/dist-v1/index.html"
printf '<!doctype html><script type="module" src="/assets/v2.js"></script>\n' > "$TMP/dist-v2/index.html"
printf 'console.log("v1")\n' > "$TMP/dist-v1/assets/v1.js"
printf 'console.log("v2")\n' > "$TMP/dist-v2/assets/v2.js"
printf '<!doctype html><script type="module" src="/assets/missing.js"></script>\n' > "$TMP/dist-bad/index.html"

export ONOFF_WEB_ROOT="$TMP/web"
export ONOFF_FRONTEND_HEALTH_URL="file://$TMP/web/current/index.html"
export ONOFF_SKIP_HEALTHCHECK=true

bash "$ROOT/deploy/deploy-release.sh" "$TMP/dist-v1" release-v1 >/dev/null
grep -q '/assets/v1.js' "$TMP/web/current/index.html"
bash "$ROOT/deploy/deploy-release.sh" "$TMP/dist-v2" release-v2 >/dev/null
grep -q '/assets/v2.js' "$TMP/web/current/index.html"
bash "$ROOT/deploy/rollback-release.sh" release-v1 >/dev/null
grep -q '/assets/v1.js' "$TMP/web/current/index.html"

bash "$ROOT/deploy/deploy-release.sh" "$TMP/dist-bad" release-bad >/dev/null
bash "$ROOT/deploy/rollback-release.sh" release-v1 >/dev/null
if bash "$ROOT/deploy/rollback-release.sh" release-bad >/dev/null 2>&1; then
  echo 'rollback accepted a release with a missing JavaScript asset' >&2
  exit 1
fi
grep -q '/assets/v1.js' "$TMP/web/current/index.html"

echo 'release flow: OK'
