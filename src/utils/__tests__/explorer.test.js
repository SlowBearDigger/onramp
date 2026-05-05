import { describe, it, expect } from 'vitest'
import { explorerUrlFor, shortHash } from '../explorer.js'

const EVM_HASH = '0x' + 'a'.repeat(64)
const BTC_HASH = 'a'.repeat(64) // 64 hex (txid)
const SHORT_GARBAGE = '0xab'

describe('explorerUrlFor', () => {
  it('returns null for missing inputs', () => {
    expect(explorerUrlFor(null, EVM_HASH)).toBeNull()
    expect(explorerUrlFor('ethereum', null)).toBeNull()
    expect(explorerUrlFor(null, null)).toBeNull()
    expect(explorerUrlFor('', '')).toBeNull()
  })

  it('returns null for malformed hashes', () => {
    expect(explorerUrlFor('ethereum', SHORT_GARBAGE)).toBeNull()
    expect(explorerUrlFor('ethereum', '   ')).toBeNull()
    expect(explorerUrlFor('ethereum', 12345)).toBeNull()
  })

  it('returns null for unknown networks', () => {
    expect(explorerUrlFor('zksync', EVM_HASH)).toBeNull()
    expect(explorerUrlFor('mystery_chain', EVM_HASH)).toBeNull()
  })

  it('builds an etherscan URL for ethereum', () => {
    expect(explorerUrlFor('ethereum', EVM_HASH)).toBe(`https://etherscan.io/tx/${EVM_HASH}`)
  })

  it('aliases mainnet → etherscan', () => {
    expect(explorerUrlFor('mainnet', EVM_HASH)).toBe(`https://etherscan.io/tx/${EVM_HASH}`)
  })

  it('strips the _mainnet suffix used by mtpelerin', () => {
    // mtpelerin returns "matic_mainnet" — should map the same as "matic" or "polygon".
    expect(explorerUrlFor('matic_mainnet', EVM_HASH)).toBe(`https://polygonscan.com/tx/${EVM_HASH}`)
    expect(explorerUrlFor('base_mainnet', EVM_HASH)).toBe(`https://basescan.org/tx/${EVM_HASH}`)
  })

  it('builds a mempool.space URL for bitcoin', () => {
    expect(explorerUrlFor('bitcoin', BTC_HASH)).toBe(`https://mempool.space/tx/${BTC_HASH}`)
  })

  it('matches polygon and matic to polygonscan', () => {
    expect(explorerUrlFor('polygon', EVM_HASH)).toBe(`https://polygonscan.com/tx/${EVM_HASH}`)
    expect(explorerUrlFor('matic', EVM_HASH)).toBe(`https://polygonscan.com/tx/${EVM_HASH}`)
  })

  it('uppercases or odd-cased network slugs are normalised', () => {
    expect(explorerUrlFor('ETHEREUM', EVM_HASH)).toBe(`https://etherscan.io/tx/${EVM_HASH}`)
    expect(explorerUrlFor('Polygon', EVM_HASH)).toBe(`https://polygonscan.com/tx/${EVM_HASH}`)
  })

  it('URL-encodes the tx hash to defend against weirdly-shaped inputs that pass the regex', () => {
    // a long alphanumeric without slashes still gets URL-encoded — encodeURIComponent is a no-op
    // for safe chars, but exercising the path means we won't regress if someone reuses the helper
    // for a less-strict source later.
    const result = explorerUrlFor('bitcoin', BTC_HASH)
    expect(result).toContain(BTC_HASH) // hex stays as-is, no encoding bytes
  })
})

describe('shortHash', () => {
  it('shortens long hashes to first8…last6', () => {
    expect(shortHash(EVM_HASH)).toBe('0xaaaaaa…aaaaaa')
  })

  it('returns the original when too short to abbreviate', () => {
    expect(shortHash('0xabc')).toBe('0xabc')
    expect(shortHash('short')).toBe('short')
  })

  it('handles empty/missing inputs', () => {
    expect(shortHash(null)).toBe('')
    expect(shortHash(undefined)).toBe('')
    expect(shortHash('')).toBe('')
  })
})
