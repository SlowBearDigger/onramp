import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SignJWT } from 'jose'
import {
  verifyOrderWebhook,
  webhookToOrderRow,
  assertWebhookConfigSafe,
  classifyEvent,
  KYC_EVENT_IDS,
  createSignedWidgetUrl,
  fetchPublicQuote,
} from '../../providers/transak.js'

const SECRET = 'test-partner-access-token-please-rotate'

function withEnv(env, fn) {
  const prev = {}
  for (const k of Object.keys(env)) {
    prev[k] = process.env[k]
    if (env[k] === undefined) delete process.env[k]
    else process.env[k] = env[k]
  }
  return Promise.resolve(fn()).finally(() => {
    for (const k of Object.keys(prev)) {
      if (prev[k] === undefined) delete process.env[k]
      else process.env[k] = prev[k]
    }
  })
}

async function signWebhookData(payload, secret = SECRET) {
  const key = new TextEncoder().encode(secret)
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .sign(key)
}

describe('transak.verifyOrderWebhook', () => {
  beforeEach(() => {
    process.env.TRANSAK_PARTNER_ACCESS_TOKEN = SECRET
    delete process.env.TRANSAK_WEBHOOK_INSECURE
  })

  it('accepts a properly signed JWT and returns the eventID from the signed payload', async () => {
    const jwt = await signWebhookData({
      eventID: 'ORDER_COMPLETED',
      webhookData: { id: 'order_abc', cryptoCurrency: 'BTC' },
    })
    const result = await verifyOrderWebhook({ data: jwt })
    expect(result.eventID).toBe('ORDER_COMPLETED')
    expect(result.payload.webhookData.id).toBe('order_abc')
  })

  it('ignores eventID from the outer body — only the signed payload is authoritative', async () => {
    const jwt = await signWebhookData({
      eventID: 'ORDER_CREATED',
      webhookData: { id: 'order_xyz' },
    })
    // attacker sets a different eventID outside the signature.
    const result = await verifyOrderWebhook({
      data: jwt,
      eventID: 'ORDER_COMPLETED', // forged outer field
    })
    expect(result.eventID).toBe('ORDER_CREATED')
  })

  it('rejects a JWT signed with the wrong secret', async () => {
    const jwt = await signWebhookData(
      { eventID: 'ORDER_COMPLETED', webhookData: { id: 'x' } },
      'wrong-secret'
    )
    await expect(verifyOrderWebhook({ data: jwt })).rejects.toThrow()
  })

  it('rejects a malformed body', async () => {
    await expect(verifyOrderWebhook(null)).rejects.toThrow(/body missing/)
    await expect(verifyOrderWebhook({})).rejects.toThrow(/data is not a JWT/)
    await expect(verifyOrderWebhook({ data: 'not.a.jwt' })).rejects.toThrow()
  })

  it('rejects a JWT with no eventID in the signed payload', async () => {
    const jwt = await signWebhookData({
      // intentionally no eventID
      webhookData: { id: 'order_no_event' },
    })
    await expect(verifyOrderWebhook({ data: jwt })).rejects.toThrow(/missing eventID/)
  })

  it('rejects when no signing secret is configured (and insecure flag is off)', async () => {
    delete process.env.TRANSAK_PARTNER_ACCESS_TOKEN
    delete process.env.TRANSAK_API_SECRET
    const jwt = await signWebhookData({ eventID: 'ORDER_COMPLETED' })
    await expect(verifyOrderWebhook({ data: jwt })).rejects.toThrow(/no signing secret/)
  })

  it('rejects an alg=none ("alg confusion") attack — pinned to HS256', async () => {
    // craft an unsigned JWT with header alg=none
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({ eventID: 'ORDER_COMPLETED' })).toString('base64url')
    const tampered = `${header}.${payload}.`
    await expect(verifyOrderWebhook({ data: tampered })).rejects.toThrow()
  })
})

describe('transak.webhookToOrderRow', () => {
  it('maps a verified webhook to the canonical row shape', () => {
    const row = webhookToOrderRow({
      eventID: 'ORDER_COMPLETED',
      payload: {
        webhookData: {
          id: 'order_abc',
          partnerOrderId: 'p_42',
          partnerCustomerId: 'cust_1',
          fiatCurrency: 'USD',
          fiatAmount: '100.50',
          cryptoCurrency: 'BTC',
          cryptoAmount: '0.0023',
          walletAddress: '0xabc',
          network: 'bitcoin',
          transactionHash: '0xdeadbeef',
          isBuyOrSell: 'BUY',
          createdAt: '2026-01-01T00:00:00Z',
        },
      },
    })
    expect(row.id).toBe('order_abc')
    expect(row.provider).toBe('transak')
    expect(row.unverified).toBe(0)
    expect(row.status).toBe('COMPLETED')
    expect(row.partner_order_id).toBe('p_42')
    expect(row.fiat_amount).toBe(100.5)
    expect(row.crypto_amount).toBe(0.0023)
    expect(row.tx_hash).toBe('0xdeadbeef')
    expect(row.event_id).toBe('ORDER_COMPLETED')
  })

  it('falls back to UNKNOWN status for unmapped events', () => {
    const row = webhookToOrderRow({ eventID: 'SOME_FUTURE_EVENT', payload: { webhookData: {} } })
    expect(row.status).toBe('UNKNOWN')
  })

  it('handles missing webhookData gracefully', () => {
    const row = webhookToOrderRow({ eventID: 'ORDER_CREATED', payload: {} })
    expect(row.provider).toBe('transak')
    expect(row.id).toBeNull()
    expect(row.fiat_amount).toBeNull()
  })
})

