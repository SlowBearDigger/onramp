# Production Hardening Design

## Goal

Finish the work that does not require new provider credentials: close public order-data exposure, gate unapproved product surfaces, stop presenting unavailable providers as usable, and make the VPS frontend/backend deployment recoverable and observable.

## Security Boundaries

- Remove the unused public `GET /api/orders/:id` route. An opaque provider order ID must never be sufficient to retrieve an order.
- Replace wallet-scoped history with a POST capability lookup using random partner-order IDs stored by the originating browser. Return an explicit projection without `raw_payload`.
- Bind Node to `127.0.0.1` by default. Caddy remains the only public HTTP entry point.
- Preserve existing CORS, rate limits, provider webhook verification, and admin authentication.

## Product Behavior

- Keep Pay behind `VITE_ENABLE_PAY=false` until third-party destinations are approved and staging E2E is complete. The disabled build must not emit its route chunk.
- Only enabled providers appear in comparison and checkout. Transak is enabled by default. Other providers require explicit build flags after credentials and live verification.
- An unavailable quote card is disabled and cannot launch a provider checkout.
- Remove the payment-method selector until a provider-backed method can be forwarded and quoted; a decorative choice must not imply control over checkout.
- Share one admin authentication state across layout, login and dashboard routes.
- Remove wallet-bound push subscriptions until they use an order capability or verified wallet signature.

## Deployment Architecture

- Build static frontend artifacts locally or in CI.
- Deploy each artifact into `/var/www/onoff/releases/<release-id>`.
- Point `/var/www/onoff/current` at the active release using an atomic symlink change.
- Caddy serves `onoff.finance` and `www.onoff.finance`, uses the SPA fallback, and proxies only `api.onoff.finance` to `127.0.0.1:3001`.
- A deployment script verifies the new release before switching. A rollback script switches to the previous release.
- Daily backup copies the SQLite database and application environment with restrictive permissions and retention.
- A systemd timer probes local frontend/backend endpoints. Public monitoring remains an external follow-up.
- DNS is not changed by deployment scripts. Cutover happens only after host-header tests against the VPS pass.

## Failure Handling

- Failed builds or release checks leave `current` unchanged.
- Failed Caddy validation prevents reload.
- Backup failures are visible in systemd logs and do not delete the newest valid backup.
- Monitoring failures are recorded in the journal and produce a failed systemd unit state.

## Verification

- Backend regression tests prove old order routes return 404 and capability history excludes raw payloads.
- Frontend unit tests prove only enabled providers are compared and unavailable cards cannot be selected.
- Feature-gate tests prove Pay requires explicit enablement.
- Shell syntax checks cover deployment scripts.
- A production frontend build is served from a temporary local HTTP server and deep routes are checked.
- VPS validation uses local `curl` with host resolution before any DNS change.
