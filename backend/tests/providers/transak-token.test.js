import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  getValidAccessToken,
  getTokenCacheStatus,
  _resetCacheForTests,
} from '../../providers/transak-token.js'

const REFRESH_URL = 'https://api-stg.transak.com/partners/api/v2/refresh-token'

beforeEach(() => {
  _resetCacheForTests()
  process.env.TRANSAK_ENV = 'STAGING'
  process.env.TRANSAK_API_KEY = 'test-api-key'
  process.env.TRANSAK_API_SECRET = 'test-secret'
  delete process.env.TRANSAK_PARTNER_ACCESS_TOKEN
  vi.spyOn(globalThis, 'fetch')
})

afterEach(() => {
  vi.restoreAllMocks()
})

function mockRefresh(token, expiresAt) {
  globalThis.fetch.mockImplementationOnce(async (url, options) => {
    expect(url).toBe(REFRESH_URL)
    expect(options.headers['x-api-key']).toBe('test-api-key')
    return new Response(JSON.stringify({ data: { accessToken: token, expiresAt } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
}

describe('getValidAccessToken — auto-refresh path', () => {
  it('mints a token on first call and caches it', async () => {
    const futureExpiry = Math.floor(Date.now() / 1000) + 7 * 24 * 3600
    mockRefresh('jwt.token.first', futureExpiry)

    const t = await getValidAccessToken()
    expect(t).toBe('jwt.token.first')
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)

    // second call uses cache — no new fetch
    const t2 = await getValidAccessToken()
    expect(t2).toBe('jwt.token.first')
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it('refreshes when within 1 hour of expiry', async () => {
    const nearExpiry = Math.floor(Date.now() / 1000) + 30 * 60 // 30min
    mockRefresh('jwt.token.old', nearExpiry)

    await getValidAccessToken()

    // second call sees the cached token is too close to expiry → refresh
    mockRefresh('jwt.token.fresh', Math.floor(Date.now() / 1000) + 7 * 24 * 3600)
    const t2 = await getValidAccessToken()
    expect(t2).toBe('jwt.token.fresh')
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('throws when api key or secret are missing', async () => {
    delete process.env.TRANSAK_API_KEY
    await expect(getValidAccessToken()).rejects.toThrow(/required/)
  })

  it('maps 401 from refresh endpoint to err.code = auth_failed', async () => {
    globalThis.fetch.mockImplementationOnce(async () => new Response('bad creds', { status: 401 }))
    try {
      await getValidAccessToken()
      throw new Error('should have thrown')
    } catch (err) {
      expect(err.code).toBe('auth_failed')
      expect(err.status).toBe(401)
    }
  })

  it('maps 5xx from refresh endpoint to err.code = upstream_error', async () => {
    globalThis.fetch.mockImplementationOnce(async () => new Response('boom', { status: 503 }))
    try {
      await getValidAccessToken()
      throw new Error('should have thrown')
    } catch (err) {
      expect(err.code).toBe('upstream_error')
    }
  })

  it('rejects malformed refresh response', async () => {
    globalThis.fetch.mockImplementationOnce(async () => new Response(JSON.stringify({}), { status: 200 }))
    await expect(getValidAccessToken()).rejects.toThrow(/malformed/)
  })

  it('uses the production URL when TRANSAK_ENV=PRODUCTION', async () => {
    process.env.TRANSAK_ENV = 'PRODUCTION'
    globalThis.fetch.mockImplementationOnce(async (url) => {
      expect(url).toBe('https://api.transak.com/partners/api/v2/refresh-token')
      return new Response(JSON.stringify({
        data: { accessToken: 'prod.jwt', expiresAt: Math.floor(Date.now() / 1000) + 7 * 24 * 3600 },
      }), { status: 200 })
    })
    await getValidAccessToken()
  })
})

describe('getValidAccessToken — override path', () => {
  it('prefers minting over the override when key+secret are configured', async () => {
    // precedence changed 2026-06: a stale override env var must not be able
    // to shadow valid long-lived creds (that combination silently broke
    // production). fresh mint wins; override is the fallback.
    process.env.TRANSAK_PARTNER_ACCESS_TOKEN = 'manually.pasted.jwt'
    const futureExpiry = Math.floor(Date.now() / 1000) + 7 * 24 * 3600
    mockRefresh('jwt.minted', futureExpiry)
    const t = await getValidAccessToken()
    expect(t).toBe('jwt.minted')
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it('falls back to the override when minting fails', async () => {
    process.env.TRANSAK_PARTNER_ACCESS_TOKEN = 'manually.pasted.jwt'
    globalThis.fetch.mockImplementationOnce(async () => new Response('boom', { status: 500 }))
    const t = await getValidAccessToken()
    expect(t).toBe('manually.pasted.jwt')
  })

  it('uses the override without fetching when key/secret are absent', async () => {
    delete process.env.TRANSAK_API_SECRET
    process.env.TRANSAK_PARTNER_ACCESS_TOKEN = 'manually.pasted.jwt'
    const t = await getValidAccessToken()
    expect(t).toBe('manually.pasted.jwt')
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})

describe('getTokenCacheStatus', () => {
  it('reports override mode when env var is set', () => {
    process.env.TRANSAK_PARTNER_ACCESS_TOKEN = 'override.jwt'
    expect(getTokenCacheStatus()).toEqual({ mode: 'override', hasToken: true })
  })

  it('reports auto mode with no token before first mint', () => {
    expect(getTokenCacheStatus()).toEqual({ mode: 'auto', hasToken: false })
  })

  it('reports expiry info after a mint', async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 100
    mockRefresh('jwt.token', expiresAt)
    await getValidAccessToken()
    const status = getTokenCacheStatus()
    expect(status.mode).toBe('auto')
    expect(status.hasToken).toBe(true)
    expect(status.expiresAt).toBe(expiresAt)
    expect(status.secondsUntilExpiry).toBeGreaterThanOrEqual(99)
    expect(status.secondsUntilExpiry).toBeLessThanOrEqual(100)
  })
})
