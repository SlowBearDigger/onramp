import { describe, it, expect } from 'vitest'
import transak, { TRANSAK_ORIGINS, parseOrderData, isTransakOrigin } from '../transak/index.js'
import { assertIsProvider } from '../Provider.js'

describe('transak provider — interface conformance', () => {
  it('matches the Provider interface', () => {
    expect(() => assertIsProvider(transak, 'transak')).not.toThrow()
  })

  it('declares hasWebhook=true (it is the source of truth for orders)', () => {
    expect(transak.getMetadata().hasWebhook).toBe(true)
  })

  it('lists at least 5 fiat and 5 crypto codes', () => {
    const meta = transak.getMetadata()
    expect(meta.supportedFiat.length).toBeGreaterThanOrEqual(5)
    expect(meta.supportedCrypto.length).toBeGreaterThanOrEqual(5)
  })
})

describe('transak.parseEvent', () => {
  it('classifies WIDGET_OPEN as type=open', () => {
    const ev = transak.parseEvent({ data: { event_id: 'TRANSAK_WIDGET_OPEN' } })
    expect(ev.type).toBe('open')
  })

  it('classifies ORDER_SUCCESSFUL as type=success and flattens orderData', () => {
    const ev = transak.parseEvent({
      data: {
        event_id: 'TRANSAK_ORDER_SUCCESSFUL',
        data: {
          status: {
            id: 'order_42',
            status: 'COMPLETED',
            cryptoCurrency: 'BTC',
            cryptoAmount: 0.0023,
            walletAddress: 'bc1q',
            transactionHash: '0xhash',
          },
        },
      },
    })
    expect(ev.type).toBe('success')
    expect(ev.orderData.orderId).toBe('order_42')
    expect(ev.orderData.status).toBe('COMPLETED')
    expect(ev.orderData.cryptoCurrency).toBe('BTC')
    expect(ev.orderData.txHash).toBe('0xhash')
  })

  it('classifies ORDER_FAILED as type=failed', () => {
    const ev = transak.parseEvent({ data: { event_id: 'TRANSAK_ORDER_FAILED', data: {} } })
    expect(ev.type).toBe('failed')
  })

  it('classifies ORDER_CANCELLED as type=cancelled', () => {
    const ev = transak.parseEvent({ data: { event_id: 'TRANSAK_ORDER_CANCELLED', data: {} } })
    expect(ev.type).toBe('cancelled')
  })

  it('classifies WIDGET_CLOSE as type=closed', () => {
    const ev = transak.parseEvent({ data: { event_id: 'TRANSAK_WIDGET_CLOSE' } })
    expect(ev.type).toBe('closed')
  })

  it('returns type=unknown for unrecognised events', () => {
    const ev = transak.parseEvent({ data: { event_id: 'TRANSAK_FUTURE_EVENT' } })
    expect(ev.type).toBe('unknown')
    expect(ev.rawEventId).toBe('TRANSAK_FUTURE_EVENT')
  })

  it('returns type=unknown for malformed events without throwing', () => {
    expect(transak.parseEvent({}).type).toBe('unknown')
    expect(transak.parseEvent({ data: null }).type).toBe('unknown')
    expect(transak.parseEvent({ data: 'string' }).type).toBe('unknown')
    expect(transak.parseEvent(null).type).toBe('unknown')
  })
})

describe('transak.parseOrderData', () => {
  it('flattens the legacy nested .status shape', () => {
    const data = parseOrderData({
      status: {
        id: 'x',
        partnerOrderId: 'p',
        cryptoCurrency: 'ETH',
        cryptoAmount: 0.5,
      },
    })
    expect(data.orderId).toBe('x')
    expect(data.partnerOrderId).toBe('p')
    expect(data.cryptoCurrency).toBe('ETH')
  })

  it('flattens the newer flat shape', () => {
    const data = parseOrderData({
      id: 'x',
      cryptoCurrency: 'ETH',
    })
    expect(data.orderId).toBe('x')
    expect(data.cryptoCurrency).toBe('ETH')
  })

  it('returns nulls for missing fields without throwing', () => {
    expect(parseOrderData(null).orderId).toBeNull()
    expect(parseOrderData(undefined).orderId).toBeNull()
    expect(parseOrderData({}).orderId).toBeNull()
  })
})

describe('transak.isTransakOrigin', () => {
  it('matches every declared trusted origin', () => {
    for (const origin of TRANSAK_ORIGINS) {
      expect(isTransakOrigin(origin)).toBe(true)
    }
  })

  it('rejects untrusted origins', () => {
    expect(isTransakOrigin('https://attacker.com')).toBe(false)
    expect(isTransakOrigin('http://global.transak.com')).toBe(false) // wrong scheme
    expect(isTransakOrigin('https://global.transak.com.attacker.com')).toBe(false)
    expect(isTransakOrigin('')).toBe(false)
    expect(isTransakOrigin(null)).toBe(false)
  })
})
