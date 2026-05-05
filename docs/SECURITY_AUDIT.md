# Security Audit — On-Ramp Aggregator

**Date:** 2026-05-05
**Scope:** staging deployment (frontend on GitHub Pages, backend on Render free tier)
**Methodology:** black-box dynamic testing against the live deployment + white-box source review of the backend and frontend

This document satisfies §7 of the project spec (*Security audit recommendations*). It is split into two sections: **findings + remediations** (what was tested, what broke, and what was fixed in response) and **residual risk + recommendations for production** (what we accepted for staging, what to harden before going live).

---

## Threat model

The application aggregates third-party crypto on-ramp providers (Transak verified end-to-end, MtPelerin and Topper as skeletons). It does **not** custody crypto, **does not** hold user funds, and **does not** store passwords or PII for end users — wallet addresses are the only user identifier. Critical assets to protect:

| Asset | Where it lives | Compromise impact |
|---|---|---|
| Transak `api-secret` | `backend/.env` only, server-side | Attacker mints widget URLs against our quota, can sign webhooks |
| Admin password hash | `backend/.env` (scrypt) | Attacker reads order data, exports CSV, sees audit trail |
| `ADMIN_JWT_SECRET` | `backend/.env` | Attacker forges admin sessions |
| `VAPID_PRIVATE_KEY` | `backend/.env` | Attacker sends spoofed push notifications |
| `data.db` (SQLite) | Render container ephemeral disk | Order history + audit log + push subscriptions |
| User wallet → orders mapping | `data.db` | Privacy: can correlate wallet to purchases |

Out of scope: production hosting (handed off to Trend IT), MtPelerin and Topper end-to-end flows (provider credentials not yet acquired), wallet-connect-style ECDSA proof-of-ownership.

---

## Findings & remediations

### F1 — HIGH: arbitrary `redirectURL` accepted by widget-url endpoint

**Reported by:** dynamic pentest
**Endpoint:** `POST /api/providers/transak/widget-url`

The `redirectURL` field was forwarded to Transak's session API without validation. `javascript:`, `data:`, and arbitrary attacker domains all returned valid widget URLs.

```bash
curl -sX POST .../api/providers/transak/widget-url \
  -d '{...,"redirectURL":"javascript:alert(document.cookie)"}'
# HTTP 200 — accepted
```

**Attack chain:** Attacker mints a malicious widget URL via our backend, sends it to a victim, victim completes a real Transak purchase, and the post-purchase redirect fires `javascript:` in Transak's widget context (XSS-equivalent, can read Transak's session) or sends the user to a phishing page that mimics our success screen.

**Fix:** [backend/app.js](../backend/app.js) `isAllowedRedirectURL()`. The redirect URL is parsed; only `https`/`http` scheme + a host that appears in `CORS_ORIGIN` is accepted. Anything else returns 400 with `error: invalid_input, fields: [redirectURL]`. Also dropped the `email` field from the forwarded payload since we never used it server-side.

---

### F2 — MEDIUM: push subscription IDOR

**Reported by:** dynamic pentest
**Endpoints:** `POST /api/push/subscribe`, `POST /api/push/unsubscribe`

Anyone could register a push subscription with any wallet address (no proof of ownership). Two attack vectors:

- **Eavesdropping:** attacker subscribes their own device to a victim's wallet. Subsequent order webhooks fan out to all subscriptions including the attacker's, leaking order status, amount, and tx_hash to the attacker's notifications.
- **Silencing:** attacker unsubscribes a victim's known endpoint, dropping their notifications.

**Fix:** [backend/push.js](../backend/push.js) + [backend/app.js](../backend/app.js):

