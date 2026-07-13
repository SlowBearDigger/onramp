# Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden order access, clean up no-credential product surfaces, and make the VPS deployment versioned, recoverable, and monitored.

**Architecture:** Express exposes only capability-scoped history while Caddy is the public network boundary. React filters providers and Pay through explicit build flags. Static releases use an atomic `current` symlink with systemd-backed backup and health checks.

**Tech Stack:** React 19, Vite 8, Vitest, Express 4, SQLite, Bash, Caddy, systemd.

## Global Constraints

- Do not require new provider credentials.
- Do not change DNS during deployment preparation.
- Preserve the current Transak staging flow.
- Write regression tests before behavior changes.
- Keep secrets out of Git and command output.

---

### Task 1: Remove Public Order Detail

**Files:**
- Modify: `backend/app.js`
- Modify: `backend/db.js`
- Create: `backend/tests/app-security.test.js`
- Modify: `backend/README.md`

**Interfaces:**
- Consumes: existing Express app and SQLite order storage.
- Produces: no public wallet/detail listing; `POST /api/orders/history` accepts opaque access IDs and excludes raw payloads.

- [x] Add regression coverage for removed wallet/detail routes and explicit history projection.
- [ ] Run the focused test and confirm it fails because the route is public.
- [ ] Remove the route and unused database accessor.
- [ ] Run the focused test and backend suite.

### Task 2: Bind Backend Locally

**Files:**
- Modify: `backend/app.js`
- Modify: `deploy/env.production.template`
- Modify: `backend/README.md`

**Interfaces:**
- Consumes: `HOST` environment variable.
- Produces: default listener `127.0.0.1:3001`; explicit override remains possible.

- [ ] Add a source-level configuration test for the localhost default.
- [ ] Confirm it fails against the public bind.
- [ ] Add `HOST` parsing and use it in `app.listen`.
- [ ] Run the focused test.

### Task 3: Filter Providers and Mobile Navigation

**Files:**
- Modify: `src/providers/index.js`
- Modify: `src/providers/__tests__/registry.test.js`
- Modify: `src/components/ProviderComparison.jsx`
- Create: `src/components/__tests__/ProviderComparison.test.jsx`
- Modify: `src/components/BottomNav.jsx`
- Create: `src/components/__tests__/BottomNav.test.jsx`
- Modify: `src/components/SwapWidget.jsx`

**Interfaces:**
- Consumes: `VITE_ENABLE_MTPELERIN`, `VITE_ENABLE_TOPPER`, `VITE_ENABLE_GUARDARIAN`.
- Produces: `ENABLED_PROVIDER_IDS`, `listEnabledProviderMetadata()`, disabled unavailable quote cards, and Pay disabled by default.

- [ ] Add failing registry, card-interaction, and mobile-navigation tests.
- [ ] Confirm each failure describes missing filtering or navigation.
- [ ] Implement explicit provider flags and update comparison/count consumers.
- [x] Disable unavailable cards and gate Pay behind provider approval.
- [ ] Run focused and complete frontend tests.

### Task 4: Versioned VPS Frontend Deployment

**Files:**
- Modify: `deploy/Caddyfile`
- Create: `deploy/deploy-release.sh`
- Create: `deploy/rollback-release.sh`
- Create: `deploy/install-operations.sh`
- Create: `deploy/onoff-backup.service`
- Create: `deploy/onoff-backup.timer`
- Create: `deploy/onoff-healthcheck.service`
- Create: `deploy/onoff-healthcheck.timer`
- Create: `deploy/healthcheck.sh`
- Create: `deploy/backup.sh`
- Modify: `deploy/setup-vps.sh`
- Create: `deploy/README.md`

**Interfaces:**
- Consumes: a built frontend directory and optional release ID.
- Produces: `/var/www/onoff/current`, retained releases/backups, rollback command and systemd timers.

- [ ] Write scripts with strict shell mode, path validation and restrictive permissions.
- [ ] Configure Caddy SPA serving and localhost API proxy.
- [ ] Add systemd units and installation wiring.
- [ ] Run `bash -n` on every shell script and validate the Caddyfile.

### Task 5: Full Verification and VPS Staging

**Files:**
- Modify only if verification reveals a scoped defect.

**Interfaces:**
- Consumes: repository test/build scripts and SSH access to `88.214.26.43`.
- Produces: verified local build, staged VPS release, installed operations timers, and a DNS cutover checklist.

- [ ] Run frontend tests and production build under Node 20.
- [ ] Run backend tests under Node 20.
- [ ] Inspect the final diff for secrets and unrelated changes.
- [ ] Stage the release on VPS and test local frontend/backend endpoints.
- [ ] Validate Caddy before reload and verify timers.
- [ ] Leave DNS unchanged and report the exact cutover dependency.
