import { describe, it, expect } from 'vitest'
import { validateFrontendEvent, frontendEventToOrderRow } from '../../providers/mtpelerin.js'

describe('mtpelerin.validateFrontendEvent', () => {
  it('accepts a well-formed paymentSubmitted event', () => {
    expect(() => validateFrontendEvent({
      eventType: 'paymentSubmitted',
      partnerOrderId: 'p_1',
      walletAddress: '0xabc',
      fiatCurrency: 'USD',
      cryptoCurrency: 'BTC',
      network: 'bitcoin',
      fiatAmount: 100,
      cryptoAmount: 0.001,
    })).not.toThrow()
  })

  it('accepts orderCreated as a valid eventType', () => {
    expect(() => validateFrontendEvent({
      eventType: 'orderCreated',
      walletAddress: '0xabc',
    })).not.toThrow()
  })

  it('rejects missing body', () => {
    expect(() => validateFrontendEvent(null)).toThrow(/body missing/)
    expect(() => validateFrontendEvent(undefined)).toThrow()
    expect(() => validateFrontendEvent('string')).toThrow()
  })

  it('rejects unknown eventTypes', () => {
    expect(() => validateFrontendEvent({ eventType: 'fishyEvent' })).toThrow(/eventType/)
  })

  it('rejects malformed currency codes', () => {
    expect(() => validateFrontendEvent({
      eventType: 'paymentSubmitted',
      fiatCurrency: 'us', // lowercase, too short
    })).toThrow(/fiatCurrency/)
    expect(() => validateFrontendEvent({
      eventType: 'paymentSubmitted',
      cryptoCurrency: 'B', // too short
    })).toThrow(/cryptoCurrency/)
  })

  it('rejects out-of-range fiat amounts', () => {
    expect(() => validateFrontendEvent({
      eventType: 'paymentSubmitted',
      fiatAmount: -50,
    })).toThrow(/fiatAmount/)
    expect(() => validateFrontendEvent({
      eventType: 'paymentSubmitted',
      fiatAmount: 999_999_999, // over 1M cap
    })).toThrow(/fiatAmount/)
  })

  it('rejects negative crypto amounts', () => {
    expect(() => validateFrontendEvent({
      eventType: 'paymentSubmitted',
      cryptoAmount: -0.001,
    })).toThrow(/cryptoAmount/)
  })

  it('rejects oversized free-text fields', () => {
    expect(() => validateFrontendEvent({
      eventType: 'paymentSubmitted',
      walletAddress: 'a'.repeat(500), // way over FIELD_MAX_LEN
    })).toThrow(/walletAddress/)
  })
})

describe('mtpelerin.frontendEventToOrderRow', () => {
  it('flags rows as unverified=1', () => {
    const row = frontendEventToOrderRow({
      eventType: 'paymentSubmitted',
      partnerOrderId: 'p_1',
      walletAddress: '0xabc',
      fiatCurrency: 'USD',
      cryptoCurrency: 'BTC',
      fiatAmount: 100,
    })
    expect(row.unverified).toBe(1)
    expect(row.provider).toBe('mtpelerin')
  })

  it('uses PAYMENT_SUBMITTED_UNVERIFIED status for paymentSubmitted', () => {
    const row = frontendEventToOrderRow({ eventType: 'paymentSubmitted' })
    expect(row.status).toBe('PAYMENT_SUBMITTED_UNVERIFIED')
  })

  it('uses CREATED_UNVERIFIED status for orderCreated', () => {
    const row = frontendEventToOrderRow({ eventType: 'orderCreated' })
    expect(row.status).toBe('CREATED_UNVERIFIED')
  })

  it('falls back to a synthetic id when none provided', () => {
    const row = frontendEventToOrderRow({ eventType: 'paymentSubmitted' })
    expect(row.id).toMatch(/^mtpelerin-[0-9a-f-]{36}$/)
  })

  it('always uses a server-generated id, regardless of body.orderId or partnerOrderId', () => {
    // attacker can't claim a chosen id by setting body.orderId or
    // body.partnerOrderId; both are ignored for the primary key.
    const row1 = frontendEventToOrderRow({
      eventType: 'orderCreated',
      orderId: 'forged-id-collision-with-real-transak-order',
      partnerOrderId: 'forged-partner-id',
    })
    expect(row1.id).toMatch(/^mtpelerin-[0-9a-f-]{36}$/)
    expect(row1.id).not.toContain('forged')
    // partner_order_id column is still preserved for forensics.
    expect(row1.partner_order_id).toBe('forged-partner-id')
  })

  it('falls back to walletAddress for customer_id when partnerCustomerId missing', () => {
    const row = frontendEventToOrderRow({
      eventType: 'orderCreated',
      walletAddress: '0xfeedface',
    })
    expect(row.customer_id).toBe('0xfeedface')
  })

  it('marks SELL when mode=sell', () => {
    const row = frontendEventToOrderRow({ eventType: 'paymentSubmitted', mode: 'sell' })
    expect(row.product).toBe('SELL')
  })

  it('defaults to BUY otherwise', () => {
    const row = frontendEventToOrderRow({ eventType: 'paymentSubmitted' })
    expect(row.product).toBe('BUY')
  })
})
