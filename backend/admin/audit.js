import { db } from '../db.js'

// admin audit log.
//
// captures security-relevant admin actions so a sysadmin can answer "who did
// what when" after the fact. designed to be cheap (one INSERT per event) and
// privacy-aware (no passwords, no PII beyond what's already in req.ip / UA).
//
// what we log:
//   - login.success            : someone authenticated
//   - login.failure            : bad credentials (the attempted username
//                                is captured but truncated; the password
//                                is NEVER stored anywhere — this module
//                                doesn't even receive it)
//   - logout                   : explicit user logout (client-initiated)
//   - logout.idle              : auto-logout fired by the 30-min idle timer
//   - csv.export               : CSV export downloaded
//
// what we don't log:
//   - normal /api/admin/stats reads (too noisy; would 10x the table for
//     no real value — every dashboard page-view fires several reads).
//   - password hashes, jwts, or any other secret material.
//
// retention is left as an ops concern — there's a vacuum helper at the
// bottom for when the table eventually grows. on a low-traffic admin
// dashboard the table stays tiny indefinitely.

// schema. idempotent so reboots are safe.
db.exec(`
  CREATE TABLE IF NOT EXISTS admin_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    action TEXT NOT NULL,
    username TEXT,
    ip TEXT,
    user_agent TEXT,
    detail TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_admin_audit_ts ON admin_audit(ts DESC);
  CREATE INDEX IF NOT EXISTS idx_admin_audit_action ON admin_audit(action, ts DESC);
`)

const insertStmt = db.prepare(`
  INSERT INTO admin_audit (ts, action, username, ip, user_agent, detail)
  VALUES (@ts, @action, @username, @ip, @user_agent, @detail)
`)

const FIELD_CAPS = {
  username: 96,
  ip: 64,
  user_agent: 256,
  detail: 2048,
}

function clip(value, max) {
  if (value == null) return null
  const s = String(value)
  return s.length > max ? s.slice(0, max) : s
}

const KNOWN_ACTIONS = new Set([
  'login.success',
  'login.failure',
  'logout',
  'logout.idle',
  'csv.export',
  // provider-side events that aren't admin actions but are worth keeping
  // in the same trail for ops correlation.
  'transak.kyc',
])

// log an event. swallows insert errors (the audit log going down should NEVER
// block a real action like login).
//
// detail is optional and accepts an object that will be JSON-stringified.
// pass only structured metadata — never raw request bodies.
export function logAuditEvent(action, { username, ip, userAgent, detail } = {}) {
  if (!KNOWN_ACTIONS.has(action)) {
    // eslint-disable-next-line no-console
    console.warn(`[audit] unknown action "${action}" — refusing to log`)
    return
  }
  try {
    insertStmt.run({
      ts: Date.now(),
      action,
      username: clip(username, FIELD_CAPS.username),
      ip: clip(ip, FIELD_CAPS.ip),
      user_agent: clip(userAgent, FIELD_CAPS.user_agent),
      detail: detail == null ? null : clip(JSON.stringify(detail), FIELD_CAPS.detail),
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[audit] insert failed:', err?.message)
  }
}

// list recent events, newest first. paginated by ts DESC + id DESC for
// stable ordering when multiple events share a millisecond.
const listStmt = db.prepare(`
  SELECT id, ts, action, username, ip, user_agent, detail
  FROM admin_audit
  ORDER BY ts DESC, id DESC
  LIMIT ?
  OFFSET ?
`)

const countStmt = db.prepare(`SELECT COUNT(*) AS n FROM admin_audit`)

export function listAuditEvents({ limit = 50, offset = 0 } = {}) {
  // sane bounds — never let a caller request 100k rows.
  const lim = Math.min(Math.max(1, Number(limit) || 50), 200)
  const off = Math.max(0, Number(offset) || 0)
  return listStmt.all(lim, off)
}

export function countAuditEvents() {
  return countStmt.get()?.n || 0
}

// extract a usable client IP from an express req. respects the trust-proxy
// setting if app.set('trust proxy', ...) is configured (which it is in
// app.js). still caps the length defensively.
export function ipFromRequest(req) {
  return clip(req?.ip || req?.socket?.remoteAddress || null, FIELD_CAPS.ip)
}

export function userAgentFromRequest(req) {
  return clip(req?.headers?.['user-agent'] || null, FIELD_CAPS.user_agent)
}

// vacuum helper — kept for ops, not exposed via HTTP. trims the table to the
// most-recent N rows. call from a cron / manual maintenance script.
const vacuumStmt = db.prepare(`
  DELETE FROM admin_audit
  WHERE id NOT IN (
    SELECT id FROM admin_audit ORDER BY ts DESC, id DESC LIMIT ?
  )
`)
// floor of 10 is just a safety net against `vacuumAudit({ keep: 0 })`
// accidentally wiping the table — not a security boundary. ops scripts
// pass an explicit `keep` value (typical: 10_000).
export function vacuumAudit({ keep = 10_000 } = {}) {
  const raw = Number(keep)
  const n = Math.max(10, Number.isFinite(raw) ? raw : 10_000)
  return vacuumStmt.run(n).changes
}
