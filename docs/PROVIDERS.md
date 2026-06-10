# Providers

The PWA aggregates three on-ramp providers behind a single SwapWidget:

| Provider | Frontend module | Backend module | Webhook | Quote API |
| --- | --- | --- | --- | --- |
| Transak | `src/providers/transak/` | `backend/providers/transak.js` | yes (HS256 JWT) | yes (proxied at `/api/quotes`) |
| Mt Pelerin | `src/providers/mtpelerin/` | `backend/providers/mtpelerin.js` | **no** — frontend events only | TODO (verify pricing API) |
| Topper | `src/providers/topper/` | `backend/providers/topper.js` | yes (ES256 detached JWS) | TODO (verify pricing API at `api.topperpay.com`) |

All three implement the same `Provider` interface defined at `src/providers/Provider.js`. The registry is at `src/providers/index.js`.

---

## Onboarding credentials

### Transak

See `docs/TRANSAK_SETUP.md` for the full flow. Summary: email `integrate@transak.com` for staging API Key + Partner Access Token. Production requires KYB.

### Mt Pelerin

Mt Pelerin issues an `_ctkn` activation key that is embedded in the widget URL. It is **not self-service** — every partner is onboarded manually.

**Request channel:** email `integrate@mtpelerin.com` or use the contact form linked from `https://developers.mtpelerin.com/`.

**Template message:**

```
Hi Mt Pelerin team,

We'd like to integrate the widget for our consumer onramp/offramp.

Company:            <legal name>
Website:            https://slowbeardigger.dev/ramp
Integration mode:   Widget (iframe) at https://widget.mtpelerin.com/
Products:           On-Ramp + Off-Ramp
Target market:      <countries>
Environment:        STAGING (production after KYB)

Please send:
  • Activation key (_ctkn) — staging
  • Partner Dashboard access (if available)

Thanks!
```

**While you wait:** the test key `bec6626e-8913-497d-9835-6e6ae9edb144` works for **localhost only** (ports 3000 / 3001 / 5173 / 8080). It is intentionally rate-limited and not suitable for any deployed environment. Set it via `VITE_MTPELERIN_CTKN=bec6626e-8913-497d-9835-6e6ae9edb144` in `.env`.

**Webhook reality check:** Mt Pelerin does not deliver server-to-server webhooks. The only signal we get is the in-browser `postMessage` event `paymentSubmitted`. The frontend forwards this to `POST /api/providers/mtpelerin/event` and we persist it with `unverified=1`. Treat all Mt Pelerin volume in the admin dashboard as best-effort, not authoritative.

### Topper

Topper issues:

- A **widget id** (public) — used as the `sub` claim of the bootstrap JWT.
- A **key id** (public) — used as the `kid` header.
- A **private key** (secret, JWK format) — used to sign bootstrap JWTs server-side.
- A **public key** (JWK) — used to verify `X-Topper-JWS-Signature` on incoming webhooks.

**Request channel:** sign up at `https://www.topperpay.com/` for partner access, then onboard via the partner dashboard. Topper's docs portal (`https://docs.topperpay.com/`) lists current contact channels.

**Template message:**

```
Hi Topper team,

We'd like to integrate the crypto-onramp widget for our consumer PWA.

Company:            <legal name>
Website:            https://slowbeardigger.dev/ramp
Integration:        Widget (iframe) — https://app.sandbox.topperpay.com/?bt=…
Products:           Crypto on-ramp (sell may follow)
Target market:      <countries>
Environment:        Sandbox (production after KYB)

Webhook URL:        https://<backend-host>/webhook/topper/order
Algorithm preference: ES256 (P-256)

Please provision:
  • widget id
  • key id
  • ES256 keypair (JWK format)
  • Sandbox dashboard access

Thanks!
```

**Setup once you receive credentials:**

