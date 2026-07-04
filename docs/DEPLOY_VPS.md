# Backend → VPS migration runbook (api.onoff.finance)

Moves the Node backend off Render onto the client's VPS. Motivation: Transak's
mandatory security changes (deadline **2026-07-15**) require a **static egress IP**
(Render free tier has none); the VPS also gives a durable SQLite DB (Render free
wipes it on every redeploy) and no cold-start sleep.

Target: `https://api.onoff.finance` → Caddy (auto-HTTPS) → Node service on
`127.0.0.1:3001`, run by systemd as user `onramp`, DB at `/var/lib/onramp/data.db`.

Everything in `deploy/` is prepared. Steps below are the whole cutover.

---

## 0. Prereqs to hand over (from you / the client)

- [ ] **VPS IP** (the static IP already sent to Transak in the security checklist).
- [ ] **SSH access** for the dev: user + confirm the public key is installed
      (`ssh onramp-admin@<IP>` or root). Debian 12 assumed.

## 1. DNS — `api.onoff.finance` → VPS (Cloudflare)

One A record, grey-cloud (DNS-only) so Caddy can issue the cert directly:

```
Type A · Name api · Content <VPS_IP> · Proxy OFF (grey) · TTL auto
```

> The dev can create this via the Cloudflare API token already on hand, the moment
> the VPS IP is known — it's a one-liner.

## 2. Provision the VPS

SSH in as root (or a sudo user) and run:

```bash
curl -fsSL https://raw.githubusercontent.com/SlowBearDigger/onramp/main/deploy/setup-vps.sh | bash
```

It installs Node 20 + Caddy, clones the repo to `/opt/onramp`, `npm ci` the backend,
and stops with a clear message because `.env` isn't there yet (step 3).

## 3. Secrets — `/opt/onramp/backend/.env`

Fastest: copy the existing local `backend/.env` up and change the 3 VPS-specific lines.

```bash
scp backend/.env  <user>@<VPS_IP>:/tmp/onramp.env
ssh <user>@<VPS_IP> 'sudo mv /tmp/onramp.env /opt/onramp/backend/.env'
```

Then edit `/opt/onramp/backend/.env` and set:

```
TRANSAK_REFERRER_DOMAIN=https://app.onoff.finance
DB_PATH=/var/lib/onramp/data.db
CORS_ORIGIN=https://app.onoff.finance,https://onoff.finance,https://www.onoff.finance
```

(Template with all keys: `deploy/env.production.template`.)

Re-run the setup script — it now installs the systemd service, wires Caddy, and
locks the firewall (only 22/80/443 open; `:3001` stays internal):

```bash
sudo bash /opt/onramp/deploy/setup-vps.sh
```

## 4. Verify the backend on the VPS

```bash
# on the VPS
systemctl status onramp-backend
curl -s localhost:3001/healthz

# from anywhere (once DNS propagated + Caddy cert issued, ~1 min)
curl -s https://api.onoff.finance/healthz
curl -s -i "https://api.onoff.finance/api/quotes/guardarian?fiatCurrency=EUR&cryptoCurrency=BTC&fiatAmount=100&network=bitcoin" \
     -H 'Origin: https://app.onoff.finance' | grep -i access-control-allow-origin
```

## 5. Frontend cutover — point the app at the new backend

Change the repo Actions **Variable** `VITE_API_BASE_URL` from the Render URL to
`https://api.onoff.finance`, then redeploy (push or re-run the Pages workflow):

```bash
gh variable set VITE_API_BASE_URL --repo SlowBearDigger/onramp --body "https://api.onoff.finance"
```

Also add `https://api.onoff.finance` to the frontend CSP `connect-src` in `index.html`
(and drop the old Render origin once fully cut over), then rebuild.

## 6. Post-cutover checks

- [ ] `https://app.onoff.finance` → buy flow opens Transak widget (no CORS error in console).
- [ ] Guardarian pick → redirect handoff works.
- [ ] Admin login works at `/admin/login`.
- [ ] Transak webhook URLs updated to `https://api.onoff.finance/webhook/transak/{order,kyc}`
      in the Transak partner dashboard (client action).

## 7. Rollback

The Render service stays up until we're happy. To roll back: set
`VITE_API_BASE_URL` back to the Render URL + redeploy. Nothing on the VPS is destructive.

---

## Still pending after the move (tracked in LAUNCH_CHECKLIST.md)

- Transak `x-api-key` + `x-user-ip` header changes (deferred; do before 2026-07-15).
  `trust proxy` is already set and Caddy forwards `X-Forwarded-For`, so the end-user IP
  is available at `req.ip` when we wire `x-user-ip`.
- Transak production credentials (still staging).
- Reown project ID for Swap wallet-connect.
