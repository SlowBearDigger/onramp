import { useAppKit, useAppKitAccount, useDisconnect } from '@reown/appkit/react'
import { REOWN_PROJECT_ID } from '../wallet/config'

// unified wallet hook. uses only Reown's adapter-agnostic hooks (no
// wagmi context required) so this component can render anywhere in the
// tree without needing WagmiProvider mounted. when SwapKit needs to
// sign transactions via wagmi's primitives, we'll mount WagmiProvider
// scoped to the swap route only.
//
// returns:
//   isConfigured: boolean   — REOWN_PROJECT_ID is set
//   isConnected: boolean    — wallet is currently connected
//   address:    string|null — connected address (EVM or Solana style)
//   chainKind:  'evm' | 'solana' | string | null
//   chainId:    number|string|null
//   open:       () => void  — open the connect modal
//   disconnect: () => void  — disconnect current connection

export function useWallet() {
  const { open } = useAppKit()
  const account = useAppKitAccount()
  const { disconnect } = useDisconnect()

  const address = account?.address || null
  const isConnected = Boolean(account?.isConnected && address)

  // chainNamespace = 'eip155' (EVM) | 'solana' | 'bip122' (Bitcoin) | etc.
  let chainKind = null
  if (isConnected) {
    if (account.chainNamespace === 'eip155') chainKind = 'evm'
    else if (account.chainNamespace === 'solana') chainKind = 'solana'
    else chainKind = account.chainNamespace || 'unknown'
  }

  return {
    isConfigured: Boolean(REOWN_PROJECT_ID),
    isConnected,
    address,
    chainKind,
    chainId: account?.chainId || null,
    open: () => open(),
    disconnect: () => disconnect(),
  }
}

// short address: 0x1234…abcd (EVM) or first4…last4 (Solana / others).
export function shortAddress(addr) {
  if (typeof addr !== 'string' || addr.length < 12) return addr || ''
  if (addr.startsWith('0x')) return `${addr.slice(0, 6)}…${addr.slice(-4)}`
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`
}
