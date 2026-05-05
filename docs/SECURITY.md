# Security model

This document describes how OnRamp is hardened against common threats and what assumptions we make. It complements the Privacy Policy (which covers what data we touch) and the Provider docs (which cover the per-provider integrations). Read this if you are deploying, auditing, or extending the system.

## Trust boundaries

```
┌─────────────────┐    HTTPS+CSP    ┌──────────────────┐    HTTPS    ┌────────────────────┐
│  user browser   │ ───────────────►│  static frontend │ ───────────►│  provider widgets  │
│  (untrusted)    │                 │  (slowbeardigger │   iframe    │  (transak / mtpel  │
│                 │                 │   .dev/ramp)     │             │   /topper origins) │
└────────┬────────┘                 └──────────────────┘             └─────────┬──────────┘
         │                                                                     │
         │ /api/...                                                            │ webhook
         ▼                                                                     ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                                  backend (node)                                       │
│  - rate-limited public endpoints                                                      │
│  - cryptographically verifies every webhook before any DB write                       │
│  - JWT-gated /api/admin/*                                                             │
│  - sqlite (single-process, file-backed, WAL)                                          │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

The threat model treats:

- The **user browser** as fully untrusted (XSS, devtools tampering, MITM in flight).
- The **iframe widgets** as semi-trusted (we strict-validate origins on every postMessage, but accept their UI flows as a black box).
- The **backend** as trusted execution but exposed to the public internet — every endpoint assumes hostile callers until proven otherwise.
- **Mt Pelerin events** as untrusted in a stronger sense: there is no signed callback, so we explicitly mark them `unverified=1` in the DB.

## Hardening checklist (current state)

### Transport

| Control | Where | Status |
| --- | --- | --- |
| HTTPS-only deployment | `public/.htaccess` (Apache) — set up `Strict-Transport-Security` | deployment-time |
| `upgrade-insecure-requests` directive | `public/.htaccess` CSP | ✅ |
| Redirect HTTP → HTTPS | `public/.htaccess` | deployment-time |

### Content Security Policy

| Directive | Value | Notes |
| --- | --- | --- |
| `default-src` | `'self'` | strict default |
| `script-src` | `'self'` | no inline JS, no eval |
| `style-src` | `'self' 'unsafe-inline' https://fonts.googleapis.com` | `unsafe-inline` is required by Tailwind 4 + framer-motion's runtime style injection |
| `img-src` | `'self' data: blob: https:` | crypto icon CDNs need `https:` |
| `connect-src` | `'self'` + provider API origins | locked to known upstreams |
| `frame-src` | provider widget origins only | locked to known upstreams |
| `frame-ancestors` | `'self'` | clickjacking defense |
| `object-src` | `'none'` | disables plugins / Flash leftovers |
| `base-uri` | `'self'` | prevents `<base>` injection redirecting relative URLs |
| `form-action` | `'self'` | forms submit only to us |

### Backend hardening

| Control | Implementation |
| --- | --- |
| `helmet` middleware | applied with `crossOriginResourcePolicy: 'cross-origin'` so widget origins can fetch us, CSP disabled (handled by static frontend `.htaccess`) |
| CORS allowlist | `CORS_ORIGIN` env var, comma-separated; trimmed and empties dropped to defend against trailing-comma misconfig |
| Trust proxy | `app.set('trust proxy', 1)` — assumes one hop (Apache/Passenger or nginx); see `backend/README.md` if behind Cloudflare for guidance |
| JSON body size cap | `express.json({ limit: '50kb' })` and `express.raw({ limit: '50kb' })` for the topper webhook |
| Rate limits | `apiLimiter` 60/min and `webhookLimiter` 60/min (separate counters); admin `loginLimiter` 5/min/IP with `skipSuccessfulRequests` |
| Input validation | tight regex per shape: `CUSTOMER_ID_RE`, `ORDER_ID_RE`, `CURRENCY_RE`, `NETWORK_RE`, `SIDE_RE`, `PROVIDER_RE` — reject control chars and overlong inputs at the boundary |
| Outgoing redirects | `redirect: 'error'` on all upstream `fetch()` calls so the upstream can't bounce us to internal hosts |
| Outgoing timeouts | 4–5 s `AbortController` on every upstream call to prevent socket leaks |
| Error detail leakage | upstream error messages are logged server-side but the response body is generic (`upstream_error`) |
| WAL-mode SQLite | `journal_mode=WAL` for crash safety and concurrent reads |

