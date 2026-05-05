# OnRamp — Admin Guide

This guide is for the operator of the admin dashboard: setup, day-to-day
use, security posture, and troubleshooting. The dashboard is a
read-mostly view into the orders database and the audit log; it does not
process payments, refund users, or interact with provider widgets.

## Accessing the dashboard

| Environment | URL |
|---|---|
| Local dev | `http://localhost:5173/ramp/admin/login` |
| Staging | `https://<staging-domain>/ramp/admin/login` |
| Production | `https://<prod-domain>/ramp/admin/login` |

The path lives under `/ramp/` because the Vite build sets
`base: '/ramp/'`. If you change the base path in `vite.config.js`, the
admin URL changes too.

## Initial setup

The admin dashboard is **disabled by default**. Three environment
variables must be set on the backend together; setting any one without
the others fails the boot guard.

In `backend/.env`:

```
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=<scrypt hash — see below>
ADMIN_JWT_SECRET=<at least 32 random bytes, base64>
```

### Generating the password hash

Passwords are stored as scrypt-derived hashes. The plaintext never
leaves your machine. To produce a hash:

```bash
echo -n 'YourLongPassword' | node backend/bin/hash-admin-password.js
# prints: scrypt$16384$8$1$<salt>$<derived-key>
```

Paste the output into `ADMIN_PASSWORD_HASH`. Minimum length is 12
characters; we recommend 16+ with mixed case and a symbol.

### Generating the JWT secret

The session JWT is signed with `ADMIN_JWT_SECRET`. Must be at least 32
characters. Generate with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

Rotating this secret **invalidates every live admin session**, which
is the recommended response to any suspicion of compromise.

### Boot verification

Restart the backend. You should see:

```
[offramp-backend] listening on :3001 — env=STAGING topper=false admin=true
```

If `admin=false`, one of the three vars is missing or the password
hash isn't in the expected `scrypt$N$r$p$salt$key` format. The boot
also throws if `ADMIN_JWT_SECRET.length < 32`.

## Logging in

1. Open `/ramp/admin/login`.
2. Enter username and password.
3. On success, you land on the dashboard. The session cookie (technically
   a JWT in `localStorage`) is valid for 60 minutes maximum.
4. After 30 minutes of inactivity (no mouse, keyboard, scroll, or
   click), the session auto-logs out. This is enforced client-side
   independently of the JWT expiry — even if someone leaves a tab
   open, it logs them out.

Failed logins are rate-limited to 5 attempts per minute per IP; the
counter does NOT reset on success, so a real admin won't get locked
out by their own typos.

## Dashboard sections

### Summary cards

Top-of-page cards show, for the selected date range:

- **Total volume** — sum of `fiat_amount` for orders in
  `COMPLETED`, `PROCESSING`, or `PAYMENT_SUBMITTED_UNVERIFIED` (the
  last one being Mt Pelerin best-effort frontend events).
- **Total transactions** — count of the same.
- **Unique wallets** — distinct `customer_id` (wallet address) per
  month. Approximation of unique users.

### Provider breakdown

One card per registered provider (`Transak`, `Mt Pelerin`, `Topper`)
with the same shape: volume + transaction count, plus an "Unverified"
sub-row when applicable (Mt Pelerin only).

### Trends

Two bar charts: daily volume and monthly volume across the selected
range, color-coded per provider.

### Recent admin activity (audit log)

The bottom panel lists the last 25 audit events:

- `login.success` — successful logins (green badge).
- `login.failure` — failed login attempts. The attempted username is
  captured but the password is **never** stored or even passed to the
  audit module. Useful for spotting brute-force probes.
- `logout` — explicit user-initiated logout.
- `logout.idle` — auto-logout fired by the 30-min idle timer.
- `csv.export` — CSV export downloaded (with the date range queried
  in the `detail` field, so a security review can tell which window
  of data left the system).
- `transak.kyc` — KYC webhook events from Transak (KYC_SUBMITTED /
  KYC_APPROVED / KYC_REJECTED). Logged here for ops correlation;
  not surfaced in the user-facing history.

Each row shows timestamp, action, user (when applicable), and IP.
Click "Refresh" to re-fetch.

## Date range selector

The picker at the top of the dashboard accepts custom ranges or
quick presets (last 7 / 30 / 90 days). Hard cap is **2 years per
request** to bound query cost on the SQLite backend.

## CSV export

Click the **Download CSV** button to export daily volume by provider
across the selected range. Columns:

