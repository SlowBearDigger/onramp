import { describe, expect, it, vi } from 'vitest'
import {
  assertCorsConfigSafe,
  clientIpFromRequest,
  enforceAllowedOrigin,
  parseCorsOrigins,
} from '../http-security.js'

describe('HTTP security', () => {
  it('requires explicit HTTPS origins in production', () => {
    expect(() => parseCorsOrigins('', { production: true })).toThrow(/CORS_ORIGIN/)
    expect(() => assertCorsConfigSafe(['*'], { production: true })).toThrow(/wildcard/i)
    expect(() => assertCorsConfigSafe(['http://app.onoff.finance'], { production: true })).toThrow(/HTTPS/i)
    expect(() => assertCorsConfigSafe(['https://app.onoff.finance'], { production: true })).not.toThrow()
  })

  it('rejects malformed origins and origins with paths', () => {
    expect(() => assertCorsConfigSafe(['not-a-url'])).toThrow(/invalid/i)
    expect(() => assertCorsConfigSafe(['https://app.onoff.finance/path'])).toThrow(/origin/i)
  })

  it('blocks browser requests from unapproved origins', () => {
    const middleware = enforceAllowedOrigin(['https://app.onoff.finance'])
    const next = vi.fn()
    const status = vi.fn().mockReturnThis()
    const json = vi.fn()

    middleware(
      { get: (name) => name === 'origin' ? 'https://attacker.example' : undefined },
      { status, json },
      next,
    )

    expect(status).toHaveBeenCalledWith(403)
    expect(json).toHaveBeenCalledWith({ error: 'origin_not_allowed' })
    expect(next).not.toHaveBeenCalled()
  })

  it('allows approved browser origins and origin-less server calls', () => {
    const middleware = enforceAllowedOrigin(['https://app.onoff.finance'])
    const next = vi.fn()
    const res = { status: vi.fn(), json: vi.fn() }

    middleware({ get: () => 'https://app.onoff.finance' }, res, next)
    middleware({ get: () => undefined }, res, next)

    expect(next).toHaveBeenCalledTimes(2)
  })

  it('returns one valid client IP and normalizes IPv4-mapped IPv6', () => {
    expect(clientIpFromRequest({ ip: '203.0.113.42' })).toBe('203.0.113.42')
    expect(clientIpFromRequest({ ip: '::ffff:203.0.113.42' })).toBe('203.0.113.42')
    expect(clientIpFromRequest({ ip: '2001:db8::42' })).toBe('2001:db8::42')
    expect(() => clientIpFromRequest({ ip: '203.0.113.42, 10.0.0.1' })).toThrow(/client IP/i)
  })
})
