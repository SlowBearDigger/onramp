// Reown AppKit configuration.
//
// projectId comes from https://dashboard.reown.com. ours lives
// in VITE_REOWN_PROJECT_ID. it's PUBLIC by design (appears in the bundle),
// but having our own gives us:
//   - allowlist of authorized origins (set in the Reown dashboard)
//   - rate-limit headroom not shared with random projects
//   - basic analytics (connection attempts, wallet types)
//
// when migrating to app.onoff.finance, the client should create their own
// projectId and rotate this env var. nothing else changes.
//
// privacy posture: we explicitly disable Reown's analytics telemetry so
// the privacy disclosure ("we don't run analytics or trackers") stays
// truthful. Reown still does some essential telemetry for its relay
// network — that's part of the WalletConnect protocol and unavoidable.

import { mainnet, base, arbitrum, optimism, bsc, polygon, avalanche } from 'viem/chains'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { SolanaAdapter } from '@reown/appkit-adapter-solana'
import { solana } from '@reown/appkit/networks'

export const REOWN_PROJECT_ID = import.meta.env.VITE_REOWN_PROJECT_ID || ''

// EVM chains we support in V1. add chains by importing from viem/chains.
// Reown handles chain switching for us via the modal — user picks a
// chain when connecting or switches mid-session.
export const EVM_CHAINS = [mainnet, base, arbitrum, optimism, bsc, polygon, avalanche]

// wagmi adapter: drives EVM connections (MetaMask + WalletConnect + 50
// other wallets). uses public RPCs by default; for production we'd
// swap to Alchemy/Infura keys with a domain allowlist.
export const wagmiAdapter = new WagmiAdapter({
  networks: EVM_CHAINS,
  projectId: REOWN_PROJECT_ID,
  ssr: false,
})

// solana adapter: drives Phantom + Solflare + others.
export const solanaAdapter = new SolanaAdapter()

// metadata shown in the wallet connect dialog (the wallet shows this so
// the user can confirm what they're connecting to).
export const APP_METADATA = {
  name: 'OnRamp Aggregator',
  description: 'Buy, sell, and swap crypto in seconds.',
  url: typeof window !== 'undefined' ? window.location.origin : 'https://app.onoff.finance',
  icons: [
    typeof window !== 'undefined'
      ? `${window.location.origin}${import.meta.env.BASE_URL || '/'}pwa-192.png`
      : 'https://app.onoff.finance/pwa-192.png',
  ],
}

export const ALL_NETWORKS = [...EVM_CHAINS, solana]