```
Date, Provider, Transaction Count, Total Volume, Verified
```

Where `Verified` is 0 (frontend-event only — Mt Pelerin) or 1
(webhook-verified — Transak / Topper). The filename embeds the date
range: `onramp-2026-01-01_to_2026-02-01.csv`.

Every export is logged in the audit trail.

## Order data semantics

Orders flow into the database via three paths:

| Provider | Source | `unverified` |
|---|---|---|
| Transak | `POST /webhook/transak/order` (signed JWT) | 0 |
| Topper | `POST /webhook/topper/order` (detached JWS) | 0 |
| Mt Pelerin | `POST /api/providers/mtpelerin/event` (frontend) | 1 |

The `unverified=1` flag on Mt Pelerin rows means: the frontend told us
the user submitted payment, but Mt Pelerin doesn't expose webhooks so
we can't confirm. Treat those rows as best-effort. Volume aggregation
includes them but they're badged separately so you can investigate
discrepancies.

Once a row's `unverified=0` (webhook-verified), it never downgrades —
even if a stray frontend event arrives later.

## Security posture

### What's protected

- **Public endpoints** are rate-limited to 60 req/min. No global
  enumeration: `/api/orders` requires a `customerId`.
- **Admin endpoints** require a valid HS256 JWT in `Authorization: Bearer …`.
- **Login endpoint** is rate-limited to 5 req/min/IP; counter doesn't
  reset on success.
- **Webhook endpoints** verify provider signatures before persisting.
  Transak: HS256 JWT in `body.data` (signed with Partner Access
  Token). Topper: ES256 detached JWS in `X-Topper-JWS-Signature`
  header.
- **Boot guards** — backend won't start if Transak's insecure-webhook
  flag is on alongside `NODE_ENV=production` or
  `TRANSAK_ENV=PRODUCTION`. Same for partial admin / Topper config.

### What we don't do (and why)

- **Server-side session denylist** — the admin JWT is stateless. To
  invalidate every live session, rotate `ADMIN_JWT_SECRET`. We chose
  this over a sessions table because the admin dashboard is single-
  tenant and the operational simplicity beats the marginal benefit
  of revocation granularity.
- **CAPTCHA on login** — rate-limit + scrypt + audit log is enough
  for a handful of admins. Adding CAPTCHA makes ops worse without
  meaningfully improving security at this scale.
- **2FA / TOTP** — not in the PDF spec. Could be added later;
  `ADMIN_PASSWORD_HASH` would gain a `totpSecret` companion var.
- **Email-based password reset** — there's no email service wired
  in. To reset the password: regenerate the hash with the script
  and update `ADMIN_PASSWORD_HASH`. Then rotate the JWT secret.

### Routine ops

- **Vacuum the audit log** when it grows: import
  `vacuumAudit({ keep: 10000 })` from `backend/admin/audit.js` and
  run from a maintenance script. Floor of 10 prevents accidental
  total wipe.
- **Backup the SQLite file** (`backend/data.db`) per your platform's
  routine. Use `sqlite3 .backup` (handles WAL correctly) rather
  than copying the file directly.

## Troubleshooting

### "503 admin_not_configured" on every admin endpoint

One of `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `ADMIN_JWT_SECRET` is
missing. Check `backend/.env` and restart.

### Login returns 401 for a known-good password

- Confirm `ADMIN_PASSWORD_HASH` starts with `scrypt$` and has 6
  segments separated by `$`.
- Re-run the hash script, paste fresh, restart the backend.
- Check the audit log for `login.failure` rows — the IP and
  user-agent help spot misconfigured proxies.

### Login works but every subsequent call returns 401

- The JWT secret rotated mid-session. Log in again.
- The clock on the backend drifted past the JWT exp.

### Volume number looks wrong

- Confirm the date range. The picker uses local time but the SQLite
  `updated_at` is stored as UTC milliseconds — there's a small
  off-by-day risk near midnight.
- Check the unverified row count for Mt Pelerin. If the customer
  abandoned payment after submitting, the row sits in
  `PAYMENT_SUBMITTED_UNVERIFIED` forever (no webhook to upgrade or
  fail it). These orders inflate volume — investigate by partnering
  with Mt Pelerin support.

### CSV export downloads an HTML error page

The button uses `authFetch` then drops to a raw `fetch` for the file
download. If the JWT expired between the dashboard load and the
click, the second `fetch` returns 401. The browser saves the JSON
error as a file. Re-login and try again.
