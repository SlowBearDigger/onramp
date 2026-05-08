import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'motion/react'
import { ArrowsDownUp, Wallet, Info } from '@phosphor-icons/react'
import Sidebar from '../components/Sidebar'
import BottomNav from '../components/BottomNav'
import { BlurIn, Stagger, StaggerItem, MagneticButton } from '../components/Motion'
import { useWallet } from '../hooks/useWallet'
// side-effect: createAppKit fires when this page loads. SwapKitPage
// is itself route-level lazy (App.jsx), so this only kicks in when
// the user navigates to /swap.
import '../wallet/WalletProvider'

// crypto↔crypto swap page (powered by SwapKit cross-chain aggregator).
//
// scaffolds the UI shell only — quote/swap/sign integration lands in
// the next iteration. for now: source asset picker, destination asset
// picker, amount input, slippage control, "Connect wallet to continue"
// CTA when no wallet is attached, and a stub "Get Quote" button that's
// disabled.
//
// this page renders OUTSIDE the ramp app's SwapPage container — it
// shares Sidebar + BottomNav for nav consistency but doesn't tap into
// the Transak/MtPelerin/Topper provider stack at all. SwapKit gets its
// own provider abstraction (src/providers/swapkit/) when wired.

// V1 supported chains — matches the SwapKit /providers offering and
// our Reown adapters (EVM + Solana). mirrors src/wallet/config.js.
const CHAINS = [
  { id: 'ethereum', name: 'Ethereum', namespace: 'evm' },
  { id: 'base', name: 'Base', namespace: 'evm' },
  { id: 'arbitrum', name: 'Arbitrum', namespace: 'evm' },
  { id: 'optimism', name: 'Optimism', namespace: 'evm' },
  { id: 'polygon', name: 'Polygon', namespace: 'evm' },
  { id: 'bsc', name: 'BNB Chain', namespace: 'evm' },
  { id: 'avalanche', name: 'Avalanche', namespace: 'evm' },
  { id: 'solana', name: 'Solana', namespace: 'solana' },
]

// curated initial token list. SwapKit's /tokens endpoint returns 6000+
// — that goes into a virtualized async picker once the integration is
// live. for the scaffold we hand-pick a few popular ones per chain.
const TOKENS = [
  { sym: 'ETH',  chain: 'ethereum', name: 'Ethereum',  swapkit: 'ETH.ETH' },
  { sym: 'USDC', chain: 'ethereum', name: 'USD Coin',  swapkit: 'ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48' },
  { sym: 'USDT', chain: 'ethereum', name: 'Tether',    swapkit: 'ETH.USDT-0XDAC17F958D2EE523A2206206994597C13D831EC7' },
  { sym: 'ETH',  chain: 'base',     name: 'Ethereum',  swapkit: 'BASE.ETH' },
  { sym: 'USDC', chain: 'base',     name: 'USD Coin',  swapkit: 'BASE.USDC-0X833589FCD6EDB6E08F4C7C32D4F71B54BDA02913' },
  { sym: 'ETH',  chain: 'arbitrum', name: 'Ethereum',  swapkit: 'ARB.ETH' },
  { sym: 'SOL',  chain: 'solana',   name: 'Solana',    swapkit: 'SOL.SOL' },
  { sym: 'USDC', chain: 'solana',   name: 'USD Coin',  swapkit: 'SOL.USDC-EPJFWDD5AUFQSSQEM2QN1XZYBAPC8G4WEGGKZWYTDT1V' },
]

const DEFAULT_SOURCE = TOKENS[1] // USDC on Ethereum
const DEFAULT_DEST = TOKENS[6]   // SOL on Solana

