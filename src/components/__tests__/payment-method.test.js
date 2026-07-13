import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  fileURLToPath(new URL('../SwapWidget.jsx', import.meta.url)),
  'utf8',
)

describe('provider-backed payment method selection', () => {
  it('does not present a local selector that providers ignore', () => {
    expect(source).not.toContain('PAYMENT_METHODS')
    expect(source).not.toContain('payMethod')
    expect(source).not.toContain('showPayMenu')
  })
})
