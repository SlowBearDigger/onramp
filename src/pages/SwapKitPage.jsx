import { useState, useMemo, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'motion/react'
import { ArrowsDownUp, Wallet, Info, MagnifyingGlass, CaretDown, X, Sparkle } from '@phosphor-icons/react'
import Sidebar from '../components/Sidebar'
import BottomNav from '../components/BottomNav'
import OnboardingTour from '../components/OnboardingTour'
import { BlurIn, Stagger, StaggerItem, MagneticButton } from '../components/Motion'
import { CryptoIcon } from '../config/cryptos'
import { CHAINS, getChain } from '../config/chains'
import { useWallet, shortAddress } from '../hooks/useWallet'
// side-effect: createAppKit fires when this page loads. SwapKitPage is
// itself route-level lazy (App.jsx), so this only kicks in on /swap.
import '../wallet/WalletProvider'

// curated initial token list. SwapKit's /tokens endpoint returns 6000+
// — replaces this with a virtualized async picker once the integration
// is live. for the scaffold we hand-pick a few popular tokens per chain.
const TOKENS = [
  { sym: 'ETH',  chainId: 'ethereum', name: 'Ethereum',  swapkit: 'ETH.ETH' },
  { sym: 'USDC', chainId: 'ethereum', name: 'USD Coin',  swapkit: 'ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48' },
  { sym: 'USDT', chainId: 'ethereum', name: 'Tether',    swapkit: 'ETH.USDT-0XDAC17F958D2EE523A2206206994597C13D831EC7' },
  { sym: 'ETH',  chainId: 'base',     name: 'Ethereum',  swapkit: 'BASE.ETH' },
  { sym: 'USDC', chainId: 'base',     name: 'USD Coin',  swapkit: 'BASE.USDC-0X833589FCD6EDB6E08F4C7C32D4F71B54BDA02913' },
  { sym: 'ETH',  chainId: 'arbitrum', name: 'Ethereum',  swapkit: 'ARB.ETH' },
  { sym: 'SOL',  chainId: 'solana',   name: 'Solana',    swapkit: 'SOL.SOL' },
  { sym: 'USDC', chainId: 'solana',   name: 'USD Coin',  swapkit: 'SOL.USDC-EPJFWDD5AUFQSSQEM2QN1XZYBAPC8G4WEGGKZWYTDT1V' },
]

// stable token key — symbol + chain identifies uniquely (USDC on ETH ≠ USDC on Solana).
const tokenKey = (t) => `${t.sym}-${t.chainId}`

const DEFAULT_SOURCE = TOKENS[1] // USDC on Ethereum
const DEFAULT_DEST = TOKENS[6]   // SOL on Solana

export default function SwapKitPage() {
  const { t } = useTranslation()
  const [source, setSource] = useState(DEFAULT_SOURCE)
  const [dest, setDest] = useState(DEFAULT_DEST)
  const [amount, setAmount] = useState('')
  const [slippage, setSlippage] = useState(1) // percent
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
              {/* header */}
              <div className="flex items-baseline justify-between mb-5">
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-on-surface font-[family-name:var(--font-family-display)] m-0">
                    {t('swapkit.title')}
                  </h1>
                  <p className="text-xs text-secondary mt-0.5">
                    {t('swapkit.subtitle')}
                  </p>
                </div>
                <span className="text-[10px] uppercase tracking-wider font-bold text-tertiary bg-tertiary/10 px-2 py-0.5 rounded">
                  {t('swapkit.preview')}
                </span>
              </div>

              <Stagger stagger={0.06} className="space-y-3">
                <StaggerItem>
                  <AssetBox
                    label={t('swapkit.youPay')}
                    token={source}
                    onTokenChange={setSource}
                    amount={amount}
                    onAmountChange={setAmount}
                    editable
                  />
                </StaggerItem>

                <StaggerItem className="flex justify-center -my-1.5 relative z-10">
                  <motion.button
                    type="button"
                    onClick={swapDirections}
                    aria-label={t('swapkit.flipDirection')}
                    title={t('swapkit.flipDirection')}
                    className="w-11 h-11 bg-surface-container-lowest dark:bg-surface-container rounded-full flex items-center justify-center border-2 border-outline-variant/15 dark:border-white/10 cursor-pointer hover:border-primary/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 shadow-sm"
                    whileTap={{ rotate: 180, scale: 0.9 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                  >
                    <ArrowsDownUp size={20} weight="bold" className="text-primary" aria-hidden="true" />
                  </motion.button>
                </StaggerItem>

                <StaggerItem>
                  <AssetBox
                    label={t('swapkit.youReceive')}
                    token={dest}
                    onTokenChange={setDest}
                    amount={'—'}
                    estimated
                  />
                </StaggerItem>

                <StaggerItem>
                  <SlippageRow
                    value={slippage}
                    onChange={setSlippage}
                    showAdvanced={showAdvanced}
                    onToggleAdvanced={() => setShowAdvanced((v) => !v)}
                  />
                </StaggerItem>

                <StaggerItem>
                  <SwapCTA amount={amount} />
                </StaggerItem>
              </Stagger>

              {/* footer */}
              <div className="mt-5 pt-4 border-t border-outline-variant/10 dark:border-white/5 flex items-start gap-2 text-[11px] text-secondary leading-relaxed">
                <Info size={12} weight="bold" className="shrink-0 mt-0.5" aria-hidden="true" />
                <p>{t('swapkit.footnote')}</p>
              </div>
            </div>
          </BlurIn>
        </div>
      </main>
      <BottomNav />
      {/* first-visit welcome tour. also mounted on SwapPage; localStorage
          flag prevents double-show across re-navigation. */}
      <OnboardingTour />
    </div>
  )
}

function AssetBox({ label, token, onTokenChange, amount, onAmountChange, editable, estimated }) {
  const { t } = useTranslation()
  return (
    <div className="bg-surface-container/60 dark:bg-black/20 p-4 sm:p-5 rounded-xl border border-outline-variant/5 dark:border-white/5">
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="text-[11px] font-bold tracking-widest text-secondary uppercase">
          {label}
        </label>
        {estimated && (
          <span className="text-[10px] uppercase tracking-wider text-secondary">
            {t('swapkit.estimated')}
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
            aria-label={label}
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

// token picker with crypto icon + chain badge + searchable list.
// the chain badge sits as a small circle bottom-right of the crypto
// icon (badge-on-avatar pattern) to communicate "this USDC is the one
// on Base, not Ethereum". popular pattern in wallet UIs.
function TokenPicker({ token, onChange }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const inputRef = useRef(null)
  const wrapRef = useRef(null)
  const chain = getChain(token.chainId)

  // focus search on open, clear on close.
  useEffect(() => {
    if (open) {
      const id = setTimeout(() => inputRef.current?.focus(), 80)
      return () => clearTimeout(id)
    }
    setSearch('')
  }, [open])

  // close on outside click + ESC.
  useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return TOKENS
    return TOKENS.filter((tk) =>
      tk.sym.toLowerCase().includes(q) ||
      tk.name.toLowerCase().includes(q) ||
      tk.chainId.toLowerCase().includes(q)
    )
  }, [search])

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 bg-surface-container-lowest dark:bg-surface-container px-2.5 sm:px-3 py-2 rounded-lg dark:border dark:border-outline-variant/10 hover:bg-surface-container-low/60 transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('swapkit.changeToken', { token: token.sym })}
      >
        <TokenAvatar token={token} chain={chain} size={24} />
        <span className="text-sm font-bold">{token.sym}</span>
        <CaretDown size={12} weight="bold" className="text-secondary" aria-hidden="true" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-1.5 bg-surface-container-lowest dark:bg-surface-container rounded-xl shadow-lg shadow-black/10 dark:shadow-black/40 border border-outline-variant/20 dark:border-white/10 z-50 w-[min(calc(100vw-3rem),22rem)] overflow-hidden"
          >
            {/* search */}
            <div className="p-2 border-b border-outline-variant/10 dark:border-white/5">
              <div className="relative">
                <MagnifyingGlass size={14} weight="bold" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-secondary" aria-hidden="true" />
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('swapkit.searchTokens')}
                  className="w-full pl-8 pr-2 py-1.5 text-xs bg-surface-container-low/60 dark:bg-surface-container-high/40 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                />
              </div>
            </div>

            {/* list */}
            <ul className="max-h-72 overflow-y-auto list-none m-0 p-1.5" role="listbox">
              {filtered.length === 0 && (
                <li className="px-3 py-4 text-xs text-secondary text-center">
                  {t('swapkit.noTokensFound')}
                </li>
              )}
              {filtered.map((tk) => {
                const active = tokenKey(tk) === tokenKey(token)
                const tkChain = getChain(tk.chainId)
                return (
                  <li key={tokenKey(tk)}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => { onChange(tk); setOpen(false) }}
                      className={`w-full text-left px-2 py-2 flex items-center gap-3 rounded-lg transition-colors ${active ? 'bg-primary/8' : 'hover:bg-surface-container-low dark:hover:bg-surface-container-high/30'}`}
                    >
                      <TokenAvatar token={tk} chain={tkChain} size={28} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className={`text-sm font-bold ${active ? 'text-primary' : 'text-on-surface'}`}>{tk.sym}</span>
                          <span className="text-xs text-secondary truncate">{tk.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: tkChain.color }}
                            aria-hidden="true"
                          />
                          <span className="text-[10px] uppercase tracking-wider font-mono text-secondary">
                            {tkChain.name}
                          </span>
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// crypto icon with a small chain badge in the bottom-right corner.
// makes "USDC on Ethereum" vs "USDC on Base" visually distinguishable
// at a glance.
function TokenAvatar({ token, chain, size = 24 }) {
  const badgeSize = Math.max(10, Math.floor(size * 0.45))
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <CryptoIcon symbol={token.sym} size={size} />
      <span
        aria-hidden="true"
        className="absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-surface-container-lowest dark:ring-surface-container"
        style={{
          width: badgeSize,
          height: badgeSize,
          backgroundColor: chain.color,
        }}
        title={chain.name}
      />
    </span>
  )
}

// slippage control. starts collapsed showing "Slippage 1%" with a small
// help icon. expanded shows presets + custom + explainer copy.
function SlippageRow({ value, onChange, showAdvanced, onToggleAdvanced }) {
  const { t } = useTranslation()
  const presets = [0.5, 1, 3, 5]
  return (
    <div>
      <button
        type="button"
        onClick={onToggleAdvanced}
        aria-expanded={showAdvanced}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-surface-container-low/40 dark:hover:bg-surface-container-high/20 transition-colors text-xs"
      >
        <span className="inline-flex items-center gap-1.5 font-bold uppercase tracking-wider text-secondary">
          {t('swapkit.slippage')}
          <Info size={11} weight="bold" className="text-secondary/70" aria-hidden="true" />
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="font-mono font-bold text-primary">{value}%</span>
          <CaretDown
            size={11}
            weight="bold"
            className={`text-secondary transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </span>
      </button>
      <AnimatePresence>
        {showAdvanced && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="bg-surface-container/40 dark:bg-black/20 rounded-lg p-2.5 mt-1.5 space-y-2">
              <div className="flex items-center gap-1.5">
                {presets.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onChange(p)}
                    aria-pressed={value === p}
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
                  aria-label={t('swapkit.customSlippage')}
                />
              </div>
              <p className="text-[10px] text-secondary leading-relaxed px-1">
                {t('swapkit.slippageHelp')}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// CTA button. behavior:
//   not configured (env var) → disabled with tooltip
//   not connected             → "Connect Wallet" (opens Reown modal)
//   connected, no amount      → disabled "Enter amount"
//   connected, has amount     → "Get Quote" (stub until backend ships)
function SwapCTA({ amount }) {
  const { t } = useTranslation()
  const { isConnected, isConfigured, address, open } = useWallet()
  const numericAmount = parseFloat(amount) || 0

  if (!isConfigured) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          disabled
          className="w-full py-4 rounded-xl font-bold text-base bg-surface-container-low text-secondary cursor-not-allowed opacity-60"
          title="Set VITE_REOWN_PROJECT_ID to enable wallet connect"
        >
          {t('swapkit.cta.notConfigured')}
        </button>
        <p className="text-[11px] text-secondary leading-relaxed text-center px-2">
          {t('swapkit.cta.notConfiguredHelp')}
        </p>
      </div>
    )
  }

  if (!isConnected) {
    return (
      <div className="space-y-2">
        <MagneticButton
          onClick={open}
          className="w-full py-4 rounded-xl font-bold text-base bg-primary text-on-primary hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
        >
          <Wallet size={18} weight="bold" aria-hidden="true" />
          {t('swapkit.cta.connect')}
        </MagneticButton>
        <p className="text-[11px] text-secondary leading-relaxed text-center px-2 inline-flex items-center gap-1 justify-center w-full">
          <Sparkle size={11} weight="fill" className="text-tertiary" aria-hidden="true" />
          {t('swapkit.cta.connectHelp')}
        </p>
      </div>
    )
  }

  if (numericAmount <= 0) {
    return (
      <button
        type="button"
        disabled
        className="w-full py-4 rounded-xl font-bold text-base bg-surface-container-low text-secondary cursor-not-allowed opacity-60"
      >
        {t('swapkit.cta.enterAmount')}
      </button>
    )
  }

  return (
    <div className="space-y-2">
      <MagneticButton
        onClick={() => alert('Quote integration coming next — SwapKit backend wiring is the next iteration.')}
        className="w-full py-4 rounded-xl font-bold text-base bg-primary text-on-primary hover:bg-primary/90 transition-colors"
      >
        {t('swapkit.cta.getQuote')}
      </MagneticButton>
      <p className="text-[10px] text-secondary text-center font-mono">
        {t('swapkit.cta.signingAs', { address: shortAddress(address) })}
      </p>
    </div>
  )
}
