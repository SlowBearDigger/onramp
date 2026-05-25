// chain metadata for the SwapKit swap UI. each chain has a brand color
// for the badge + a short label for tight UI spots. ids match SwapKit's
// chain prefixes (ETH, BASE, ARB, ...) so we can derive a chain from a
// SwapKit asset string ('ETH.USDC-0x...' → 'ETH') trivially.

export const CHAINS = {
  ethereum: {
    id: 'ethereum',
    swapkitPrefix: 'ETH',
    name: 'Ethereum',
    short: 'ETH',
    color: '#627EEA',
    namespace: 'evm',
  },
  base: {
    id: 'base',
    swapkitPrefix: 'BASE',
    name: 'Base',
    short: 'BASE',
    color: '#0052FF',
    namespace: 'evm',
  },
  arbitrum: {
    id: 'arbitrum',
    swapkitPrefix: 'ARB',
    name: 'Arbitrum',
    short: 'ARB',
    color: '#28A0F0',
    namespace: 'evm',
  },
  optimism: {
    id: 'optimism',
    swapkitPrefix: 'OP',
    name: 'Optimism',
    short: 'OP',
    color: '#FF0420',
    namespace: 'evm',
  },
  polygon: {
    id: 'polygon',
    swapkitPrefix: 'MATIC',
    name: 'Polygon',
    short: 'POLY',
    color: '#8247E5',
    namespace: 'evm',
  },
  bsc: {
    id: 'bsc',
    swapkitPrefix: 'BSC',
    name: 'BNB Chain',
    short: 'BSC',
    color: '#F0B90B',
    namespace: 'evm',
  },
  avalanche: {
    id: 'avalanche',
    swapkitPrefix: 'AVAX',
    name: 'Avalanche',
    short: 'AVAX',
    color: '#E84142',
    namespace: 'evm',
  },
  solana: {
    id: 'solana',
    swapkitPrefix: 'SOL',
    name: 'Solana',
    short: 'SOL',
    color: '#14F195',
    namespace: 'solana',
  },
}

export const CHAIN_LIST = Object.values(CHAINS)

export function getChain(id) {
  return CHAINS[id] || null
}
