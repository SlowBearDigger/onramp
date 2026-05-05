import TokenBTC from '@web3icons/react/icons/tokens/TokenBTC'
import TokenETH from '@web3icons/react/icons/tokens/TokenETH'
import TokenSOL from '@web3icons/react/icons/tokens/TokenSOL'
import TokenUSDT from '@web3icons/react/icons/tokens/TokenUSDT'
import TokenUSDC from '@web3icons/react/icons/tokens/TokenUSDC'
import TokenBNB from '@web3icons/react/icons/tokens/TokenBNB'
import TokenXRP from '@web3icons/react/icons/tokens/TokenXRP'
import TokenADA from '@web3icons/react/icons/tokens/TokenADA'
import TokenAVAX from '@web3icons/react/icons/tokens/TokenAVAX'
import TokenDOGE from '@web3icons/react/icons/tokens/TokenDOGE'
import TokenDOT from '@web3icons/react/icons/tokens/TokenDOT'
import TokenMATIC from '@web3icons/react/icons/tokens/TokenMATIC'
import { CreditCard, Bank, AppleLogo, DeviceMobile } from '@phosphor-icons/react'

const ICON_MAP = {
  BTC: TokenBTC,
  ETH: TokenETH,
  SOL: TokenSOL,
  USDT: TokenUSDT,
  USDC: TokenUSDC,
  BNB: TokenBNB,
  XRP: TokenXRP,
  ADA: TokenADA,
  AVAX: TokenAVAX,
  DOGE: TokenDOGE,
  DOT: TokenDOT,
  MATIC: TokenMATIC,
}

// `rate` is the cached/fallback price used when the live ticker is offline
// (CSP block, network drop, rate limit). it should be refreshed periodically
// so it doesn't drift too far from market.
//
// `coingeckoId` is the asset id used by api.coingecko.com (the public
// pricing source). null for assets coingecko doesn't track.
export const CRYPTOS = [
  { symbol: 'BTC',  label: 'Bitcoin',    rate: 68432.12, color: '#F7931A', colorLight: '#FFF3E0', network: 'bitcoin',    transakCode: 'BTC',  coingeckoId: 'bitcoin' },
  { symbol: 'ETH',  label: 'Ethereum',   rate: 3241.55,  color: '#627EEA', colorLight: '#E8EAF6', network: 'ethereum',   transakCode: 'ETH',  coingeckoId: 'ethereum' },
  { symbol: 'SOL',  label: 'Solana',     rate: 172.30,   color: '#9945FF', colorLight: '#F3E5F5', network: 'solana',     transakCode: 'SOL',  coingeckoId: 'solana' },
  { symbol: 'USDT', label: 'Tether',     rate: 1.00,     color: '#26A17B', colorLight: '#E0F2F1', network: 'ethereum',   transakCode: 'USDT', coingeckoId: 'tether' },
  { symbol: 'USDC', label: 'USD Coin',   rate: 1.00,     color: '#2775CA', colorLight: '#E3F2FD', network: 'ethereum',   transakCode: 'USDC', coingeckoId: 'usd-coin' },
  { symbol: 'BNB',  label: 'BNB',        rate: 598.40,   color: '#F3BA2F', colorLight: '#FFF8E1', network: 'bsc',        transakCode: 'BNB',  coingeckoId: 'binancecoin' },
  { symbol: 'XRP',  label: 'XRP',        rate: 0.62,     color: '#23292F', colorLight: '#ECEFF1', network: 'ripple',     transakCode: 'XRP',  coingeckoId: 'ripple' },
  { symbol: 'ADA',  label: 'Cardano',    rate: 0.45,     color: '#0033AD', colorLight: '#E8EAF6', network: 'cardano',    transakCode: 'ADA',  coingeckoId: 'cardano' },
  { symbol: 'AVAX', label: 'Avalanche',  rate: 35.20,    color: '#E84142', colorLight: '#FFEBEE', network: 'avalanche',  transakCode: 'AVAX', coingeckoId: 'avalanche-2' },
  { symbol: 'DOGE', label: 'Dogecoin',   rate: 0.082,    color: '#C2A633', colorLight: '#FFF8E1', network: 'dogecoin',   transakCode: 'DOGE', coingeckoId: 'dogecoin' },
  { symbol: 'DOT',  label: 'Polkadot',   rate: 7.15,     color: '#E6007A', colorLight: '#FCE4EC', network: 'polkadot',   transakCode: 'DOT',  coingeckoId: 'polkadot' },
  { symbol: 'MATIC',label: 'Polygon',    rate: 0.58,     color: '#8247E5', colorLight: '#EDE7F6', network: 'polygon',    transakCode: 'MATIC',coingeckoId: 'matic-network' },
]

// no flag emojis — they render inconsistently across platforms (apple
// glossy / google flat / windows blocky) and the polychrome look clashes
// with the monochrome trader-terminal chrome. the iso code + currency
// symbol carry the recognition load.
export const FIAT_OPTIONS = [
  { code: 'USD', symbol: '$' },
  { code: 'EUR', symbol: '€' },
  { code: 'GBP', symbol: '£' },
  { code: 'ARS', symbol: '$' },
  { code: 'BRL', symbol: 'R$' },
  { code: 'MXN', symbol: '$' },
]

export const PAYMENT_METHODS = [
  { id: 'card', Icon: CreditCard, label: 'Credit & Debit Card' },
  { id: 'bank', Icon: Bank, label: 'Bank Transfer' },
  { id: 'apple', Icon: AppleLogo, label: 'Apple Pay' },
  { id: 'google', Icon: DeviceMobile, label: 'Google Pay' },
]

export function CryptoIcon({ symbol, size = 24, ...props }) {
  const Icon = ICON_MAP[symbol]
  if (!Icon) return null
  return <Icon variant="branded" size={size} {...props} />
}
