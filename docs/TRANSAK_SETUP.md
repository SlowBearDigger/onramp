# Transak integration — setup guide

End-to-end steps to move the app from **mock demo** to **real Transak staging**, and later to **production**.

---

## 0. Overview of the architecture

```
┌──────────────────┐   widget iframe     ┌─────────────────────────┐
│  Frontend (PWA)  │  ─────────────────► │ global-stg.transak.com  │
│  slowbeardigger  │  ◄── postMessage    │ (Transak hosted widget) │
│      .dev/ramp   │       events        └────────────┬────────────┘
└────────┬─────────┘                                  │
         │ /api/orders                                │ signed webhook
         ▼                                            ▼
┌──────────────────┐                       ┌──────────────────────┐
│  Backend (Node)  │ ◄───────────────────  │  POST /webhook/…     │
│  Express+SQLite  │   JWT verified with   │                      │
│  "offramp-be"    │   Partner Access      └──────────────────────┘
└──────────────────┘   Token (HS256)
```

Two credentials matter:

| Credential               | Who knows it               | Where it lives                    |
| ------------------------ | -------------------------- | --------------------------------- |
| **API Key**              | Public — embedded in URL    | `VITE_TRANSAK_API_KEY`, `TRANSAK_API_KEY` |
| **Partner Access Token** | Secret — **backend only**   | `TRANSAK_PARTNER_ACCESS_TOKEN` (backend `.env`) |

The widget iframe + postMessage handle the UI flow. The webhook is what the backend treats as the source of truth for order history.

---

## 1. Request staging credentials from Transak

Transak is **not self-service** — every partner is onboarded manually.

### How to request

Either channel works; email gives the fastest paper trail:

- **Email**: `integrate@transak.com`
- **Form**: go to <https://docs.transak.com/> and use the "Need help in Integration" link in the top nav.

### What to include in the first message

Paste this as a starting template:

```
Hi Transak team,

We'd like to enable widget-based integration for our consumer onramp/offramp.

Company:            <legal name>
Website:            https://slowbeardigger.dev/ramp
Integration mode:   Widget (iframe) with postMessage events
Products:           On-Ramp + Off-Ramp
Target market:      <countries>

Environment:        STAGING (production to follow after KYB)

Order webhook URL (staging): https://<backend-host>/webhook/transak/order
KYC webhook URL (staging):   n/a — we are not using Whitelabel / KYC Reliance

Please send:
  • API Key (staging)
  • Partner Access Token (staging)
  • Partner Dashboard access

Thanks!
```

Replace `<backend-host>` with whichever public URL you'll deploy the backend to (`api.slowbeardigger.dev` or the Namecheap-assigned host).

### What they send back

- An **API Key** — you can paste this anywhere (frontend), it's public.
- A **Partner Access Token** — **treat like a password**, server-side only.
- An invitation to the **Partner Dashboard** (metrics, testing).

Timeline: usually same-week for staging; production requires KYB (1–2 weeks, corporate docs review).

---

## 2. Plug the credentials in

### Frontend

```bash
cp .env.example .env
```

Edit `.env`:

```
VITE_TRANSAK_API_KEY=<paste the staging API key>
VITE_TRANSAK_ENV=STAGING
VITE_API_BASE_URL=http://localhost:3001   # or the public backend URL once deployed
VITE_USE_MOCK=false
```

### Backend

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:

```
TRANSAK_ENV=STAGING
TRANSAK_API_KEY=<same API key as frontend>
TRANSAK_PARTNER_ACCESS_TOKEN=<SECRET — partner access token from Transak>
TRANSAK_WEBHOOK_INSECURE=false
CORS_ORIGIN=http://localhost:5173,https://slowbeardigger.dev
PORT=3001
```

---

## 3. Smoke test locally

Terminal 1 — backend:
```bash
cd backend && npm install && npm run dev
```

Terminal 2 — frontend:
```bash
npm install && npm run dev
```

Now in the browser:

1. Open `http://localhost:5173/ramp/`.
2. Click **Buy Now** → fill amount + a test wallet address.
3. Click **Buy Bitcoin** → the Transak modal should open and load the staging widget.
4. Use Transak's staging test card (they provide one in the Partner Dashboard — usually `4000 0000 0000 0002` with any valid expiry/CVV).
5. Complete the flow inside the widget.
6. The modal emits `TRANSAK_ORDER_SUCCESSFUL` → frontend state updates.
7. Transak POSTs the webhook to your backend → SQLite row is inserted.
8. Navigate to **History** tab → the real order shows up (may take a few seconds).

Note on step 7: during local dev, Transak cannot reach `http://localhost:3001` from the internet. Options:
- Use [ngrok](https://ngrok.com/) or [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) to expose `localhost:3001` with a temporary public URL, then tell Transak support to update the webhook URL for your staging environment.
- Or deploy the backend first (Namecheap/Railway) and only work on the frontend locally pointing `VITE_API_BASE_URL` at the deployed backend.

---

## 4. Production checklist (after KYB approval)

- [ ] Request production credentials with a similar email (mention staging integration is live).
- [ ] Transak provides separate prod API Key + Partner Access Token.
- [ ] Deploy backend to a stable public URL (Namecheap cPanel works; see `backend/README.md`).
- [ ] Register the **production** webhook URL with Transak: `https://<prod-backend>/webhook/transak/order`.
- [ ] Frontend production `.env`:
  ```
  VITE_TRANSAK_API_KEY=<prod key>
  VITE_TRANSAK_ENV=PRODUCTION
  VITE_API_BASE_URL=https://<prod-backend>
  VITE_USE_MOCK=false
  ```
- [ ] Backend production `.env` mirrors with prod credentials.
- [ ] `TRANSAK_WEBHOOK_INSECURE` is unset or `false`.
- [ ] CSP in `public/.htaccess` includes both prod and staging widget origins (already configured).
- [ ] Terms of Service page is live and references Transak's Terms of Service (required by Transak's partner agreement).
- [ ] Privacy Policy page is live (data processing section covers Transak).
- [ ] Monitor `/healthz` with an external uptime check.
- [ ] Set up a daily SQLite backup (just `cp data.db backups/data-YYYY-MM-DD.db`).

---

## 5. Troubleshooting

| Symptom                                                    | Likely cause / fix |
| ---------------------------------------------------------- | ------------------ |
| Modal opens blank                                          | `VITE_TRANSAK_API_KEY` is missing or wrong → check browser devtools for the widget URL. |
| `TRANSAK_ORDER_SUCCESSFUL` fires but history stays empty   | Webhook not reaching backend. Check Transak dashboard → webhook logs; check `/healthz` is publicly reachable. |
| Backend logs `webhook: verify failed`                      | Partner Access Token mismatch OR algorithm is not HS256. Temporarily set `TRANSAK_WEBHOOK_INSECURE=true` to inspect the JWT; then contact Transak support to confirm algo. |
| CSP console errors after deploy                            | Add the offending origin to `frame-src`/`connect-src` in `public/.htaccess`. |
| "postMessage ignored" in devtools                          | Origin validation dropped a message — double-check the widget URL points at a domain in `TRANSAK_ORIGINS` in `src/providers/transak.js`. |

---

## 6. Going whitelabel later (optional)

Whitelabel API (full UI ownership, our own KYC) is a bigger lift:
- Requires backend to drive every step (OTP, KYC, quotes, orders).
- Does NOT support off-ramp currently — so we'd lose the Sell flow.
- Needs IP-allowlisting of the backend's egress IPs with Transak.

Not recommended for v1. Revisit if the iframe styling ever becomes limiting.
