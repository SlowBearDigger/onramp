# Admin dashboard

The PWA exposes an authenticated `/admin` route for analytics. It is fully separate from the public on-ramp flow — the public PWA never requires login.

## What you get

- Total turnover across all providers, plus per-provider breakdown.
- Daily and monthly transaction reports per provider (the PDF requirement).
- Stacked bar charts for daily and monthly volume.
- Optional unique-wallet count per month (anonymous, by `customer_id`).
- CSV export with columns `Date, Provider, Transaction Count, Total Volume, Verified`.
- Tight separation between **verified** (Transak / Topper webhooks) and **unverified** (Mt Pelerin frontend events) volume — every total in the UI splits the two and the CSV has a Verified column.

## Bootstrapping a user

The dashboard is **disabled by default**. To enable it, set three env vars in `backend/.env`. All three must be present together — partial config fails at boot.

### 1. Generate a password hash

The CLI uses Node's built-in `crypto.scrypt` (no native deps). Pipe the password in via stdin so it's not visible in your shell history:

```bash
cd backend
echo -n 'YourLongPassword!' | node bin/hash-admin-password.js
# → scrypt$16384$8$1$<salt>$<key>
```

Minimum 12 characters. Output looks like:

```
scrypt$16384$8$1$krQ7uhVIqjdso4t0b99Crw==$vaLrRZqynE4hHpbuEh9th+3XwoX21HU3+cwB7AkIGm8=
```

### 2. Generate a JWT secret

Any cryptographically random string ≥ 32 chars. The boot guard rejects anything shorter.

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

### 3. Set the env vars

`backend/.env`:

```
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=scrypt$16384$8$1$krQ7uhVIqjdso4t0b99Crw==$vaLrRZqynE4hHpbuEh9th+3XwoX21HU3+cwB7AkIGm8=
ADMIN_JWT_SECRET=<48-byte random base64>
```

Restart the backend. `/healthz` should now return `"admin": true`.

### 4. Sign in

Open `https://<your-host>/ramp/admin/login` and enter the username + password. On success you land at `/admin`.

## Security model

| Concern | Mitigation |
| --- | --- |
| Password storage | scrypt(N=16384, r=8, p=1), 16-byte salt, 32-byte derived key. Verified with `crypto.timingSafeEqual`. |
| Login brute force | 5 attempts / minute / IP via `express-rate-limit`. Successful logins don't count toward the cap (so a real admin can't lock themselves out). |
| Username enumeration | Same scrypt cost runs for "wrong username" as for "wrong password". Same generic error message returned for both. |
| Session storage | HS256 JWT in browser `localStorage`. Sessions are stateless on the server — rotating `ADMIN_JWT_SECRET` invalidates every live token. |
| Session lifetime | 60-minute fixed window on the JWT (`exp` claim, enforced server-side). Frontend additionally enforces a 30-minute idle timer per the PDF requirement. |
| XSS exposure | Same CSP as the public app. The dashboard makes no `eval`/`innerHTML` calls. |
| Endpoint protection | `requireAdmin` middleware on every `/api/admin/*` route checks the Bearer JWT. Returns 401 on missing/invalid/expired token, 503 if the dashboard is unconfigured. |
| Range query cost | `/api/admin/stats` rejects ranges over 2 years and bad `from >= to` with 400. SQL aggregations use the `idx_orders_provider` and `idx_orders_updated` indexes. |

## Future: role-based access control

The PDF lists RBAC as future work. The current JWT carries a `role: 'admin'` claim already; adding a viewer-only role only requires:

1. Storing multiple users (e.g. an `admins` table or a JSON env var with bcrypt hashes).
2. Setting `role` on issuance.
3. Per-route role checks.

The middleware structure (`requireAdmin`) is the right hook point.

## What gets counted in volume

The aggregation sums `fiat_amount` for orders in:

- `COMPLETED` — webhook-confirmed (Transak / Topper).
- `PROCESSING` — webhook-confirmed in flight.
- `PAYMENT_SUBMITTED_UNVERIFIED` — Mt Pelerin frontend `paymentSubmitted` events.

Excluded: `FAILED`, `CANCELLED`, `EXPIRED`, `REFUNDED`.

The dashboard separates verified and unverified totals everywhere because Mt Pelerin events are not webhook-authoritative — anyone with browser devtools could forge them. Treat the unverified bucket as a best-effort lower bound on Mt Pelerin activity, not a reliable revenue signal.

## Endpoints

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `POST` | `/api/admin/login` | none | Body `{username, password}`. Returns `{token, expiresAt, ttlSeconds}` or 401. |
| `GET` | `/api/admin/session` | required | Sanity probe. Returns `{ok: true, username}`. |
| `GET` | `/api/admin/stats?from=&to=` | required | `from`/`to` are ms-since-epoch. Defaults to last 30 days if omitted. |
| `GET` | `/api/admin/export.csv?from=&to=` | required | Streams CSV with the canonical columns. |

All admin routes return 503 with `{error: "admin_not_configured"}` until the env vars are set.
