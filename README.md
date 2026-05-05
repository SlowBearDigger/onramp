# OnRamp

A multi-provider cryptocurrency on-ramp aggregator built as a Progressive Web App. Users buy crypto without creating an account on our side — they pick a provider (Transak, Mt Pelerin, or Topper), and the provider handles KYC and payment in its own secure widget.

The app is split into:

- **Frontend** — React 19 + Vite 8 + Tailwind 4 + framer-motion, served from `/ramp/` (sub-path), with full PWA support (service worker, manifest, installable).
- **Backend** — Node 18+ with Express, SQLite via `better-sqlite3`, JOSE for JWT signing/verification. Receives provider webhooks, exposes an authenticated admin analytics API, and proxies Transak's pricing endpoint.

---

## Quick start (local development)

You need Node 18+, npm, and (optionally) `rsvg-convert` and ImageMagick if you want to regenerate icons.

### 1. Install

```bash
git clone <repo-url> offramp && cd offramp

# frontend
npm install --legacy-peer-deps

# backend
cd backend && npm install && cd ..

# environment
cp .env.example .env
cp backend/.env.example backend/.env
```

The `--legacy-peer-deps` flag is needed because `vite-plugin-pwa@1.x` declares an outdated peer range against Vite 8.

### 2. Configure

For a fully mock-mode demo (no provider keys needed):

```bash
# .env
VITE_USE_MOCK=true
```

For real Transak (the only provider with full integration today):

```bash
# .env
VITE_USE_MOCK=false
VITE_TRANSAK_API_KEY=<staging key from transak>
VITE_TRANSAK_ENV=STAGING
VITE_API_BASE_URL=http://localhost:3001
```

```bash
# backend/.env
TRANSAK_ENV=STAGING
TRANSAK_API_KEY=<same as VITE_TRANSAK_API_KEY>
TRANSAK_PARTNER_ACCESS_TOKEN=<server-only secret from transak>
CORS_ORIGIN=http://localhost:5173
```

For Mt Pelerin, Topper, and the Admin dashboard, see the dedicated docs (linked below).

### 3. Run

Two terminals:

```bash
# terminal 1 — backend
cd backend && npm run dev
# → [offramp-backend] listening on :3001 — env=STAGING topper=false admin=false

# terminal 2 — frontend
npm run dev
# → http://localhost:5173/ramp/
```

### 4. Build for production

```bash
npm run build
# → dist/ contains static assets ready to upload
```

The backend runs as a long-lived Node process behind nginx/Apache+Passenger or any standard Node host.

---

## Project layout

```
offramp/
├── src/                          frontend
│   ├── App.jsx                   route table (public + /admin)
│   ├── main.jsx                  entry point + i18n init
│   ├── pages/
│   │   ├── LandingPage.jsx
│   │   ├── PrivacyPage.jsx
│   │   ├── TermsPage.jsx
│   │   └── admin/                login + dashboard (English only)
│   ├── components/
│   │   ├── SwapWidget.jsx        the "marca visual integral" — form → compare → payment
│   │   ├── ProviderComparison.jsx parallel-quote cards (compare stage)
│   │   ├── ProviderModal.jsx     iframe wrapper for any provider widget
│   │   ├── BrandLogo.jsx         logo components (BrandMark, BrandLogo, BrandGlyph)
│   │   ├── LanguageSwitcher.jsx  EN/ES/FR/DE picker
│   │   └── admin/                BarChart, StatCard, DateRangePicker
│   ├── providers/                Provider abstraction
│   │   ├── Provider.js           interface + assertIsProvider
│   │   ├── index.js              registry
│   │   ├── transak/index.js      iframe + HS256 webhook
│   │   ├── mtpelerin/index.js    iframe + postMessage events (no webhook)
│   │   └── topper/index.js       iframe + backend-bootstrap + ES256 webhook
│   ├── hooks/
│   │   ├── useProvider.js        generic provider widget orchestrator
│   │   ├── useTransak.js         backwards-compat shim → useProvider
│   │   ├── useOrders.js          history fetching + polling
│   │   └── useAdminAuth.js       JWT session + 30-min idle auto-logout
│   └── i18n/
│       ├── index.js              react-i18next config + supported langs
│       └── locales/{en,es,fr,de}/translation.json
├── backend/
│   ├── app.js                    express server + endpoint wiring
│   ├── db.js                     SQLite schema + upsertOrder / listOrders
│   ├── providers/                per-provider webhook handlers
│   │   ├── transak.js            HS256 JWT verification
│   │   ├── topper.js             ES256 detached JWS verification + bootstrap signing
│   │   └── mtpelerin.js          frontend-event ingest with unverified=1
│   ├── admin/
│   │   ├── auth.js               scrypt + HS256 JWT
│   │   ├── stats.js              SQL aggregations (turnover, daily, monthly)
│   │   └── csv.js                RFC-4180 serializer
│   └── bin/
│       └── hash-admin-password.js  CLI to generate ADMIN_PASSWORD_HASH
├── public/                       PWA assets + .htaccess (CSP)
├── docs/                         see "Documentation" below
└── vite.config.js                PWA + base path /ramp/
```

