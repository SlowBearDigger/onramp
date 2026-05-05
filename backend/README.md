# offramp-backend

Tiny Express app that:

1. Receives signed webhook callbacks from Transak and persists order state.
2. Exposes a read API (`/api/orders`) that the frontend uses to render the real transaction history.
3. Proxies Transak's public quote lookup so the frontend can fetch prices without CORS headaches.

Portable by design — works on Namecheap cPanel (Passenger), Railway, Render, Fly.io, any VPS, or Docker. No cloud-specific runtimes.

---

## Requirements

- Node.js 18 or newer (Passenger on Namecheap supports 18+ via "Setup Node.js App")
- ~20 MB disk for the SQLite file
- An HTTPS-accessible public URL (so Transak can POST to the webhook)

---

## Local development

```bash
cd backend
cp .env.example .env
# fill TRANSAK_PARTNER_ACCESS_TOKEN when you have it
npm install
npm run dev
```

The server listens on `http://localhost:3001`. Health check:

```bash
curl http://localhost:3001/healthz
# → {"ok":true,"env":"STAGING","ts":...}
```

### Simulating a webhook while you wait for Transak creds

Set `TRANSAK_WEBHOOK_INSECURE=true` temporarily so the backend decodes the JWT without verifying the signature. Then POST a fake payload:

```bash
HEADER=$(echo -n '{"alg":"HS256","typ":"JWT"}' | base64 | tr -d '=' | tr '/+' '_-')
PAYLOAD=$(echo -n '{"eventID":"ORDER_COMPLETED","webhookData":{"id":"ord-1","partnerOrderId":"uuid-1","partnerCustomerId":"0xabc","status":"COMPLETED","fiatCurrency":"USD","fiatAmount":50,"cryptoCurrency":"BTC","cryptoAmount":0.00073,"walletAddress":"0xabc","network":"bitcoin"}}' | base64 | tr -d '=' | tr '/+' '_-')
JWT="$HEADER.$PAYLOAD.sig"

curl -X POST http://localhost:3001/webhook/transak/order \
  -H 'content-type: application/json' \
  -d "{\"eventID\":\"ORDER_COMPLETED\",\"data\":\"$JWT\"}"

curl 'http://localhost:3001/api/orders?customerId=0xabc'
```

Turn `TRANSAK_WEBHOOK_INSECURE` back to `false` before deploying anywhere exposed to the internet.

---

## Deployment

### Option 1 — Namecheap shared hosting (cPanel "Setup Node.js App")

1. In cPanel search for **Setup Node.js App** → **Create Application**.
2. Fill:
   - Node.js version: 18 (or latest 18+ available)
   - Application mode: `Production`
   - Application root: e.g. `offramp-backend`
   - Application URL: e.g. `api.slowbeardigger.dev` (requires the subdomain to exist as an A record → same IP)
   - Application startup file: `app.js`
3. Upload only the `backend/` folder contents into the chosen Application Root via File Manager or SFTP. Do **not** upload `node_modules`, `data.db`, or `.env`.
4. In cPanel → Application page, click **Run NPM Install**.
5. Add environment variables in the "Environment variables" section (DO NOT commit them):
   - `TRANSAK_ENV=STAGING`
   - `TRANSAK_API_KEY=...`
   - `TRANSAK_PARTNER_ACCESS_TOKEN=...`
   - `CORS_ORIGIN=https://slowbeardigger.dev`
   - `PORT` — leave blank; Passenger injects it.
6. Click **Start App** (or **Restart**).
7. Visit `https://api.slowbeardigger.dev/healthz` → should return JSON.
8. Provide `https://api.slowbeardigger.dev/webhook/transak/order` to Transak when registering the webhook.

**Namecheap gotchas:**
- Passenger proxies via Nginx; the app sees requests with `X-Forwarded-For` set. Already handled by `app.set('trust proxy', 1)` (trust one hop).
- If you ALSO put Cloudflare in front (Cloudflare → Nginx → Passenger = 2 hops), the current `trust proxy: 1` lets attackers spoof `X-Forwarded-For` and bypass rate limits. In that case either:
  - Bump to `app.set('trust proxy', 2)` in `app.js`, OR
  - Use Cloudflare's real-client header: add a `keyGenerator` to `express-rate-limit` that reads `req.headers['cf-connecting-ip']` instead of `req.ip`.
- SQLite WAL files (`data.db-shm`, `data.db-wal`) must be writeable in the application root. Default Passenger setups allow this; if you see `SQLITE_CANTOPEN`, check folder permissions (755 / 644 for files).
- better-sqlite3 ships prebuilt binaries for common platforms. If install fails on Namecheap, run `npm rebuild better-sqlite3` from the cPanel terminal.

### Option 2 — Railway / Render / Fly.io

Each platform picks up `package.json` `scripts.start = node app.js` and `engines.node >= 18`. Set the same env vars in their dashboards. SQLite requires a persistent volume:

- **Railway**: add a Volume mounted at `/data`; set `DB_PATH=/data/offramp.db`.
- **Render**: Disk addon, mount at `/var/data`; set `DB_PATH=/var/data/offramp.db`.
- **Fly.io**: `fly volumes create` + `[mounts]` in `fly.toml`; set `DB_PATH=/data/offramp.db`.

### Option 3 — Docker / VPS

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
ENV PORT=3001
EXPOSE 3001
CMD ["node", "app.js"]
```

Run with `-v offramp-data:/app` to persist the SQLite file, or set `DB_PATH` to a mounted volume path.

---

## Production hardening checklist

- [ ] `TRANSAK_WEBHOOK_INSECURE` is unset or `false`.
- [ ] `TRANSAK_PARTNER_ACCESS_TOKEN` is set and matches the Transak Partner Dashboard value.
- [ ] `CORS_ORIGIN` is exactly the frontend origin(s), comma-separated — never `*`.
- [ ] HTTPS is enforced at the reverse proxy level (Namecheap/Nginx/Cloudflare).
- [ ] Database backups are scheduled (just `cp data.db data-$(date).db` on a cron).
- [ ] Monitor `/healthz` from an external uptime check (UptimeRobot free tier works).

---

## API reference

| Method | Path                              | Purpose |
| ------ | --------------------------------- | ------- |
| GET    | `/healthz`                        | Liveness probe |
| GET    | `/api/orders[?customerId=…]`      | List orders (newest first, max 100) |
| GET    | `/api/orders/:id`                 | Single order by Transak order id |
| GET    | `/api/quotes?…`                   | Proxy for Transak public pricing lookup |
| POST   | `/webhook/transak/order`          | Transak calls this with a signed JWT |

Webhook delivers `{ eventID: "ORDER_COMPLETED", data: "<JWT>" }`. The JWT payload is expected to contain `webhookData` with the order fields. Signature is verified with the Partner Access Token (HS256 by default). If Transak confirms a different algorithm during integration, update `verifyOrderWebhook` in `transak.js`.
