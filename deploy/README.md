# VPS Operations

## Build and Stage

Build the frontend with the root base path and production API origin:

```bash
BASE_PATH=/ VITE_API_BASE_URL=https://api.onoff.finance VITE_USE_MOCK=false npm run build
```

Copy `dist/` to a temporary VPS directory, then activate it with a unique release ID:

```bash
sudo /usr/local/libexec/onoff/deploy-release /tmp/onoff-dist <git-sha>
```

The command verifies `http://127.0.0.1:8081/` after atomically switching `/var/www/onoff/current`. A failed check restores the previous release.

## Rollback

List releases and choose the exact target rather than guessing:

```bash
ls -1 /var/www/onoff/releases
sudo /usr/local/libexec/onoff/rollback-release <release-id>
```

Backend releases are deployed from a repository checkout. Dependencies are installed inside the new release before the service is switched:

```bash
sudo /usr/local/libexec/onoff/deploy-backend /opt/onramp <git-sha>
sudo /usr/local/libexec/onoff/rollback-backend <release-id>
```

The deploy command runs the complete backend test suite before switching the service and removes development dependencies afterward. Backend secrets live only in `/etc/onoff/backend.env`; release archives explicitly exclude `.env`, databases and `node_modules` from the source checkout.

## Timers and Logs

```bash
systemctl list-timers 'onoff-*'
journalctl -u onoff-healthcheck.service -n 50 --no-pager
journalctl -u onoff-backup.service -n 50 --no-pager
```

Backups live in `/var/backups/onoff`, are root-only, use SQLite's consistent backup command, and retain 14 days by default.

## DNS Cutover

Use `deploy/Caddyfile.pre-dns` before any frontend DNS record points to the
VPS. After changing only `app.onoff.finance` to the VPS, install
`deploy/Caddyfile.pre-cutover`; it obtains HTTPS for the app host while the
apex still points to the old host. Install `deploy/Caddyfile` only when the
apex moves; it makes `onoff.finance` canonical and redirects `app` to it.

`setup-vps.sh` installs the pre-DNS configuration by default. Every public
phase change is explicit:

```bash
sudo ONOFF_CADDY_PHASE=pre-cutover bash deploy/setup-vps.sh
sudo ONOFF_CADDY_PHASE=final bash deploy/setup-vps.sh
```

DNS is changed only after all of these pass:

1. `curl http://127.0.0.1:8081/` returns the SPA shell on the VPS.
2. `curl http://127.0.0.1:3001/healthz` returns `{"ok":true}`.
3. `caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` succeeds.
4. A host-resolved request to the VPS returns the correct frontend and API.
5. The previous GitHub Pages deployment remains available for rollback during the initial DNS TTL window.