export default function SwapKitPage() {
  const { t } = useTranslation()
  const [source, setSource] = useState(DEFAULT_SOURCE)
  const [dest, setDest] = useState(DEFAULT_DEST)
  const [amount, setAmount] = useState('')
  const [slippage, setSlippage] = useState(1) // percent — user-configurable per the client's request
  const [showAdvanced, setShowAdvanced] = useState(false)

  const swapDirections = () => {
    setSource(dest)
    setDest(source)
  }

  return (
    <div className="min-h-screen transition-colors duration-300 relative">
      <Sidebar />
      <main className="min-h-screen flex items-center justify-center px-4 py-8 pb-28 sm:py-12 md:pb-12 md:pl-64 relative z-10">
        <div className="w-full max-w-lg">
          <BlurIn>
            <div className="bg-surface-container-lowest dark:bg-surface-container border border-outline-variant/10 dark:border-white/5 rounded-2xl p-5 sm:p-7 shadow-md shadow-black/5 dark:shadow-black/30">
              <div className="flex items-center justify-between mb-5">
                <h1 className="text-xl sm:text-2xl font-bold text-on-surface font-[family-name:var(--font-family-display)]">
                  {t('swapkit.title', { defaultValue: 'Swap' })}
                </h1>
                <span className="text-[10px] uppercase tracking-wider font-bold text-tertiary">
                  {t('swapkit.preview', { defaultValue: 'preview' })}
                </span>
              </div>

              <Stagger stagger={0.06} className="space-y-3">
                {/* Source */}
                <StaggerItem>
                  <AssetBox
                    label={t('swapkit.youPay', { defaultValue: 'You pay' })}
                    token={source}
                    onTokenChange={setSource}
                    amount={amount}
                    onAmountChange={setAmount}
                    editable
                  />
                </StaggerItem>

                {/* Direction toggle */}
                <StaggerItem className="flex justify-center -my-1.5 relative z-10">
                  <motion.button
                    type="button"
                    onClick={swapDirections}
                    aria-label={t('swapkit.flipDirection', { defaultValue: 'Flip direction' })}
                    title={t('swapkit.flipDirection', { defaultValue: 'Flip direction' })}
                    className="w-11 h-11 bg-surface-container-lowest dark:bg-surface-container rounded-full flex items-center justify-center border-2 border-outline-variant/15 dark:border-white/10 cursor-pointer hover:border-primary/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 shadow-sm"
                    whileTap={{ rotate: 180, scale: 0.9 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                  >
                    <ArrowsDownUp size={20} weight="bold" className="text-primary" aria-hidden="true" />
                  </motion.button>
                </StaggerItem>

                {/* Destination */}
                <StaggerItem>
                  <AssetBox
                    label={t('swapkit.youReceive', { defaultValue: 'You receive' })}
                    token={dest}
                    onTokenChange={setDest}
                    amount={'—'}
                    estimated
                  />
                </StaggerItem>

                {/* Slippage */}
                <StaggerItem>
                  <button
                    type="button"
                    onClick={() => setShowAdvanced((v) => !v)}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs text-secondary hover:text-on-surface transition-colors"
                  >
                    <span className="font-bold uppercase tracking-wider">
                      {t('swapkit.slippage', { defaultValue: 'Slippage' })}
                    </span>
                    <span className="font-mono font-bold text-primary">{slippage}%</span>
                  </button>
                  {showAdvanced && (
                    <SlippageControl value={slippage} onChange={setSlippage} />
                  )}
                </StaggerItem>

                {/* CTA — wallet connect first, then quote (live integration in next step) */}
                <StaggerItem>
                  <SwapCTA amount={amount} />
                </StaggerItem>
              </Stagger>

              {/* Footer note */}
              <div className="mt-5 pt-4 border-t border-outline-variant/10 dark:border-white/5 flex items-start gap-2 text-[11px] text-secondary leading-relaxed">
                <Info size={12} weight="bold" className="shrink-0 mt-0.5" aria-hidden="true" />
                <p>
                  {t('swapkit.footnote', { defaultValue: 'Cross-chain swaps powered by SwapKit. Liquidity sourced from THORChain, Chainflip, NEAR Intents and others. Non-custodial — you sign every transaction with your own wallet.' })}
                </p>
              </div>
            </div>
          </BlurIn>
        </div>
      </main>
      <BottomNav />
    </div>
  )
}

function AssetBox({ label, token, onTokenChange, amount, onAmountChange, editable, estimated }) {
  return (
    <div className="bg-surface-container/60 dark:bg-black/20 p-4 sm:p-5 rounded-xl border border-outline-variant/5 dark:border-white/5">
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="text-[11px] font-bold tracking-widest text-secondary uppercase">
          {label}
        </label>
        {estimated && (
          <span className="text-[10px] uppercase tracking-wider text-secondary">
            estimated
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-3">
        {editable ? (
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9.]/g, '')
              if (v.split('.').length <= 2) onAmountChange?.(v)
            }}
            placeholder="0.00"
            className="bg-transparent border-none p-0 text-2xl sm:text-3xl font-bold text-on-surface font-[family-name:var(--font-family-display)] focus:ring-0 focus:outline-none w-full min-w-0 placeholder:text-secondary/30"
          />
        ) : (
          <span className="text-2xl sm:text-3xl font-bold text-on-surface/40 font-[family-name:var(--font-family-display)]">
            {amount}
          </span>
        )}
        <TokenPicker token={token} onChange={onTokenChange} />
      </div>
    </div>
  )
}

