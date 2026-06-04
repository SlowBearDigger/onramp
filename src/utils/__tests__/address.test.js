import { describe, it, expect } from 'vitest'
import { validateAddress, truncateAddress } from '../address.js'

describe('validateAddress — EVM', () => {
  // vitalik.eth, properly EIP-55 checksummed
  const CHECKSUMMED = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'

  it('accepts a correctly checksummed address as checksummed', () => {
    const r = validateAddress(CHECKSUMMED, 'ethereum')
    expect(r.valid).toBe(true)
    expect(r.checksummed).toBe(true)
  })

  it('accepts all-lowercase as valid but not checksummed', () => {
    const r = validateAddress(CHECKSUMMED.toLowerCase(), 'ethereum')
    expect(r.valid).toBe(true)
    expect(r.checksummed).toBe(false)
  })

  it('rejects a mixed-case address with a broken checksum', () => {
    // flip the first hex letter's case ('d8dA…' → 'D8dA…'): stays mixed-case
    // so the validator treats it as checksummed, but the EIP-55 checksum no
    // longer matches.
    const tampered = '0xD8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
    const r = validateAddress(tampered, 'ethereum')
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('checksum')
  })

  it('rejects wrong length / non-hex', () => {
    expect(validateAddress('0x1234', 'ethereum').valid).toBe(false)
    expect(validateAddress('0xZZZZ6BF26964aF9D7eEd9e03E53415D37aA96045', 'ethereum').valid).toBe(false)
    expect(validateAddress('d8dA6BF26964aF9D7eEd9e03E53415D37aA96045', 'ethereum').valid).toBe(false) // no 0x
  })

  it('applies EVM rules across all EVM networks', () => {
    for (const net of ['base', 'arbitrum', 'optimism', 'polygon', 'bsc', 'avalanche']) {
      expect(validateAddress(CHECKSUMMED, net).valid).toBe(true)
    }
  })
})

describe('validateAddress — Solana', () => {
  // a real-length base58 solana address
  const SOL = '7EYnhQoR9YM3N7UoaKRoA44Uy8JeaZV3qyouov87awMs'

  it('accepts a well-formed base58 address (format-only, not checksummed)', () => {
    const r = validateAddress(SOL, 'solana')
    expect(r.valid).toBe(true)
    expect(r.checksummed).toBe(false)
  })

  it('rejects too-short and non-base58 (contains 0 O I l)', () => {
    expect(validateAddress('abc', 'solana').valid).toBe(false)
    expect(validateAddress('0OIl' + SOL.slice(4), 'solana').valid).toBe(false)
  })
})

describe('validateAddress — Bitcoin', () => {
  it('accepts legacy and bech32', () => {
    expect(validateAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 'bitcoin').valid).toBe(true)
    expect(validateAddress('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', 'bitcoin').valid).toBe(true)
  })

  it('rejects garbage', () => {
    expect(validateAddress('not-a-btc-address', 'bitcoin').valid).toBe(false)
  })
})

describe('validateAddress — generic / unknown networks', () => {
  it('accepts a plausible address but flags it unchecked', () => {
    const r = validateAddress('rPdvC6ccq8hCdPKSPJkPmyZ4Mi1oG2FFkT', 'ripple')
    expect(r.valid).toBe(true)
    expect(r.unchecked).toBe(true)
  })

  it('rejects empty and too-short', () => {
    expect(validateAddress('', 'ripple').valid).toBe(false)
    expect(validateAddress('short', 'ripple').valid).toBe(false)
  })
})

describe('validateAddress — defensive', () => {
  it('never throws on bad input', () => {
    expect(() => validateAddress(null, 'ethereum')).not.toThrow()
    expect(() => validateAddress(undefined, undefined)).not.toThrow()
    expect(() => validateAddress(12345, 'ethereum')).not.toThrow()
    expect(validateAddress(null, 'ethereum').valid).toBe(false)
  })

  it('trims surrounding whitespace before validating', () => {
    const r = validateAddress('  0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045  ', 'ethereum')
    expect(r.valid).toBe(true)
  })
})

describe('truncateAddress', () => {
  it('elides the middle of a long address', () => {
    expect(truncateAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045')).toBe('0xd8dA…6045')
  })
  it('leaves short strings intact', () => {
    expect(truncateAddress('0x1234')).toBe('0x1234')
  })
  it('handles non-strings', () => {
    expect(truncateAddress(null)).toBe('')
  })
})
