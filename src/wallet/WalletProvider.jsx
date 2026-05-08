import { createAppKit } from '@reown/appkit/react'
import { wagmiAdapter, solanaAdapter, ALL_NETWORKS, APP_METADATA, REOWN_PROJECT_ID } from './config'

// Reown AppKit init. createAppKit() must be called exactly once at module
// load — calling it twice or in a child render breaks the modal's
// internal state. side-effect at import is intentional and matches
// Reown's official quickstart.
//
// telemetry disabled via `features.analytics: false` so our privacy
// disclosure stays truthful (essential WalletConnect relay traffic
// happens regardless — it's how the protocol works).
//
// when REOWN_PROJECT_ID is empty (dev hasn't set the env var yet) we
// still init with an empty string. Reown's modal will surface the
// misconfig when the user clicks Connect; our WalletButton checks
// REOWN_PROJECT_ID explicitly and renders disabled in that case.
//
// no React context required — Reown's hooks (useAppKit, useAppKitAccount)
// read from an internal singleton store. the WagmiProvider is only
// needed when we want wagmi's transaction primitives, which we'll add
// scoped to the swap route when implementing SwapKit.

createAppKit({
  adapters: [wagmiAdapter, solanaAdapter],
  networks: ALL_NETWORKS,
  projectId: REOWN_PROJECT_ID,
  metadata: APP_METADATA,
  features: {
    analytics: false,
    email: false,
    socials: false,
    onramp: false,
  },
  themeMode: 'auto',
})

// pass-through wrapper. exported for symmetry with other context-providing
// modules; future versions may wrap WagmiProvider here once we need
// wagmi's tx hooks. for now nothing to do at the React tree level.
export default function WalletProvider({ children }) {
  return children
}