describe('transak.classifyEvent', () => {
  it('routes ORDER_* events to "order"', () => {
    expect(classifyEvent('ORDER_CREATED')).toBe('order')
    expect(classifyEvent('ORDER_COMPLETED')).toBe('order')
    expect(classifyEvent('ORDER_FAILED')).toBe('order')
    expect(classifyEvent('ORDER_REFUNDED')).toBe('order')
  })

  it('routes the three KYC events to "kyc"', () => {
    expect(classifyEvent('KYC_SUBMITTED')).toBe('kyc')
    expect(classifyEvent('KYC_APPROVED')).toBe('kyc')
    expect(classifyEvent('KYC_REJECTED')).toBe('kyc')
  })

  it('falls back to "unknown" for unrecognised events', () => {
    expect(classifyEvent('SOMETHING_ELSE')).toBe('unknown')
    expect(classifyEvent('')).toBe('unknown')
    expect(classifyEvent(null)).toBe('unknown')
  })

  it('exports KYC_EVENT_IDS as a Set with exactly the three documented events', () => {
    expect(KYC_EVENT_IDS instanceof Set).toBe(true)
    expect(KYC_EVENT_IDS.size).toBe(3)
    expect(KYC_EVENT_IDS.has('KYC_APPROVED')).toBe(true)
  })
})

describe('transak.assertWebhookConfigSafe', () => {
  it('throws when insecure flag is set in production', () => {
    return withEnv(
      { TRANSAK_WEBHOOK_INSECURE: 'true', NODE_ENV: 'production', TRANSAK_ENV: undefined },
      () => {
        expect(() => assertWebhookConfigSafe()).toThrow(/not allowed when/i)
      },
    )
  })

  it('throws when insecure flag is set with TRANSAK_ENV=PRODUCTION', () => {
    return withEnv(
      { TRANSAK_WEBHOOK_INSECURE: 'true', NODE_ENV: undefined, TRANSAK_ENV: 'PRODUCTION' },
      () => {
        expect(() => assertWebhookConfigSafe()).toThrow()
      },
    )
  })

  it('does not throw when insecure flag is unset', () => {
    return withEnv(
      { TRANSAK_WEBHOOK_INSECURE: undefined, NODE_ENV: 'production' },
      () => {
        expect(() => assertWebhookConfigSafe()).not.toThrow()
      },
    )
  })

  it('warns but does not throw when insecure in dev', () => {
    return withEnv(
      { TRANSAK_WEBHOOK_INSECURE: 'true', NODE_ENV: 'development', TRANSAK_ENV: 'STAGING' },
      () => {
        expect(() => assertWebhookConfigSafe()).not.toThrow()
      },
    )
  })
})

describe('Transak mandatory API headers', () => {
  beforeEach(() => {
    vi.stubEnv('TRANSAK_ENV', 'STAGING')
    vi.stubEnv('TRANSAK_API_KEY', 'test-api-key')
    vi.stubEnv('TRANSAK_PARTNER_ACCESS_TOKEN', 'test-access-token')
    vi.stubEnv('TRANSAK_REFERRER_DOMAIN', 'https://app.onoff.finance')
    vi.stubEnv('TRANSAK_API_SECRET', '')
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('sends x-api-key and x-user-ip when creating a widget session', async () => {
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({
      data: { widgetUrl: 'https://global-stg.transak.com?sessionId=test' },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    await createSignedWidgetUrl({
      mode: 'buy',
      cryptoCurrency: 'BTC',
      cryptoNetwork: 'bitcoin',
      fiatCurrency: 'USD',
      fiatAmount: 100,
      walletAddress: 'bc1qexamplewallet',
      userIp: '203.0.113.42',
    })

    const [url, options] = fetch.mock.calls[0]
    expect(url).toBe('https://api-gateway-stg.transak.com/api/v2/auth/session')
    expect(options.headers['access-token']).toBe('test-access-token')
    expect(options.headers['x-api-key']).toBe('test-api-key')
    expect(options.headers['x-user-ip']).toBe('203.0.113.42')
  })

  it('uses both the required header and query parameter for public quotes', async () => {
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ response: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))

    await fetchPublicQuote({
      fiatCurrency: 'USD',
      cryptoCurrency: 'BTC',
      fiatAmount: 100,
      isBuyOrSell: 'BUY',
      network: 'bitcoin',
      userIp: '203.0.113.42',
    })

    const [url, options] = fetch.mock.calls[0]
    const parsed = new URL(url)
    expect(parsed.searchParams.get('partnerApiKey')).toBe('test-api-key')
    expect(options.headers['x-api-key']).toBe('test-api-key')
    expect(options.headers['x-user-ip']).toBe('203.0.113.42')
  })
})