---

## Documentation

| Topic | File |
| --- | --- |
| Provider integrations (Transak, Mt Pelerin, Topper) — onboarding, env vars, how to add a new provider | [docs/PROVIDERS.md](docs/PROVIDERS.md) |
| Transak-specific setup (request keys, sandbox, KYB, webhooks) | [docs/TRANSAK_SETUP.md](docs/TRANSAK_SETUP.md) |
| Admin dashboard — bootstrap user, security model, endpoint reference | [docs/ADMIN.md](docs/ADMIN.md) |

---

## What this project is — and is not

**It is** an aggregator interface. We never custody crypto, never process payments, never store identity documents. We hold a minimal table of order metadata (wallet address, amounts, status) keyed by the destination wallet — public-key data, not personally identifying.

**It is not** a wallet, an exchange, a money transmitter, or a custodian. Each transaction is contractually between the user and the provider they pick.

This separation matters legally, technically, and ethically. The Privacy Policy (`/privacy`) and Terms of Service (`/terms`) reflect it explicitly.

---

## Provider status

| Provider | Frontend | Backend | Quote API | Status |
| --- | --- | --- | --- | --- |
| Transak | ✅ widget URL builder | ✅ HS256 webhook + quote proxy | ✅ wired via `/api/quotes` | production-ready, needs KYB approval |
| Topper | ✅ widget URL builder + bootstrap fetch | ✅ ES256 detached JWS webhook + bootstrap signing | ⚠️ TODO (stub `/api/quotes/topper` returns 501) | skeleton-ready, needs onboarding |
| Mt Pelerin | ✅ widget URL builder + postMessage forwarding | ✅ unverified-event ingest | ⚠️ TODO (stub `/api/quotes/mtpelerin` returns 501) | skeleton-ready, needs onboarding |

Onboarding instructions for all three are in `docs/PROVIDERS.md`.

---

## Languages

The public surface is translated into 4 locales, switchable via the language picker in the header:

- 🇬🇧 English (reference)
- 🇪🇸 Español
- 🇫🇷 Français
- 🇩🇪 Deutsch

Translations beyond English are a first-pass and **must be reviewed by a native speaker** before going live, especially marketing copy in `landing.*` and transactional copy in `swap.*`. The admin dashboard and legal pages (Privacy / Terms) intentionally remain in English.

Add or edit translations in `src/i18n/locales/<lang>/translation.json`. To add a new language, append it to `SUPPORTED_LANGUAGES` in `src/i18n/index.js`.

---

## Logo and icons

The brand identity is a "convergence" mark — three strokes feeding into a single disc, representing the aggregator metaphor (3 providers → 1 destination).

- Source: `public/favicon.svg` and `src/components/BrandLogo.jsx`
- Generated rasters: `public/{favicon-32, apple-touch-icon, pwa-192, pwa-512}.png`

To regenerate the rasters after editing the SVG (requires `librsvg`):

```bash
brew install librsvg  # if not installed
rsvg-convert -w 192 -h 192 public/favicon.svg -o public/pwa-192.png
rsvg-convert -w 512 -h 512 public/favicon.svg -o public/pwa-512.png
rsvg-convert -w 180 -h 180 public/favicon.svg -o public/apple-touch-icon.png
rsvg-convert -w 32  -h 32  public/favicon.svg -o public/favicon-32.png
```

---

## Security at a glance

- HTTPS-only deployment with strict CSP (see `public/.htaccess`).
- API keys live in `.env` files, never in the bundle. The Transak partner access token and Topper private JWK live exclusively on the backend.
- All webhooks are cryptographically verified before any DB write — Transak via HS256 JWT, Topper via ES256 detached JWS. Mt Pelerin events are explicitly stored as `unverified=1` because Mt Pelerin offers no signed callback.
- Public endpoints are rate-limited; admin login is rate-limited at 5 attempts/min/IP with constant-time username verification to prevent enumeration.
- Admin sessions are 60-minute fixed-window HS256 JWTs with a 30-minute idle auto-logout enforced on the frontend.
- Admin passwords use scrypt (N=16384, r=8, p=1) with timing-safe comparison.

For a deeper threat model and hardening checklist, see [docs/SECURITY.md](docs/SECURITY.md).

---

## License

Private project. All rights reserved unless a `LICENSE` file is added.