### Webhook authentication

| Provider | Algorithm | Key location | Verified before DB write? |
| --- | --- | --- | --- |
| Transak | HS256 JWT (the `data` field of the request body is itself the signed JWT) | `TRANSAK_PARTNER_ACCESS_TOKEN` (server only) | ✅ via `verifyOrderWebhook()` in `backend/providers/transak.js`; `eventID` is read from the *signed* payload, never the outer body, to prevent confusion attacks |
| Topper | ES256 detached JWS (`X-Topper-JWS-Signature` header signs the raw body) | `TOPPER_PUBLIC_KEY_JWK` (server only) | ✅ via `verifyOrderWebhook()` in `backend/providers/topper.js`; the raw body is base64url-encoded and reattached as the JWS payload, then `compactVerify` runs — the algorithm is pinned to ES256 to prevent alg-confusion |
| Mt Pelerin | none — provider does not deliver webhooks | n/a | ❌ events are stored with `unverified=1`; admin dashboard surfaces this distinction in every total |

Algorithm pinning is critical: `verifyTransakWebhook` calls `jwtVerify(..., { algorithms: ['HS256'] })` and `verifyTopperWebhook` enforces `alg === 'ES256'` before importing the key. This blocks the classic JWT confusion vulnerability where an attacker downgrades to `none` or swaps an HS256 token for an RS256 verification path.

There is a development escape hatch (`TRANSAK_WEBHOOK_INSECURE=true`) that decodes the JWT without signature verification. It is rejected at boot if `NODE_ENV=production` or `TRANSAK_ENV=PRODUCTION`. See `assertWebhookConfigSafe()`.

### Topper bootstrap signing

The topper widget requires a JWT signed by us with our private key, valid 3 minutes. The signing happens exclusively in `backend/providers/topper.js` — the private JWK lives in `TOPPER_PRIVATE_KEY_JWK` and never reaches the bundle. The frontend fetches a fresh token per session via `POST /api/providers/topper/bootstrap`. This endpoint:

- requires Topper to be fully configured (or returns 503),
- validates source/target/partner shapes via the shared regexes,
- never echoes the input back if validation fails.

The simulation endpoint (`/api/quotes/topper`) signs a separate quote-only JWT without `recipientEditMode` and with no real wallet address, so a mistakenly-leaked simulation token cannot be used to drive a real payment to an attacker-controlled wallet.

### Admin authentication

| Concern | Control |
| --- | --- |
| Password storage | scrypt(N=16384, r=8, p=1), 16-byte salt, 32-byte derived key, encoded as `scrypt$N$r$p$<salt>$<key>` |
| Comparison | `crypto.timingSafeEqual` on the derived key |
| Username enumeration | wrong-username path always runs scrypt against a well-formed dummy hash, so timing matches the wrong-password path |
| Brute force | `loginLimiter` 5/min/IP; successful logins skip the count |
| Session | HS256 JWT in browser localStorage, 60-minute fixed window |
| Session revocation | rotate `ADMIN_JWT_SECRET` to invalidate every live token |
| Idle timeout | frontend enforces 30 minutes via `useAdminAuth.js` (mousemove, keydown, click, scroll, touchstart events reset the timer) |
| Endpoint protection | `requireAdmin` middleware on every `/api/admin/*` route |
| Partial config | `assertAdminConfigSafe()` at boot fails fast unless ALL of `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `ADMIN_JWT_SECRET` are set together |
| Secret strength | `ADMIN_JWT_SECRET` must be ≥ 32 chars, enforced at boot |

### Frontend

| Concern | Control |
| --- | --- |
| Provider postMessage events | `useProvider.handleMessage` validates `event.origin` against the picked provider's `getOrigins()` allowlist before parsing — messages from any other origin are dropped silently |
| `iframe` sandboxing | `<iframe sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals" allow="camera;fullscreen;payment">` — minimum required for the widgets to work, microphone explicitly excluded |
| iframe `referrerPolicy` | `no-referrer` so widget URLs don't leak our path to providers' analytics (they get the apiKey explicitly anyway) |
| Wallet locking | wallet address passed as widget URL param + `disableWalletAddressForm=true` (Transak) and `recipientEditMode='not-editable'` (Topper) so users can't be tricked mid-flow into editing the destination |
| UUID generation | `crypto.randomUUID()` with a `crypto.getRandomValues` fallback; `Math.random()` is never used for security-sensitive values |
| XSS surface | React escapes everything by default; no `dangerouslySetInnerHTML` anywhere in the codebase; user-supplied wallet addresses are rendered as text only |

