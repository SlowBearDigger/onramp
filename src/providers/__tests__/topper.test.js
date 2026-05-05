import { describe, it, expect } from 'vitest'
import topper from '../topper/index.js'

describe('topper provider', () => {
  it('declares hasWebhook=true', () => {
    expect(topper.getMetadata().hasWebhook).toBe(true)
  })

  it('only trusts the two app origins', () => {
    expect(topper.getOrigins()).toEqual([
      'https://app.sandbox.topperpay.com',
      'https://app.topperpay.com',
    ])
  })

  it('buildWidgetUrl produces a sandbox URL when env=STAGING (test default)', () => {
    const url = topper.buildWidgetUrl({}, { bt: 'fake.jwt.token' })
    expect(url).toMatch(/^https:\/\/app\.sandbox\.topperpay\.com\/\?bt=/)
    expect(new URL(url).searchParams.get('bt')).toBe('fake.jwt.token')
  })

  it('parseEvent returns type=unknown for any input (events not yet wired) but preserves rawEventId', () => {
    // confirms behavior of the current skeleton — this test will need updating
    // once topper's exact event names are wired in.
    expect(topper.parseEvent({ data: { name: 'order:crypto-onramp:committed' } }).type).toBe('unknown')
    expect(topper.parseEvent({ data: { name: 'order:crypto-onramp:committed' } }).rawEventId).toBe('order:crypto-onramp:committed')
  })

  it('parseEvent handles malformed events without throwing', () => {
    expect(topper.parseEvent({}).type).toBe('unknown')
    expect(topper.parseEvent({ data: null }).type).toBe('unknown')
    expect(topper.parseEvent(null).type).toBe('unknown')
  })
})