function TokenPicker({ token, onChange }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 sm:gap-2 bg-surface-container-lowest dark:bg-surface-container px-3 sm:px-4 py-2 rounded-lg dark:border dark:border-outline-variant/10 hover:bg-surface-container-low/60 transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="text-sm font-bold">{token.sym}</span>
        <span className="text-[10px] uppercase tracking-wider font-mono text-secondary">
          {token.chain.slice(0, 4)}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-surface-container-lowest dark:bg-surface-container rounded-xl shadow-lg shadow-black/10 dark:shadow-black/40 border border-outline-variant/20 dark:border-white/10 py-1 z-50 min-w-[200px] max-h-64 overflow-y-auto">
          {TOKENS.map((tk) => (
            <button
              key={`${tk.sym}-${tk.chain}`}
              type="button"
              onClick={() => { onChange(tk); setOpen(false) }}
              className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-surface-container-low dark:hover:bg-surface-container-high/30 transition-colors ${tk === token ? 'bg-primary/5' : ''}`}
            >
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold ${tk === token ? 'text-primary' : 'text-on-surface'}`}>{tk.sym}</span>
                <span className="text-xs text-secondary">{tk.name}</span>
              </div>
              <span className="text-[10px] uppercase tracking-wider font-mono text-secondary">
                {tk.chain}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SlippageControl({ value, onChange }) {
  const presets = [0.5, 1, 3, 5]
  return (
    <div className="bg-surface-container/40 dark:bg-black/20 rounded-lg p-2.5 mt-1 space-y-2">
      <div className="flex items-center gap-1.5">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-colors ${
              value === p
                ? 'bg-primary text-on-primary shadow-sm'
                : 'bg-surface-container-lowest dark:bg-surface-container-high/40 text-secondary hover:text-on-surface'
            }`}
          >
            {p}%
          </button>
        ))}
        <input
          type="number"
          min="0.1"
          max="50"
          step="0.1"
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="w-16 px-2 py-1.5 text-xs font-bold text-center bg-surface-container-lowest dark:bg-surface-container-high/40 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          aria-label="custom slippage"
        />
      </div>
      <p className="text-[10px] text-secondary leading-relaxed px-1">
        Higher tolerance = swap more likely to succeed but worse rate. Default 1% is good for stable single-chain swaps; 3% for cross-chain.
      </p>
    </div>
  )
}

// CTA button. behavior:
//   - wallet connect not configured (env var) → disabled with tooltip
//   - wallet not connected → "Connect Wallet" (opens Reown modal)
//   - wallet connected, no amount → disabled "Enter amount"
//   - wallet connected, has amount → "Get Quote" (stub for now —
//     real quote/swap wiring lands in the next iteration)
function SwapCTA({ amount }) {
  const { isConnected, isConfigured, open } = useWallet()
  const numericAmount = parseFloat(amount) || 0

  if (!isConfigured) {
    return (
      <button
        type="button"
        disabled
        className="w-full py-4 rounded-xl font-bold text-base bg-surface-container-low text-secondary cursor-not-allowed opacity-60"
        title="Set VITE_REOWN_PROJECT_ID to enable wallet connect"
      >
        Wallet connect not configured
      </button>
    )
  }

  if (!isConnected) {
    return (
      <MagneticButton
        onClick={open}
        className="w-full py-4 rounded-xl font-bold text-base bg-primary text-on-primary hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
      >
        <Wallet size={18} weight="bold" aria-hidden="true" />
        Connect Wallet to Swap
      </MagneticButton>
    )
  }

  if (numericAmount <= 0) {
    return (
      <button
        type="button"
        disabled
        className="w-full py-4 rounded-xl font-bold text-base bg-surface-container-low text-secondary cursor-not-allowed opacity-60"
      >
        Enter an amount
      </button>
    )
  }

  return (
    <MagneticButton
      onClick={() => alert('Quote integration coming next — SwapKit backend wiring is the next iteration.')}
      className="w-full py-4 rounded-xl font-bold text-base bg-primary text-on-primary hover:bg-primary/90 transition-colors"
    >
      Get Quote
    </MagneticButton>
  )
}
