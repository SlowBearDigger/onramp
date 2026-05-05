// mock transactions. provider field uses display names matching the 3 real
// providers integrated under src/providers/. update both this list and
// MOCK_PROVIDERS below if more providers are added.
export const MOCK_TRANSACTIONS = [
  { id: 'tx_001', type: 'buy', symbol: 'BTC',  amountUsd: 500,    amountCrypto: '0.00731',  status: 'completed', date: '2026-04-14T09:12:00Z', wallet: '0xbc1q...8f3k', provider: 'Mt Pelerin', txHash: '0x7a3f...c921' },
  { id: 'tx_002', type: 'buy', symbol: 'ETH',  amountUsd: 250,    amountCrypto: '0.07712',  status: 'completed', date: '2026-04-13T14:30:00Z', wallet: '0x742d...F1a9', provider: 'Transak',    txHash: '0x91b2...e447' },
  { id: 'tx_003', type: 'sell', symbol: 'SOL', amountUsd: 180,    amountCrypto: '1.04520',  status: 'completed', date: '2026-04-13T11:05:00Z', wallet: '7Xkr...Qm4P',  provider: 'Topper',     txHash: '4sNx...Kp2r' },
  { id: 'tx_004', type: 'buy', symbol: 'BTC',  amountUsd: 1000,   amountCrypto: '0.01462',  status: 'pending',   date: '2026-04-14T10:45:00Z', wallet: '0xbc1q...8f3k', provider: 'Mt Pelerin', txHash: '0xf3a1...7b88' },
  { id: 'tx_005', type: 'buy', symbol: 'AVAX', amountUsd: 100,    amountCrypto: '2.84091',  status: 'completed', date: '2026-04-12T08:20:00Z', wallet: '0x1a2b...9c0d', provider: 'Topper',     txHash: '0x5c2d...a113' },
  { id: 'tx_006', type: 'sell', symbol: 'ETH', amountUsd: 620,    amountCrypto: '0.19123',  status: 'completed', date: '2026-04-11T16:42:00Z', wallet: '0x742d...F1a9', provider: 'Transak',    txHash: '0x8e4f...d229' },
  { id: 'tx_007', type: 'buy', symbol: 'DOGE', amountUsd: 50,     amountCrypto: '609.756',  status: 'failed',    date: '2026-04-11T12:15:00Z', wallet: 'D8jK...Wp3n',  provider: 'Topper',     txHash: null },
  { id: 'tx_008', type: 'buy', symbol: 'SOL',  amountUsd: 300,    amountCrypto: '1.74114',  status: 'completed', date: '2026-04-10T19:30:00Z', wallet: '7Xkr...Qm4P',  provider: 'Mt Pelerin', txHash: '3vRt...Jn8s' },
  { id: 'tx_009', type: 'sell', symbol: 'BTC', amountUsd: 2000,   amountCrypto: '0.02923',  status: 'completed', date: '2026-04-10T07:55:00Z', wallet: '0xbc1q...8f3k', provider: 'Topper',     txHash: '0xa7c3...5f16' },
  { id: 'tx_010', type: 'buy', symbol: 'USDC', amountUsd: 500,    amountCrypto: '499.50',   status: 'completed', date: '2026-04-09T13:10:00Z', wallet: '0x5e7f...2b1a', provider: 'Transak',    txHash: '0x2d9e...8c34' },
  { id: 'tx_011', type: 'buy', symbol: 'MATIC',amountUsd: 75,     amountCrypto: '129.310',  status: 'completed', date: '2026-04-08T10:00:00Z', wallet: '0x3c4d...7e8f', provider: 'Transak',    txHash: '0x6b1a...f492' },
  { id: 'tx_012', type: 'buy', symbol: 'DOT',  amountUsd: 200,    amountCrypto: '27.972',   status: 'pending',   date: '2026-04-14T11:20:00Z', wallet: '15oF...Kp9R',  provider: 'Mt Pelerin', txHash: '0xd4e5...2a77' },
]

// mock provider list — only the 3 real providers integrated under
// src/providers/. used by the SwapWidget hint text and as a fallback when
// the live registry isn't available (during prerender / storybook).
export const MOCK_PROVIDERS = [
  { name: 'Mt Pelerin', fee: '0.00', speed: 'Instant',   badge: 'Best Rate' },
  { name: 'Transak',    fee: '1.50', speed: '~2 min',    badge: null },
  { name: 'Topper',     fee: '1.00', speed: '~1 min',    badge: 'Lowest Fee' },
]

// ─── Processing Steps ─────────────────────────────────────────────────────
export const PROCESSING_STEPS = [
  { label: 'Connecting to provider...', duration: 1500 },
  { label: 'Processing payment...',     duration: 2000 },
  { label: 'Sending crypto to wallet...', duration: 1800 },
]

// ─── Helpers ──────────────────────────────────────────────────────────────
export function truncateAddress(addr) {
  if (!addr) return ''
  if (addr.length <= 12) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export function formatDate(iso) {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now - d
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function generateTxHash() {
  const chars = '0123456789abcdef'
  let hash = '0x'
  for (let i = 0; i < 64; i++) hash += chars[Math.floor(Math.random() * 16)]
  return hash
}
