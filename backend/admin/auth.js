import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'

// admin authentication primitives.
//
// password storage:
//   - scrypt with N=16384, r=8, p=1 (sane defaults for interactive auth).
//   - 16-byte random salt, 32-byte derived key.
//   - encoded as `scrypt$N$r$p$<saltB64>$<keyB64>` for forward compatibility.
//   - timing-safe comparison via crypto.timingSafeEqual.
//
// session model:
//   - HS256 JWT signed with ADMIN_JWT_SECRET (≥32 chars enforced at boot).
//   - 60-minute fixed window; frontend also enforces 30-min idle auto-logout.
//   - claims: sub=username, iat, exp, role.
//
// no DB-backed sessions in v1 — the JWT is the session. logout is purely
// client-side (token discarded). this matches the PDF's "Session management
// and auto-logout after inactivity" without needing a session table.
//
// to invalidate all live tokens, rotate ADMIN_JWT_SECRET.

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keyLen: 32, saltLen: 16 }
const SESSION_TTL_SECONDS = 60 * 60

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || ''
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || ''
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || ''

export function isAdminEnabled() {
  return Boolean(ADMIN_USERNAME && ADMIN_PASSWORD_HASH && ADMIN_JWT_SECRET)
}

// boot-time guard. admin endpoints will return 503 unless ALL three values
// are set. partial config = misconfiguration → fail fast at boot.
export function assertAdminConfigSafe() {
  const anySet = ADMIN_USERNAME || ADMIN_PASSWORD_HASH || ADMIN_JWT_SECRET
  const allSet = ADMIN_USERNAME && ADMIN_PASSWORD_HASH && ADMIN_JWT_SECRET
  if (anySet && !allSet) {
    throw new Error(
      'admin: partial configuration. set ALL of ADMIN_USERNAME, ' +
      'ADMIN_PASSWORD_HASH, ADMIN_JWT_SECRET — or none of them to leave ' +
      'the admin dashboard disabled.'
    )
  }
  if (allSet) {
    if (ADMIN_JWT_SECRET.length < 32) {
      throw new Error('admin: ADMIN_JWT_SECRET must be at least 32 characters')
    }
    if (!/^scrypt\$/.test(ADMIN_PASSWORD_HASH)) {
      throw new Error(
        'admin: ADMIN_PASSWORD_HASH does not look like a scrypt hash. ' +
        'generate one with: node bin/hash-admin-password.js'
      )
    }
  } else {
    // eslint-disable-next-line no-console
    console.warn('[admin] not configured — /api/admin/* endpoints will return 503.')
  }
}

// hash a plaintext password. used by the bootstrap CLI; never call from
// runtime auth path (verifyPassword is what you want there).
export function hashPassword(plain) {
  if (typeof plain !== 'string' || plain.length < 12) {
    throw new Error('password must be at least 12 characters')
  }
  const salt = randomBytes(SCRYPT_PARAMS.saltLen)
  const key = scryptSync(plain, salt, SCRYPT_PARAMS.keyLen, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
  })
  return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt.toString('base64')}$${key.toString('base64')}`
}

function verifyPassword(plain, encoded) {
  if (typeof plain !== 'string' || typeof encoded !== 'string') return false
  const parts = encoded.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const N = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  const salt = Buffer.from(parts[4], 'base64')
  const expected = Buffer.from(parts[5], 'base64')
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false
  if (salt.length === 0 || expected.length === 0) return false

  let actual
  try {
    actual = scryptSync(plain, salt, expected.length, { N, r, p })
  } catch {
    return false
  }
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

// authenticate a username/password pair. returns a signed session JWT on
// success, null on failure. timing of failure is intentionally constant
// (we always run scrypt even when the username is wrong) to avoid leaking
// account existence.
export async function authenticate(username, password) {
  if (!isAdminEnabled()) return null

  // always run the scrypt verification — even on bad username — so the
  // total CPU cost is identical for "wrong user" vs "right user wrong pw".
  // pick a dummy hash matching the real format if the username is wrong.
  const usernameOk = typeof username === 'string' && username === ADMIN_USERNAME
  const targetHash = usernameOk
    ? ADMIN_PASSWORD_HASH
    // bogus but well-formed scrypt hash so verifyPassword runs full cost.
    : 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='

  const passwordOk = verifyPassword(password, targetHash)
  if (!usernameOk || !passwordOk) return null

  const now = Math.floor(Date.now() / 1000)
  const secret = new TextEncoder().encode(ADMIN_JWT_SECRET)
  const token = await new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(username)
    .setIssuedAt(now)
    .setExpirationTime(now + SESSION_TTL_SECONDS)
    .sign(secret)

  return { token, expiresAt: now + SESSION_TTL_SECONDS }
}

// express middleware. populates req.admin = { username } on success.
export async function requireAdmin(req, res, next) {
  if (!isAdminEnabled()) {
    return res.status(503).json({ error: 'admin_not_configured' })
  }

  const auth = req.headers.authorization || ''
  const match = /^Bearer\s+(.+)$/i.exec(auth)
  if (!match) return res.status(401).json({ error: 'missing_token' })

  const secret = new TextEncoder().encode(ADMIN_JWT_SECRET)
  try {
    const { payload } = await jwtVerify(match[1], secret, { algorithms: ['HS256'] })
    if (payload.role !== 'admin') return res.status(403).json({ error: 'forbidden' })
    req.admin = { username: payload.sub }
    next()
  } catch (err) {
    return res.status(401).json({ error: 'invalid_token', detail: err?.code || 'verify_failed' })
  }
}

export const ADMIN_RUNTIME = {
  ttlSeconds: SESSION_TTL_SECONDS,
  enabled: isAdminEnabled,
}
