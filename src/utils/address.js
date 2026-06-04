import { isAddress } from 'viem'

// recipient address validation for the Pay flow.
//
// this is the security-critical surface: a payment goes to whatever address
// the user (or a shared link) provides, and crypto sends are irreversible.
// we validate as strictly as each chain family allows, and we tell the UI
// *how confident* we are so it can warn appropriately:
//   - valid + checksummed: format ok AND a cryptographic checksum passed.
//   - valid + !checksummed: format ok but the chain/representation gives us
//     no checksum to verify (e.g. all-lowercase EVM, base58 format-only).
//     the UI should still ask the user to eyeball it.
//   - invalid: wrong format or a failed checksum — block the send.
//
// we never "auto-correct" an address. if a checksum fails we reject; we do
// not silently lowercase-and-accept, because a failed checksum often means a
// transcription/clipboard-mangling error that would burn funds.

// EVM networks share the same 20-byte hex address space + EIP-55 checksum.
// keep in sync with CRYPTOS[].network values in src/config/cryptos.jsx.
const EVM_NETWORKS = new Set([
  'ethereum', 'base', 'arbitrum', 'optimism', 'polygon', 'bsc', 'avalanche',
])

// base58 alphabet (bitcoin/solana flavour) — excludes 0 O I l to avoid
// visual ambiguity. used for format-level checks where we don't decode.
const BASE58_RE = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/

const EVM_HEX_RE = /^0x[0-9a-fA-F]{40}$/

// bitcoin: legacy P2PKH/P2SH (1.../3...) and bech32 (bc1...). lengths are
// generous bounds — this is format validation, not full bech32 decode.
const BTC_LEGACY_RE = /^[13][a-km-zA-HJ-NP-Z1-9]{25,39}$/
const BTC_BECH32_RE = /^bc1[a-z0-9]{11,71}$/

// validate `address` for the given `network` (a CRYPTOS[].network string).
// returns { valid, checksummed?, reason? } — never throws.
export function validateAddress(address, network) {
  const addr = typeof address === 'string' ? address.trim() : ''
  if (!addr) return { valid: false, reason: 'empty' }

  if (EVM_NETWORKS.has(network)) return validateEvm(addr)
  if (network === 'solana') return validateSolana(addr)
  if (network === 'bitcoin') return validateBitcoin(addr)

  // unknown / not-yet-modelled network (XRP, ADA, DOT, DOGE, ...). we can't
  // assert a chain-specific format, so accept a sane-length non-whitespace
  // string and flag it as unchecked. the confirm step's "verify the address"
  // card carries the safety weight here.
  return validateGeneric(addr)
}

function validateEvm(addr) {
  if (!EVM_HEX_RE.test(addr)) return { valid: false, reason: 'format' }
  const body = addr.slice(2)
  const isMixedCase = /[a-f]/.test(body) && /[A-F]/.test(body)
  if (!isMixedCase) {
    // all-lowercase / all-uppercase / all-digits: valid format but no EIP-55
    // checksum signal to verify against. common — many wallets and explorers
    // emit lowercase. (viem's strict isAddress would reject all-uppercase, so
    // we short-circuit here rather than mislabel it invalid.)
    return { valid: true, checksummed: false }
  }
  // mixed case implies an EIP-55 checksum is present. strict isAddress returns
  // false if the checksum doesn't match — a real red flag (likely a typo or
  // clipboard mangling), so we reject rather than auto-correct.
  if (isAddress(addr, { strict: true })) return { valid: true, checksummed: true }
  return { valid: false, reason: 'checksum' }
}

function validateSolana(addr) {
  // solana addresses are base58-encoded 32-byte ed25519 pubkeys, which land
  // at 32–44 chars. we validate alphabet + length without decoding (avoids
  // pulling @solana/web3.js into this bundle). full on-curve decode is a
  // TODO if we ever want to reject off-curve / malformed pubkeys.
  if (addr.length < 32 || addr.length > 44) return { valid: false, reason: 'format' }
  if (!BASE58_RE.test(addr)) return { valid: false, reason: 'format' }
  return { valid: true, checksummed: false }
}

function validateBitcoin(addr) {
  if (BTC_BECH32_RE.test(addr)) return { valid: true, checksummed: false }
  if (BTC_LEGACY_RE.test(addr)) return { valid: true, checksummed: false }
  return { valid: false, reason: 'format' }
}

function validateGeneric(addr) {
  // loosest acceptable: alphanumeric (+ a few separators some chains use)
  // within a plausible address length. unchecked — surfaces in the UI as a
  // "we couldn't verify this address format" soft note.
  if (addr.length < 16 || addr.length > 120) return { valid: false, reason: 'format' }
  if (!/^[a-zA-Z0-9:_-]+$/.test(addr)) return { valid: false, reason: 'format' }
  return { valid: true, checksummed: false, unchecked: true }
}

// short display form for a verified address: 0x1234…abcd. keeps the head and
// tail (where transcription errors are easiest to spot) and elides the middle.
export function truncateAddress(address, head = 6, tail = 4) {
  const addr = typeof address === 'string' ? address.trim() : ''
  if (addr.length <= head + tail + 1) return addr
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`
}
