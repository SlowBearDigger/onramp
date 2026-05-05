// block-explorer URL builder.
//
// given a tx hash + the network slug we get from the provider webhook, return
// a public block-explorer URL the user can open to verify the transaction
// on-chain. returns null when we don't have a mapping — the caller renders
// the hash as plain text in that case rather than a broken link.
//
// network slugs follow the canonical names used in src/config/cryptos.jsx
// and the provider modules (mtpelerin / topper map to these too).

const EXPLORERS = {
  // L1 / major chains
  bitcoin:    (hash) => `https://mempool.space/tx/${hash}`,
  ethereum:   (hash) => `https://etherscan.io/tx/${hash}`,
  mainnet:    (hash) => `https://etherscan.io/tx/${hash}`,
  solana:     (hash) => `https://solscan.io/tx/${hash}`,
  dogecoin:   (hash) => `https://dogechain.info/tx/${hash}`,
  polkadot:   (hash) => `https://polkadot.subscan.io/extrinsic/${hash}`,
  // L2 / EVM sidechains
  polygon:    (hash) => `https://polygonscan.com/tx/${hash}`,
  matic:      (hash) => `https://polygonscan.com/tx/${hash}`,
  arbitrum:   (hash) => `https://arbiscan.io/tx/${hash}`,
  optimism:   (hash) => `https://optimistic.etherscan.io/tx/${hash}`,
  base:       (hash) => `https://basescan.org/tx/${hash}`,
  avalanche:  (hash) => `https://snowtrace.io/tx/${hash}`,
  bsc:        (hash) => `https://bscscan.com/tx/${hash}`,
}

// loose tx-hash regex: 0x + 64 hex (evm), or 64 hex (btc/sol-ish), or 40+
// alphanumerics. we don't strictly validate per chain — the explorer will
// return its own error page if the hash is malformed. this is just a guard
// against rendering a clickable garbage link.
const HASH_RE = /^[0-9a-zA-Z]{32,128}$|^0x[0-9a-fA-F]{64}$/

export function explorerUrlFor(network, txHash) {
  if (!network || !txHash) return null
  if (typeof txHash !== 'string' || !HASH_RE.test(txHash)) return null

  // normalise the network slug — we accept canonical names or mtpelerin's
  // <name>_mainnet variants (e.g. "matic_mainnet"). strip the suffix.
  const slug = String(network)
    .toLowerCase()
    .trim()
    .replace(/_mainnet$/, '')

  const builder = EXPLORERS[slug]
  return builder ? builder(encodeURIComponent(txHash)) : null
}

// short-display the hash for tight UI (first 8 + last 6).
export function shortHash(hash) {
  if (typeof hash !== 'string' || hash.length < 16) return hash || ''
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`
}