1. **Cap of 5 subscriptions per wallet** (`MAX_SUBSCRIPTIONS_PER_CUSTOMER = 5`). Attacker can't stuff dozens of attacker-owned endpoints under one victim wallet. Existing endpoints can be refreshed (re-subscribe) without consuming a slot.
2. **Tighter rate-limit:** `pushSubscribeLimiter` = 10 req/min/IP, separate from the 60/min global bucket.
3. **Unsubscribe requires endpoint + p256dh + auth.** Knowing the endpoint URL alone is no longer enough — an attacker needs the full subscription material that was generated client-side and only sent to our server. The frontend hook now sends `subscription.toJSON()` for unsubscribe ([usePushNotifications.js:138](../src/hooks/usePushNotifications.js)).

Residual: a determined attacker could still subscribe with a victim's wallet *if their wallet has < 5 active subscriptions*. The proper fix is wallet-signature proof of ownership (sign `"subscribe-onramp-{nonce}"` with the wallet's private key), which requires wallet-connect — out of scope for the current paste-an-address flow. Documented as a follow-up.

---

### F3 — MEDIUM: unauthenticated MtPelerin event endpoint allows order injection

**Reported by:** dynamic pentest
**Endpoint:** `POST /api/providers/mtpelerin/event`

The endpoint accepted attacker-controlled `orderId` and persisted whatever JSON came in (subject to regex validation on currency/network fields). Two amplifiers:

- The id was attacker-chosen, allowing collision with legitimate Transak/Topper order IDs (or replacement of an existing row).
- Stored attacker payload in `raw_payload` (currently never rendered, but a future admin "raw payload" view would surface stored XSS).

**Fix:** [backend/providers/mtpelerin.js](../backend/providers/mtpelerin.js):

1. **id is always server-generated** as `mtpelerin-${randomUUID()}`. Attacker-supplied `orderId` is dropped before the row builder ever sees it ([backend/app.js](../backend/app.js)).
2. **Row builder enforces the prefix.** Defense-in-depth: even if the upstream sanitization regressed, the row builder confirms the id starts with `mtpelerin-`. A row with any other id format is rejected before the upsert.
3. **Tighter rate-limit:** `mtpelerinEventLimiter` = 10 req/min/IP. The legitimate use case (frontend forwarding postMessage events) generates O(1) requests per real transaction.
4. The `unverified=1` flag on every row was already present and is surfaced in the admin dashboard with an orange badge, so even if injection slips through it's clearly marked as best-effort.

The orderId-collision attack is now closed: a synthetic mtpelerin order can never claim the same id as a real order from another provider.

---

### F4 — MEDIUM: widget-url endpoint had no per-IP quota throttle

**Reported by:** dynamic pentest
**Endpoint:** `POST /api/providers/transak/widget-url`

The endpoint shared the global 60/min/IP limiter. Each call mints a real Transak session (counts against our partner quota — Transak rate-limits us at the partner level). At 60/min/IP, an attacker across 10 IPs can drain 600 sessions/min, hitting the partner cap and breaking real users.

**Fix:** [backend/app.js](../backend/app.js): dedicated `widgetUrlLimiter` = 10 req/min/IP. Real users hit `/widget-url` once per purchase attempt — 10 is generous, attackers max at 600/hour from a single IP.

The Transak `apiKey` returned in the `widgetUrl` is publishable by design (Transak labels it that way in their docs); it's not a secret leak. The signing capability lives in `api-secret`, which never leaves the backend.

---

### F5 — LOW: `/healthz` leaked service configuration

**Reported by:** dynamic pentest
**Endpoint:** `GET /healthz`

Old response: `{"ok":true,"env":"STAGING","topper":false,"admin":true,"ts":...}`. An attacker learned which providers were configured and that admin auth was enabled — useful recon for picking attack surfaces.

**Fix:** [backend/app.js](../backend/app.js): trimmed to `{"ok":true}`. Uptime probes still get their 200; recon attackers get nothing. The detailed flags moved out of the public health endpoint; if needed for ops, a future `/api/admin/diagnostics` (gated by admin JWT) can serve them.

---

### F6 — LOW: 503 for unconfigured Topper webhook leaked route presence

