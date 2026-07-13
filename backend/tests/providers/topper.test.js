import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateKeyPair, exportJWK, FlattenedSign } from 'jose'

// helper: spin up a fresh keypair, set the env vars topper expects, then
// reset the module cache and import a fresh copy so module-level reads of
// process.env happen against our test config. each call returns an isolated
// module instance — required because topper.js caches the imported keys in
// module-scope promises.
async function bootTopperWith({ widgetId = 'wid_test', keyId = 'kid_test' } = {}) {
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true })
  const privateJwk = await exportJWK(privateKey)
  const publicJwk = await exportJWK(publicKey)
  privateJwk.alg = 'ES256'
  publicJwk.alg = 'ES256'

  process.env.TOPPER_WIDGET_ID = widgetId
  process.env.TOPPER_KEY_ID = keyId
  process.env.TOPPER_PRIVATE_KEY_JWK = JSON.stringify(privateJwk)
  process.env.TOPPER_PUBLIC_KEY_JWK = JSON.stringify(publicJwk)
  process.env.TOPPER_ENV = 'STAGING'

  vi.resetModules()
  const mod = await import('../../providers/topper.js')
  return { mod, publicKey, privateKey, privateJwk, publicJwk, widgetId, keyId }
}

async function bootTopperUnconfigured() {
  delete process.env.TOPPER_WIDGET_ID
  delete process.env.TOPPER_KEY_ID
  delete process.env.TOPPER_PRIVATE_KEY_JWK
  delete process.env.TOPPER_PUBLIC_KEY_JWK
  vi.resetModules()
  return await import('../../providers/topper.js')
}

beforeEach(() => {
  vi.resetModules()
})

// craft a detached JWS for a given body+private key, returning the
// "<header>..<signature>" format topper sends in the X-Topper-JWS-Signature
// header.
async function detachJws(body, privateKey) {
  const flat = await new FlattenedSign(Buffer.from(body, 'utf8'))
    .setProtectedHeader({ alg: 'ES256' })
    .sign(privateKey)
  return `${flat.protected}..${flat.signature}`
}

describe('topper.signBootstrapToken', () => {
  it('produces a JWT with the expected claims and 3-minute exp', async () => {
    const { mod, publicKey, widgetId, keyId } = await bootTopperWith()
    const jwt = await mod.signBootstrapToken({
      source: { asset: 'USD', amount: 100, paymentMethod: { network: 'card' } },
      target: { asset: 'BTC', network: 'bitcoin', address: 'bc1q...' },
      partner: { displayName: 'Test' },
    })
    expect(jwt.split('.').length).toBe(3)

    // verify the signature with the public key and inspect claims.
    const { jwtVerify } = await import('jose')
    const { payload, protectedHeader } = await jwtVerify(jwt, publicKey, { algorithms: ['ES256'] })
    expect(protectedHeader.kid).toBe(keyId)
    expect(payload.sub).toBe(widgetId)
    expect(payload.recipientEditMode).toBe('not-editable')
    expect(payload.source.amount).toBe(100)
    expect(payload.target.asset).toBe('BTC')
    expect(payload.exp - payload.iat).toBe(180) // 3 minutes
    expect(typeof payload.jti).toBe('string')
    expect(payload.jti.length).toBeGreaterThan(8)
  })

  it('forwards partnerOrderId / partnerCustomerId when provided', async () => {
    const { mod, publicKey } = await bootTopperWith()
    const jwt = await mod.signBootstrapToken({
      source: { asset: 'USD', amount: 50, paymentMethod: { network: 'card' } },
      target: { asset: 'ETH', network: 'ethereum', address: '0xabc' },
      partnerOrderId: 'order_42',
      partnerCustomerId: 'cust_99',
    })
    const { jwtVerify } = await import('jose')
    const { payload } = await jwtVerify(jwt, publicKey, { algorithms: ['ES256'] })
    expect(payload.partnerOrderId).toBe('order_42')
    expect(payload.partnerCustomerId).toBe('cust_99')
  })

  it('throws when topper is not configured', async () => {
    const mod = await bootTopperUnconfigured()
    await expect(mod.signBootstrapToken({ source: {}, target: {} })).rejects.toThrow(/not configured/)
  })
})

