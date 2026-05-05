import { describe, it, expect } from 'vitest'
import { toUiShape } from '../useOrders.js'

// toUiShape is the pure mapper — covers the bug fixes (provider hardcoded,
// rawStatus missing) and the new fields (unverified, network, detailKey).
// the hook itself (polling, fetch lifecycle) is tested by integration when
// the dev environment is up; pure mapper unit tests keep the regression
// surface tight.

describe('toUiShape', () => {
  it('reads the provider from the row instead of hardcoding "Transak"', () => {
    expect(toUiShape({ provider: 'topper', status: 'COMPLETED' }).provider).toBe('Topper')
    expect(toUiShape({ provider: 'mtpelerin', status: 'COMPLETED' }).provider).toBe('Mt Pelerin')
    expect(toUiShape({ provider: 'transak', status: 'COMPLETED' }).provider).toBe('Transak')
  })

  it('preserves the raw status (so polling can detect in-flight states)', () => {
    const ui = toUiShape({ provider: 'transak', status: 'PROCESSING' })
    expect(ui.rawStatus).toBe('PROCESSING')
  })

  it('buckets COMPLETED → completed', () => {
    expect(toUiShape({ status: 'COMPLETED' }).status).toBe('completed')
  })

  it('buckets terminal failures → failed', () => {
    expect(toUiShape({ status: 'FAILED' }).status).toBe('failed')
    expect(toUiShape({ status: 'CANCELLED' }).status).toBe('failed')
    expect(toUiShape({ status: 'EXPIRED' }).status).toBe('failed')
  })

  it('buckets every in-flight raw status → pending', () => {
    const cases = [
      'AWAITING_PAYMENT_FROM_USER',
      'PAYMENT_DONE_MARKED_BY_USER',
      'PROCESSING',
      'PAYMENT_SUBMITTED_UNVERIFIED',
      'CREATED_UNVERIFIED',
    ]
    for (const s of cases) {
      expect(toUiShape({ status: s }).status, s).toBe('pending')
    }
  })

  it('exposes a granular detailKey distinct from the coarse bucket', () => {
    expect(toUiShape({ status: 'AWAITING_PAYMENT_FROM_USER' }).detailKey).toBe('awaitingPayment')
    expect(toUiShape({ status: 'PAYMENT_SUBMITTED_UNVERIFIED' }).detailKey).toBe('paymentSubmittedUnverified')
    expect(toUiShape({ status: 'PROCESSING' }).detailKey).toBe('processing')
    expect(toUiShape({ status: 'COMPLETED' }).detailKey).toBe('completed')
  })

  it('flags unverified rows as boolean true', () => {
    expect(toUiShape({ provider: 'mtpelerin', status: 'CREATED_UNVERIFIED', unverified: 1 }).unverified).toBe(true)
    expect(toUiShape({ provider: 'transak', status: 'COMPLETED', unverified: 0 }).unverified).toBe(false)
    expect(toUiShape({ provider: 'transak', status: 'COMPLETED' }).unverified).toBe(false)
  })

  it('passes the network through unchanged for explorer lookup', () => {
    expect(toUiShape({ network: 'bitcoin', status: 'COMPLETED' }).network).toBe('bitcoin')
    expect(toUiShape({ status: 'COMPLETED' }).network).toBeNull()
  })

  it('exposes updatedAt as a number for "X seconds ago" rendering', () => {
    const ts = 1_700_000_000_000
    expect(toUiShape({ updated_at: ts, status: 'COMPLETED' }).updatedAt).toBe(ts)
  })

  it('falls back gracefully when fields are missing', () => {
    const ui = toUiShape({})
    expect(ui.status).toBe('pending')
    expect(ui.amountUsd).toBe(0)
    expect(ui.amountCrypto).toBe('0')
    expect(ui.symbol).toBe('')
    expect(ui.providerId).toBe('unknown')
    expect(ui.unverified).toBe(false)
  })
})