1. Paste the four values into `backend/.env` (`TOPPER_WIDGET_ID`, `TOPPER_KEY_ID`, `TOPPER_PRIVATE_KEY_JWK`, `TOPPER_PUBLIC_KEY_JWK`). All four must be set together — the boot guard in `backend/providers/topper.js` rejects partial config.
2. Set `VITE_TOPPER_ENV=STAGING` in the frontend `.env`.
3. Restart backend. `/healthz` will show `topper: true`.

While Topper is unconfigured, the bootstrap and webhook endpoints return `503` and the frontend's compare card for Topper shows "Quote unavailable" but is still selectable in mock mode.

---

## Adding a new provider

Steps:

1. Create `src/providers/<id>/index.js` exporting a default object that implements the Provider interface (`getMetadata`, `getBootstrap`, `buildWidgetUrl`, `getOrigins`, `parseEvent`).
2. Register it in `src/providers/index.js`.
3. If the provider has webhooks, create `backend/providers/<id>.js` with `verifyOrderWebhook`, `webhookToOrderRow`, and a boot-time config-safety check. Wire `POST /webhook/<id>/order` in `backend/app.js`. Use `express.raw` upstream of the JSON parser if the signature scheme requires the raw body (Topper does; Transak doesn't because it signs an inner JWT field).
4. If the provider has a quote API, add a stub or live endpoint at `/api/quotes/<id>`. Fronted by the SwapWidget's `fetchQuote` helper.
5. Extend the CSP in `public/.htaccess`:
   - Add the widget origin to `frame-src`.
   - Add any backend-side API origin to `connect-src`.
6. Add env vars to both `.env.example` and `backend/.env.example`.
7. Update this file with onboarding instructions.

---

## Open TODOs (skeleton-level)

- **Mt Pelerin quote API** — verify whether `https://api.mtpelerin.com` exposes a public quote endpoint. If yes, replace the 501 stub at `/api/quotes/mtpelerin`.
- **Topper quote API** — same. Look at `docs.topperpay.com/rest-api`.
- **Topper widget postMessage events** — exact event names need verification at `docs.topperpay.com/events/crypto-onramp`. The webhook is the source of truth, but the frontend should mirror at least open/close/created/success states for UX.
- **Mt Pelerin wallet-address ECDSA locking** — requires a connected wallet (MetaMask). Out of scope for the paste-an-address skeleton flow.
- **Admin dashboard `/admin`** — not in the skeleton. The DB schema (`provider`, `unverified` columns, `idx_orders_provider` index) is ready for it.

---

## Guardarian (backup ramp — quote-only)

Status: backend quote integration is LIVE; checkout is intentionally not
wired and the provider is NOT in the frontend registry yet (a quote card
with a dead pick button is worse than no card).

What exists:
- `backend/providers/guardarian.js` — `/v1/estimate` proxy with network
  mapping (ethereum→ETH, bitcoin→BTC, solana→SOL, ...), itemised
  service-fee summing, BUY + SELL (SELL needs an explicit `cryptoAmount`).
- `GET /api/quotes/guardarian` — canonical quote shape, same error
  contract as the other providers (`not_configured` → 503, sell → 501).
- Env: `GUARDARIAN_API_KEY` (server-side only; auth header `x-api-key`).
  Set it in Render → Environment for production quotes.

To activate fully:
1. Decide checkout shape: `POST /v1/transaction` returns a `redirect_url`
   for Guardarian's hosted flow. Verify whether it is iframe-embeddable
   (X-Frame-Options) or must open as a redirect/new tab — this decides
   whether `ProviderModal` can host it or the Provider interface needs a
   `mode: 'redirect'` variant.
2. Add `backend` transaction-create endpoint with strict input validation
   (it has side effects in Guardarian's system — never call it from quote
   loops).
3. Implement `src/providers/guardarian/index.js`, register it, extend the
   CSP frame-src if embedding.
4. Statuses: poll `GET /v1/transaction/{id}` (no webhooks documented) —
   reuse the `unverified` row convention if we ingest frontend-reported
   events, or treat the poll as authoritative.