describe('topper.verifyOrderWebhook', () => {
  it('verifies a valid detached JWS and returns the parsed payload', async () => {
    const { mod, privateKey } = await bootTopperWith()
    const body = JSON.stringify({
      name: 'order:crypto-onramp:completed',
      data: {
        id: 'topper_ord_1',
        target: { asset: 'BTC', amount: '0.001', address: 'bc1q...' },
        source: { asset: 'USD', amount: 100 },
      },
    })
    const sig = await detachJws(body, privateKey)
    const result = await mod.verifyOrderWebhook(body, sig)
    expect(result.name).toBe('order:crypto-onramp:completed')
    expect(result.data.id).toBe('topper_ord_1')
  })

  it('rejects when the body is tampered after signing', async () => {
    const { mod, privateKey } = await bootTopperWith()
    const original = JSON.stringify({ name: 'order:crypto-onramp:completed', data: { id: 'x' } })
    const sig = await detachJws(original, privateKey)
    const tampered = JSON.stringify({ name: 'order:crypto-onramp:completed', data: { id: 'attacker' } })
    await expect(mod.verifyOrderWebhook(tampered, sig)).rejects.toThrow()
  })

  it('rejects an alg=none header', async () => {
    const { mod } = await bootTopperWith()
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')
    await expect(
      mod.verifyOrderWebhook(JSON.stringify({ name: 'x' }), `${header}..`)
    ).rejects.toThrow()
  })

  it('rejects a malformed signature header', async () => {
    const { mod } = await bootTopperWith()
    await expect(mod.verifyOrderWebhook('{}', 'no-double-dot')).rejects.toThrow(/malformed|missing/)
    await expect(mod.verifyOrderWebhook('{}', '')).rejects.toThrow()
  })

  it('rejects when payload is valid JWS but missing event name', async () => {
    const { mod, privateKey } = await bootTopperWith()
    const body = JSON.stringify({ data: { id: 'x' } }) // no `name`
    const sig = await detachJws(body, privateKey)
    await expect(mod.verifyOrderWebhook(body, sig)).rejects.toThrow(/event name/)
  })
})

describe('topper.webhookToOrderRow', () => {
  it('maps a completed event to COMPLETED with all fields', async () => {
    const { mod } = await bootTopperWith()
    const row = mod.webhookToOrderRow({
      name: 'order:crypto-onramp:completed',
      data: {
        id: 'topper_ord_1',
        partnerOrderId: 'p_99',
        target: { asset: 'BTC', amount: '0.001', address: 'bc1q...', network: 'bitcoin' },
        source: { asset: 'USD', amount: 100 },
        transactionHash: '0xhash',
        createdAt: '2026-01-01T00:00:00Z',
      },
    })
    expect(row.provider).toBe('topper')
    expect(row.unverified).toBe(0)
    expect(row.status).toBe('COMPLETED')
    expect(row.id).toBe('topper_ord_1')
    expect(row.crypto_currency).toBe('BTC')
    expect(row.crypto_amount).toBe(0.001)
    expect(row.fiat_currency).toBe('USD')
    expect(row.wallet_address).toBe('bc1q...')
    expect(row.tx_hash).toBe('0xhash')
  })

  it('falls back to UNKNOWN for unmapped event names', async () => {
    const { mod } = await bootTopperWith()
    const row = mod.webhookToOrderRow({
      name: 'order:weird:event',
      data: { id: 'x', target: {}, source: {} },
    })
    expect(row.status).toBe('UNKNOWN')
  })

  it('maps each known event name to the correct status', async () => {
    const { mod } = await bootTopperWith()
    const cases = [
      ['order:crypto-onramp:committed', 'AWAITING_PAYMENT_FROM_USER'],
      ['order:crypto-onramp:charged', 'PROCESSING'],
      ['order:crypto-onramp:crypto-sent', 'PROCESSING'],
      ['order:crypto-onramp:completed', 'COMPLETED'],
      ['order:crypto-onramp:failed', 'FAILED'],
      ['order:crypto-onramp:refund:completed', 'REFUNDED'],
    ]
    for (const [eventName, expected] of cases) {
      const row = mod.webhookToOrderRow({ name: eventName, data: { id: 'x', target: {}, source: {} } })
      expect(row.status, `event ${eventName}`).toBe(expected)
    }
  })
})

describe('topper.assertTopperConfigSafe', () => {
  it('throws when only some env vars are set (partial config)', async () => {
    process.env.TOPPER_WIDGET_ID = 'wid_x'
    delete process.env.TOPPER_KEY_ID
    delete process.env.TOPPER_PRIVATE_KEY_JWK
    delete process.env.TOPPER_PUBLIC_KEY_JWK
    vi.resetModules()
    const mod = await import('../../providers/topper.js')
    expect(() => mod.assertTopperConfigSafe()).toThrow(/partial configuration/)
  })

  it('does not throw when nothing is set (topper disabled)', async () => {
    const mod = await bootTopperUnconfigured()
    expect(() => mod.assertTopperConfigSafe()).not.toThrow()
    expect(mod.isTopperEnabled()).toBe(false)
  })
})