## Data minimisation

The DB stores only:

- destination wallet address (pseudonymous, not PII)
- transaction amounts and statuses
- partner-side identifiers (UUIDs we generate)
- raw webhook payloads (for audit; redact if ever exporting)

No emails, names, phones, payment cards, or identity documents touch our infrastructure. Those are collected directly by the provider you choose, under their own privacy policies. See `/privacy` for the user-facing version of this commitment.

## Operational guidance

- **Rotate `ADMIN_JWT_SECRET`** any time an admin is removed, a credential is suspected leaked, or after a known security incident. This invalidates every live admin session immediately.
- **Rotate `TRANSAK_PARTNER_ACCESS_TOKEN`** by requesting a new one from Transak partner support; the previous token's webhooks will start failing — schedule a rotation window.
- **Rotate Topper keys** by generating a new keypair, asking Topper to update their record of your public JWK, then updating `TOPPER_PUBLIC_KEY_JWK` and `TOPPER_PRIVATE_KEY_JWK` in `backend/.env`. Restart the backend.
- **Back up `backend/data.db`** daily. SQLite WAL-mode files copy safely while the server is running. Suggested: `cp backend/data.db backups/data-YYYY-MM-DD.db` on a cron.
- **Monitor `/healthz`** with an external uptime check. The endpoint reports env, topper state, and admin state, but not secrets.
- **Watch backend logs** for `[transak webhook] verify failed`, `[topper webhook] verify failed`, `[topper bootstrap] failed`, and rate-limit hits — sustained patterns are likely an attempt to forge transactions or enumerate orders.

## Known limitations / accepted risk

- **Mt Pelerin events are unverified.** Anyone with browser devtools can call our `/api/providers/mtpelerin/event` endpoint and synthesize a transaction record. We accept this because the alternative (no Mt Pelerin analytics at all) is worse, and the dashboard is honest about it: every total in the admin UI splits verified vs unverified, and the CSV export has a `Verified` column. **Do not** trust unverified totals for revenue reconciliation.
- **localStorage session tokens.** The admin JWT lives in `localStorage`. If the admin laptop is XSS'd we lose the session until the secret is rotated. Mitigation: tight CSP (no inline scripts, no eval), a single admin user surface (the dashboard has no third-party widgets), and a 60-minute session ceiling. For an upgrade, switch to httpOnly cookie (requires backend setting `secure; samesite=strict; httpOnly` on a `Set-Cookie` and reading credentials from `req.cookies`).
- **No audit trail of admin reads.** The admin GET endpoints aren't logged per-call. Add request logging (e.g. `morgan` + a dedicated log file) before any compliance regime that requires read auditing.
- **No 2FA on admin login.** Single-admin scenario tolerated; a TOTP layer (e.g. via `otplib`) is straightforward to add when there are multiple admins.

## Reporting a vulnerability

Email security reports to slowbeardigger@proton.me with subject `[SECURITY] OnRamp …`. Encrypted email is welcome. Please do not file public GitHub issues for unpatched vulnerabilities.