**Reported by:** dynamic pentest
**Endpoint:** `POST /webhook/topper/order`

Returning `503: topper_not_configured` confirmed the route exists and Topper is "coming". 404 would have been ambiguous (route doesn't exist OR not configured).

**Fix:** [backend/app.js](../backend/app.js): unconfigured Topper webhook now returns `404: not_found`. Same pattern can be applied to other "soft-disabled" routes if added.

---

### F7 — LOW: no Content Security Policy on the deployed frontend

**Reported by:** dynamic pentest
**Surface:** GitHub Pages doesn't let us set CSP via headers.

We had no CSP. If a stored XSS sneaks in (e.g., a future feature renders `raw_payload`), it has unrestricted access to fetch attacker domains, exfil via beacons, or load attacker scripts.

**Fix:** [index.html](../index.html): meta CSP shipped as part of the served HTML. Highlights:

- `script-src 'self'` — no inline scripts at all (rules out classic reflected XSS payloads).
- `style-src 'self' 'unsafe-inline' …fonts CDNs` — Tailwind 4 needs unsafe-inline for the runtime style tag. Trade-off documented in the comment.
- `connect-src` allowlist: only our backend, CoinGecko (live ticker), and font CDNs. Exfil to attacker.com is blocked.
- `frame-src` allowlist: only the three providers' widget origins. Embedding attacker iframes is blocked.
- `frame-ancestors 'none'` — protects against clickjacking on our own pages.
- `object-src 'none'` — eliminates legacy plugin attack surface.

This is meta-tag CSP which is slightly less strict than header CSP (some directives like `frame-ancestors` are advisory in meta context). Header CSP becomes available once we move to a host that lets us set headers (Cloudflare Pages, Render Static Site, custom CDN).

---

## Confirmed negatives

The pentester also confirmed the following attacks **failed**:

| Attack | Why it failed |
|---|---|
| JWT `alg=none` on admin endpoints | We pin `algorithms: ['HS256']` in `jwtVerify`; any other alg is rejected with `ERR_JOSE_ALG_NOT_ALLOWED`. |
| JWT `alg=none` on Transak webhook | Same — pinned to HS256 in `verifyOrderWebhook`. |
| HS256 forgery against Topper's ES256 verification | `verifyOrderWebhook` (Topper) checks `protectedHeader.alg === 'ES256'` before importing the public key. |
| SQL injection on admin login | We use `better-sqlite3` parameterized queries throughout. `db.prepare(...).run(value)` does not concatenate. |
| Username enumeration on login | We always run scrypt against a "bogus but well-formed" hash when the username is wrong, so timing of the failure path is constant. |
| `X-Forwarded-For` / `True-Client-IP` rate-limit bypass | `app.set('trust proxy', 1)` only trusts a single hop; spoofed XFF values from the client itself are ignored. |
| Path traversal (`/api/orders/../admin/stats`) | Express normalizes the path before routing. |
| `.js.map` source-map exposure | `vite build` does not emit maps in production mode by default (verified — 404 on the deployed `*.js.map` URLs). |
| postMessage origin bypass on widget events | `useProvider`'s `handleMessage` rejects any message whose `event.origin` isn't in the provider's `getOrigins()` allowlist. Verified for Transak, MtPelerin, Topper. |
| CORS reflection | `cors({ origin: CORS_ORIGIN })` matches against an explicit allowlist; non-allowlisted origins receive no `Access-Control-Allow-Origin` header at all. |
| Quote-endpoint parameter injection (CRLF, traversal) | Strict regex validation: `CURRENCY_RE`, `NETWORK_RE`, `SIDE_RE`. Anything that doesn't match returns 400 before the upstream call. |
| Admin endpoints with no token | `requireAdmin` middleware returns `401 missing_token` uniformly. |
| 404 path echo | Backend 404 returns `{"error":"not_found"}` without echoing the request URL. |

---

## Residual risk & production hardening

These are accepted risks for staging that should be addressed before a real production launch:

### R1 — Push subscription IDOR (partial mitigation in place)

The IDOR was raised against (cap + tighter limiter + keyed unsubscribe) but the fundamental issue — anyone can subscribe with someone else's wallet up to the 5-slot cap — is unresolved without wallet-signature ownership proof. **Production fix:** require an EIP-191 / personal_sign signature of `subscribe-onramp:{wallet}:{nonce}` with the wallet's private key, verified server-side.

### R2 — MtPelerin event endpoint is fundamentally untrusted

Even with server-generated IDs, an attacker can still inject `unverified=1` rows for arbitrary wallets. The orange "Unverified" badge is the user-visible mitigation, but admin volume metrics are inflated by the injected rows. **Production fix:** require a session token issued by the backend when the swap form opens (POST `/api/sessions/start` returns a short-lived token; the mtpelerin event endpoint validates the token).

### R3 — SQLite is ephemeral on Render free tier

Every redeploy or sleep-wake wipes orders, audit log, and push subscriptions. Acceptable for staging (data is non-critical), unacceptable for production. **Production fix:** Render persistent disk ($0.25/GB/mo) with `DB_PATH=/var/data/onramp.db`, OR migrate to Postgres on a managed service, OR move to a VPS with backups.

### R4 — No Sentry / observability

Runtime errors only show in Render's console.log stream. No alerting on auth failures spike, webhook signature failures, or quota exhaustion. **Production fix:** wire Sentry (free tier covers 5k events/mo) or self-hosted Glitchtip.

### R5 — Audit log can be filled by login-failure spam

`login.failure` events are logged regardless of validity. An attacker who wants to hide their tracks could spam thousands of failures to push real entries off the dashboard's "last 25" view. **Production fix:** the existing `vacuumAudit({ keep: 10000 })` helper can be cron'd; or add per-IP failure throttling on top of the rate-limiter.

### R6 — No CSRF protection on /api/push/* and /api/providers/mtpelerin/event

These endpoints accept JSON from any origin (CORS allowlist gates the *browser*, but a server can call them directly). Fix would require a session cookie + CSRF token, which the current passwordless model doesn't have. **Production posture:** rate-limits + the fixes in F2/F3 reduce blast radius; a passwordless app fundamentally has weaker server-confirmed-identity guarantees than one with sessions.

### R7 — Webhook replay

We don't track JWT `jti` (JWT ID) for webhooks. A captured Transak webhook JWT could be replayed within its validity window (no `exp` claim is enforced beyond what Transak signs). The DB upsert is idempotent on `id`, so replay re-writes the same row — minimal impact, but a deliberate attacker could replay an old `ORDER_COMPLETED` event after the order was actually `REFUNDED`, downgrading the visible state. **Production fix:** record `(eventID, payload.id)` in a `webhook_events_seen` table and reject duplicates.

### R8 — VAPID keys in repo

`backend/.env` contains the VAPID private key. It's gitignored, but the value is in the deployed Render environment. **Production posture:** rotate VAPID keys before going live, store the new ones in a secrets manager (Render's encrypted env vars are fine for shared-tenant; for stricter posture, a managed secrets service).

### R9 — No dependency vulnerability scanning

`npm audit` not currently part of CI. **Production fix:** GitHub Dependabot is free for public repos; or `npm audit --audit-level=high` as a CI gate. The current snapshot was clean as of audit date.

### R10 — Admin session stateless

The admin JWT can't be revoked individually — only the global `ADMIN_JWT_SECRET` rotation invalidates everything. Acceptable for single-admin staging; for multi-admin production, add a `revoked_jwts` table or migrate to opaque session tokens stored server-side.

---

## Hash digest of this audit

This document corresponds to commit `<filled-at-merge>`. Every finding above maps to a commit in the project history; see `git log -- backend/app.js backend/push.js backend/providers/mtpelerin.js index.html` for the audit trail.
