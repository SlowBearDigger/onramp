// transak partner access token — cache + auto-refresh.
//
// transak's partner access token is a JWT minted by their refresh-token
// endpoint (POST /partners/api/v2/refresh-token) using the long-lived
// api-key + api-secret pair. the JWT expires every 7 days, so storing
// it in env vars would require manual rotation every week — fragile,
// easy to forget, breaks production silently.
//
// instead, we store ONLY the api-secret (long-lived, never expires) in
// env, and mint the access token on demand. token + expiry are cached
// in memory, refreshed proactively when within REFRESH_BEFORE_EXPIRY of
// the cutoff, and refreshed lazily on first use.
//
// failure modes covered:
//   - refresh endpoint 5xx → throw, caller maps to 502
//   - refresh endpoint 401 → throw, caller maps to 503 (creds wrong)
//   - process restart → next call refreshes (no persistence needed)
//   - concurrent refresh → no lock; worst case we mint 2-3 tokens in
//     parallel during cold start. transak handles that fine and the
//     caches converge on the latest-write. simpler than a mutex.
//
// override path: if TRANSAK_PARTNER_ACCESS_TOKEN is set explicitly, we
// skip refresh entirely and use that token verbatim. useful for:
//   - emergencies where the api-secret is rotated mid-incident
//   - early-stage setups where the user only has a token, not the secret
// the override token is NOT validated for expiry — caller eats the 401
// from /auth/session if it expired.

const REFRESH_URL_STAGING = 'https://api-stg.transak.com/partners/api/v2/refresh-token'
const REFRESH_URL_PRODUCTION = 'https://api.transak.com/partners/api/v2/refresh-token'

// refresh when within 1h of expiry. transak tokens last 7 days so this
// is a tiny fraction. picks a moment well outside any clock-skew window.
const REFRESH_BEFORE_EXPIRY_SECONDS = 60 * 60

let cached = null // { token, expiresAt }

function refreshUrl() {
  return (process.env.TRANSAK_ENV || 'STAGING').toUpperCase() === 'PRODUCTION'
    ? REFRESH_URL_PRODUCTION
    : REFRESH_URL_STAGING
}

async function mintAccessToken() {
  const apiKey = process.env.TRANSAK_API_KEY
  const apiSecret = process.env.TRANSAK_API_SECRET
  if (!apiKey || !apiSecret) {
    const err = new Error('transak: TRANSAK_API_KEY and TRANSAK_API_SECRET are required to mint an access token')
    err.code = 'not_configured'
    throw err
  }

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 5000)
  try {
    const r = await fetch(refreshUrl(), {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-secret': apiSecret,
        'content-type': 'application/json',
        // descriptive UA — transak sits behind cloudflare bot filtering and
        // generic runtime UAs have triggered 1010 blocks in testing.
        'user-agent': 'onramp-backend/1.0 (+https://github.com/SlowBearDigger/onramp)',
      },
      body: JSON.stringify({ apiKey }),
      signal: ac.signal,
      redirect: 'error',
    })
    if (!r.ok) {
      const detail = await r.text().catch(() => '')
      const err = new Error(`transak refresh-token HTTP ${r.status}: ${detail.slice(0, 200)}`)
      err.code = r.status === 401 ? 'auth_failed' : 'upstream_error'
      err.status = r.status
      throw err
    }
    const json = await r.json()
    const token = json?.data?.accessToken
    const expiresAt = Number(json?.data?.expiresAt)
    if (typeof token !== 'string' || !token || !Number.isFinite(expiresAt)) {
      const err = new Error('transak refresh-token returned malformed response')
      err.code = 'invalid_response'
      throw err
    }
    cached = { token, expiresAt }
    return token
  } finally {
    clearTimeout(timer)
  }
}

// returns a valid access token. uses the cached one when fresh; refreshes
// when missing or within REFRESH_BEFORE_EXPIRY of the cutoff.
//
// precedence (changed 2026-06): when api key + secret are configured we
// ALWAYS prefer minting — a fresh 7-day token can't go stale. the explicit
// TRANSAK_PARTNER_ACCESS_TOKEN override is now a FALLBACK, used when the
// secret is absent or minting fails (secret rotated mid-incident). the old
// override-first order had a footgun: a forgotten override env var with an
// expired token silently broke every authed call even though valid
// long-lived creds sat right next to it.
export async function getValidAccessToken() {
  const override = process.env.TRANSAK_PARTNER_ACCESS_TOKEN
  const canMint = process.env.TRANSAK_API_KEY && process.env.TRANSAK_API_SECRET

  if (!canMint) {
    if (override) return override
    // fall through — mintAccessToken throws the canonical not_configured.
    return mintAccessToken()
  }

  const now = Math.floor(Date.now() / 1000)
  if (cached && cached.expiresAt - now > REFRESH_BEFORE_EXPIRY_SECONDS) {
    return cached.token
  }
  try {
    return await mintAccessToken()
  } catch (err) {
    if (override) {
      console.warn('[transak-token] mint failed (%s) — falling back to TRANSAK_PARTNER_ACCESS_TOKEN override', err?.code || err?.message)
      return override
    }
    throw err
  }
}

// for tests / emergency.
export function _resetCacheForTests() {
  cached = null
}

// inspect cache state — used by /healthz to surface "next refresh in N min".
export function getTokenCacheStatus() {
  if (process.env.TRANSAK_PARTNER_ACCESS_TOKEN) {
    return { mode: 'override', hasToken: true }
  }
  if (!cached) return { mode: 'auto', hasToken: false }
  const now = Math.floor(Date.now() / 1000)
  return {
    mode: 'auto',
    hasToken: true,
    expiresAt: cached.expiresAt,
    secondsUntilExpiry: Math.max(0, cached.expiresAt - now),
  }
}
