import { isIP } from 'node:net'

export function assertCorsConfigSafe(origins, { production = false } = {}) {
  if (!Array.isArray(origins) || origins.length === 0) {
    throw new Error('FATAL: CORS_ORIGIN must contain at least one explicit frontend origin')
  }

  for (const origin of origins) {
    if (origin === '*') {
      throw new Error('FATAL: wildcard CORS origins are not allowed')
    }

    let parsed
    try {
      parsed = new URL(origin)
    } catch {
      throw new Error(`FATAL: invalid CORS origin: ${origin}`)
    }

    if (parsed.origin !== origin) {
      throw new Error(`FATAL: CORS_ORIGIN entries must be origins without paths: ${origin}`)
    }
    if (production && parsed.protocol !== 'https:') {
      throw new Error(`FATAL: production CORS origins must use HTTPS: ${origin}`)
    }
  }
}

export function parseCorsOrigins(value, { production = false } = {}) {
  const raw = value || (production ? '' : 'http://localhost:5173')
  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  assertCorsConfigSafe(origins, { production })
  return origins
}

export function enforceAllowedOrigin(origins) {
  const allowed = new Set(origins)
  return (req, res, next) => {
    const origin = req.get('origin')
    if (!origin || allowed.has(origin)) return next()
    return res.status(403).json({ error: 'origin_not_allowed' })
  }
}

export function clientIpFromRequest(req) {
  const raw = typeof req.ip === 'string' ? req.ip.trim() : ''
  const ip = raw.startsWith('::ffff:') ? raw.slice(7) : raw
  if (!isIP(ip)) {
    const err = new Error('request has no valid single client IP')
    err.code = 'invalid_client_ip'
    throw err
  }
  return ip
}
