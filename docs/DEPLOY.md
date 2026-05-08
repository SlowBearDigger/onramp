# Deploy Guide — GitHub Pages + Render (free tier)

Frontend on GitHub Pages, backend on Render. Both free, both auto-deploy
on push to `main`. Total cost: $0. Total setup time: ~15 minutes.

## What runs where

| Component | Host | Plan | URL pattern |
|---|---|---|---|
| Frontend (Vite SPA) | GitHub Pages | Free | `https://<user>.github.io/<repo>/` |
| Backend (Node + SQLite) | Render | Free | `https://<service>.onrender.com` |

## Free-tier caveats (read these once)

1. **Render service sleeps** after ~15 minutes without traffic. The next
   incoming request (or webhook from Transak) wakes it; cold start is
   ~30 seconds. Transak retries failed webhooks, so eventual delivery
   is fine. The user-visible "Updated Xs ago" might briefly stall.
2. **No persistent disk on Render free**. The SQLite file lives in the
   container's ephemeral filesystem and is wiped on every redeploy or
   sleep-wake cycle. For staging/demo this is acceptable — orders from
   yesterday's testing won't carry over to today's. For production, add
   a Render disk (cheapest is $0.25/GB/mo) and set
   `DB_PATH=/var/data/onramp.db` via the Render UI.
3. **GitHub Pages serves over HTTPS** automatically, so the PWA service
   worker works.

## One-time setup

### 1 — push the repo to GitHub

```bash
cd /path/to/offramp
git init
git add .
git commit -m "Initial commit"
gh repo create onramp --public --source=. --push
```

(or create the repo manually on github.com and push.)

The repo can be **public or private**. GitHub Pages and Actions both have
free tiers that cover either.

### 2 — set up Render (backend)

1. Go to https://dashboard.render.com → sign up with GitHub (no card).
2. Click **New + → Blueprint**.
3. Connect this repo. Render auto-detects `render.yaml` and proposes the
   `onramp-backend` service.
4. Click **Apply**. Render starts the build (will fail on the first run
   because env vars aren't set yet — that's expected).
5. Open the new service → **Environment** tab. Set these (paste the
   values from your local `backend/.env`):

   | Key | Value |
   |---|---|
   | `TRANSAK_API_KEY` | your Transak API Key (public) |
   | `TRANSAK_API_SECRET` | your Transak API Secret (server-side only) |
   | `TRANSAK_REFERRER_DOMAIN` | `https://<user>.github.io` (no path, no trailing slash) |

   **Note on tokens:** Transak's partner access token is a 7-day JWT,
   not the API Secret. Set `TRANSAK_API_SECRET` and the backend will
   auto-mint + cache the access token via their refresh-token endpoint.
   If you only have a pre-generated 7-day token (e.g. emergency rotation),
   set `TRANSAK_PARTNER_ACCESS_TOKEN` instead — but you'll need to
   regenerate it weekly.
   | `CORS_ORIGIN` | `https://<user>.github.io` |
   | `ADMIN_USERNAME` | `admin` (or whatever you want) |
   | `ADMIN_PASSWORD_HASH` | output of `node backend/bin/hash-admin-password.js` |
   | `ADMIN_JWT_SECRET` | 32+ random bytes, base64 |

   To generate a fresh JWT secret:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
   ```

6. Click **Manual Deploy → Deploy latest commit**. Should succeed now.
7. Copy the service URL — looks like `https://onramp-backend.onrender.com`.

### 3 — set up GitHub Pages (frontend)

1. In the GitHub repo → **Settings → Pages**.
2. Under **Source**, pick **GitHub Actions**.
3. Go to **Settings → Secrets and variables → Actions → Variables tab**.
4. Click **New repository variable** and add:

   | Name | Value |
   |---|---|
   | `VITE_API_BASE_URL` | the Render URL from step 2.7 |

5. Push any commit to `main` (or trigger the workflow manually from
   **Actions → Deploy frontend to GitHub Pages → Run workflow**).
6. After ~2 minutes, Pages URL: `https://<user>.github.io/<repo>/`.

### 4 — wire the Transak webhook

1. https://dashboard.transak.com → your partner account → **Webhooks**.
2. Add a new webhook:
   - URL: `https://onramp-backend.onrender.com/webhook/transak/order`
   - Events: tick all `ORDER_*` events.
3. Optionally add the KYC webhook:
   - URL: `https://onramp-backend.onrender.com/webhook/transak/kyc`
   - Events: tick all `KYC_*` events.
4. Save. The first webhook hit may cold-start the Render service —
   subsequent ones land instantly while the service is warm.

## Verifying the deploy

1. Open `https://<user>.github.io/<repo>/`. Landing page should load.
2. Click **Buy Now** → swap form opens. Fill an amount + wallet → pick
   Transak in the comparison. The real Transak STAGING widget should
   open with your provided wallet pre-filled.
3. Open `https://<user>.github.io/<repo>/admin/login`. Log in with
   the credentials you generated. Dashboard should load with empty
   stats (no orders yet).
4. Complete a test purchase in Transak using their staging test card
   (`4111 1111 1111 1111`). Within ~1 minute, the order shows up in
   the admin dashboard and in the user's `/history` (cold-start
   delay if the service was sleeping).

## Updating after the initial deploy

Just push to `main`. Both deploys auto-trigger:
- GH Action builds and publishes the frontend (~2 min)
- Render rebuilds and redeploys the backend (~3 min)

To deploy without changes (e.g. after rotating env vars on Render),
go to the Render service → **Manual Deploy → Deploy latest commit**.

## Migrating off the free tier later

When you outgrow Render free:
- Add a paid disk in Render UI ($0.25/GB/mo) and set `DB_PATH=/var/data/onramp.db`. SQLite becomes persistent.
- Upgrade the service plan ($7/mo Starter) — no more sleep.
- Or move to a real VPS with a domain. The code already runs unchanged
  on any Node 18+ host. Point your DNS at the new IP, update
  `CORS_ORIGIN` and `TRANSAK_REFERRER_DOMAIN` to the new domain, redeploy.

## Troubleshooting

### Pages deploy fails with "Cannot find permission"

Repo Settings → Actions → General → "Workflow permissions" must be set
to **Read and write permissions** OR the workflow's `permissions:`
block must list what it needs (it already does — `pages: write` and
`id-token: write`).

### Frontend loads but `/buy` shows blank

Likely `VITE_API_BASE_URL` is wrong. Open browser dev tools → Console.
You'll see CORS or network errors pointing at the wrong URL. Update
the GitHub repo Variable, re-run the deploy workflow.

### Backend returns 503 admin_not_configured on /admin/login

One of `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `ADMIN_JWT_SECRET` is
missing or malformed. Re-check Render UI → Environment.

### Webhook from Transak returns 401

The Render service is configured but the partner access token doesn't
match what Transak signs with. Re-copy the access token from Transak
dashboard → settings, paste into Render's `TRANSAK_PARTNER_ACCESS_TOKEN`.

### Render service shows "Deploy failed: build failed"

Check the build logs for the exact error. Common ones:
- `better-sqlite3` failing to compile → Render's free tier sometimes
  exhausts memory during native compile. Add `NPM_CONFIG_PRODUCTION=false`
  and retry, or upgrade to Starter for the build.
- Wrong Node version → `render.yaml` doesn't pin a version; Render
  defaults to Node 22 LTS. If we need to pin, add `NODE_VERSION=20` to
  the env vars.
