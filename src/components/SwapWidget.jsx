import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'motion/react'
import { CaretDown, ArrowsDownUp, SealCheck, Wallet as WalletIcon, Bank, Check } from '@phosphor-icons/react'
import { BlurIn, MagneticButton, Stagger, StaggerItem, Sparkline } from './Motion'
import { CRYPTOS, CryptoIcon } from '../config/cryptos'
import { MOCK_PROVIDERS } from '../data/mockData'
import { FIAT_OPTIONS, PAYMENT_METHODS } from '../config/cryptos'
import { useLiveTicker } from '../hooks/useLiveTicker'
import { useProvider } from '../hooks/useProvider'
import { listProviderMetadata } from '../providers/index.js'
import TransactionFlow from './TransactionFlow'
import ProviderModal from './ProviderModal'
import ProviderComparison, { assignBadges } from './ProviderComparison'
import { BrandMark } from './BrandLogo'
import { getOnColor } from '../utils/contrast'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

const buyAmounts = [50, 100, 250, 500, 1000]

function getSellChips(rate) {
  if (rate >= 10000) return [0.005, 0.01, 0.025, 0.05, 0.1]
  if (rate >= 100) return [0.1, 0.25, 0.5, 1, 5]
  if (rate >= 1) return [1, 5, 10, 25, 50]
  return [100, 250, 500, 1000, 5000]
}

// per-provider quote fetch with a 3s timeout. returns the normalized card
// payload `{ cryptoAmount, fee, rateText }` on success, or null on any failure.
// failures are silent — the comparison UI degrades to "quote unavailable".
async function fetchQuote(providerId, { fiat, crypto, network, side, amount }) {
  if (USE_MOCK) {
    return mockQuote(providerId, { fiat, crypto, network, side, amount })
  }

  const path = providerId === 'transak'
    ? `/api/quotes`
    : `/api/quotes/${providerId}`
  const qs = new URLSearchParams({
    fiatCurrency: fiat,
    cryptoCurrency: crypto,
    network,
    isBuyOrSell: side,
    fiatAmount: String(amount),
  })

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 4000)
  try {
    const r = await fetch(`${API_BASE}${path}?${qs.toString()}`, { signal: ac.signal })
    if (!r.ok) return null
    const body = await r.json()
    if (providerId === 'transak') return parseTransakQuote(body)
    // mtpelerin and topper backend endpoints return canonical shape
    // { provider, quote: { cryptoAmount, fee, feeAsset, rate, raw } }
    return parseCanonicalQuote(body?.quote)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function parseTransakQuote(body) {
  // transak's pricing endpoint returns { response: { fiatAmount, cryptoAmount,
  // totalFee, conversionPrice, ... } } — be defensive across api versions.
  const r = body?.response || body || {}
  const cryptoAmount = Number(r.cryptoAmount ?? r.cryptoAmountInWei) || null
  const fee = Number(r.totalFee ?? r.feeBreakdown?.[0]?.value) || 0
  const price = Number(r.conversionPrice) || null
  if (!cryptoAmount) return null
  return {
    cryptoAmount: formatCryptoAmount(cryptoAmount),
    fee,
    rateText: price ? `1 unit ≈ ${price.toFixed(2)}` : '',
  }
}

function parseCanonicalQuote(q) {
  if (!q || typeof q !== 'object') return null
  const cryptoAmount = Number(q.cryptoAmount)
  if (!Number.isFinite(cryptoAmount) || cryptoAmount <= 0) return null
  const fee = Number(q.fee) || 0
  const rate = Number(q.rate)
  return {
    cryptoAmount: formatCryptoAmount(cryptoAmount),
    fee,
    rateText: Number.isFinite(rate) ? `1 unit ≈ ${rate.toFixed(2)}` : '',
  }
}

function mockQuote(providerId, { side, amount, crypto: _crypto }) {
  // deterministic-ish mock numbers so cards differ visibly in the demo.
  // never used in prod (USE_MOCK gates this).
  const base = side === 'SELL' ? Number(amount) : Number(amount) / 50000
  const variance = providerId === 'transak' ? 0.992 : providerId === 'topper' ? 1.002 : 0.998
  const fee = providerId === 'transak' ? 1.5 : providerId === 'topper' ? 1.0 : 0.0
  return Promise.resolve({
    cryptoAmount: formatCryptoAmount(base * variance),
    fee,
    rateText: '1 unit ≈ 50,000.00',
  })
}

function formatCryptoAmount(n) {
  if (!Number.isFinite(n)) return '0'
  if (n >= 1) return n.toFixed(4)
  if (n >= 0.0001) return n.toFixed(6)
  return n.toFixed(8)
}

// deep-link URL params support. on mount, read ?asset=BTC&fiat=USD&amount=100
// and pre-fill the form. enables sharing URLs like
// app.<domain>/buy?asset=ETH&fiat=EUR&amount=50 from QR codes, blog posts,
// email campaigns. resolution is loose — invalid values fall through to
// defaults silently rather than blocking the user.
function resolveInitialAsset(searchParams) {
  const wanted = (searchParams.get('asset') || '').toUpperCase().trim()
  if (!wanted) return CRYPTOS[0]
  const match = CRYPTOS.find((c) => c.symbol === wanted)
  return match || CRYPTOS[0]
}
function resolveInitialFiat(searchParams) {
  const wanted = (searchParams.get('fiat') || '').toUpperCase().trim()
  if (!wanted) return FIAT_OPTIONS[0]
  const match = FIAT_OPTIONS.find((f) => f.code === wanted)
  return match || FIAT_OPTIONS[0]
}
function resolveInitialAmount(searchParams) {
  const raw = searchParams.get('amount')
  const n = Number(raw)
  // clamp to a sensible range — protects against malicious URLs with
  // absurd amounts that would crash the form or hit transak limits.
  if (Number.isFinite(n) && n > 0 && n <= 100_000) return Math.round(n)
  return 500
}

export default function SwapWidget({ onCryptoChange, mode = 'buy', onViewHistory, onWarpChange }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialAmount = resolveInitialAmount(searchParams)
  const initialCrypto = resolveInitialAsset(searchParams)
  const initialFiat = resolveInitialFiat(searchParams)
  const [selectedAmount, setSelectedAmount] = useState(initialAmount)
  const [buyInput, setBuyInput] = useState(String(initialAmount))
  const [sellAmount, setSellAmount] = useState('')
  const [crypto, setCrypto] = useState(initialCrypto)
  const [showCryptoMenu, setShowCryptoMenu] = useState(false)
  const [fiat, setFiat] = useState(initialFiat)
  const [showFiatMenu, setShowFiatMenu] = useState(false)
  const [payMethod, setPayMethod] = useState(PAYMENT_METHODS[0])
  const [showPayMenu, setShowPayMenu] = useState(false)
  const [wallet, setWallet] = useState('')
  // touched flag — defer error message until the user has actually interacted
  // with the wallet input (blur or submit attempt). without this, role="alert"
  // announces "please provide a valid address" the moment the page mounts,
  // which is hostile to screen-reader users and violates the standard
  // "validate on blur, not on render" rule.
  const [walletTouched, setWalletTouched] = useState(false)
  // form → compare (show 3 provider cards with quotes) → flow (live: provider
  // widget overlay; mock: TransactionFlow simulation).
  const [stage, setStage] = useState('form')
  const [pickedProvider, setPickedProvider] = useState(null)
  const [quoteCards, setQuoteCards] = useState([])

  const ticker = useLiveTicker(crypto)

  // generic provider integration. lives alongside the mock TransactionFlow —
  // which path runs depends on VITE_USE_MOCK and whether transak (the only
  // currently-real provider) has an api key. handleMessage validates
  // postMessage origins internally so it's safe to mount.
  //
  // post-success UX: when the provider widget reports a successful order,
  // we mark a ref. when the user then closes the widget (via "Back to app"
  // or the X), we auto-navigate to /swap/history so they land where the
  // new order will appear. without this, users land back on the empty
  // swap form and have to manually tap History to see their purchase.
  const successPendingRef = useRef(false)
  const provider = useProvider({
    onSuccess: () => {
      successPendingRef.current = true
    },
    onClose: () => {
      if (successPendingRef.current) {
        successPendingRef.current = false
        // delay a tick so the close transition can play. onViewHistory is
        // wired by SwapPage to navigate('/history').
        setTimeout(() => onViewHistory?.(), 200)
      }
    },
  })

  const isSell = mode === 'sell'
  const sellChips = getSellChips(crypto.rate)

  const sellNumeric = parseFloat(sellAmount) || 0
  const receiveAmount = isSell
    ? (sellNumeric * ticker.price).toFixed(2)
    : (selectedAmount / ticker.price).toFixed(ticker.price >= 100 ? 5 : 2)

  const handleCryptoSelect = (c) => {
    setCrypto(c)
    setShowCryptoMenu(false)
    setSellAmount('')
    onCryptoChange?.(c)
  }

  const handleBuyInput = (e) => {
    const v = e.target.value.replace(/[^0-9.]/g, '')
    if (v.split('.').length <= 2) {
      setBuyInput(v)
      const num = parseFloat(v) || 0
      setSelectedAmount(num)
    }
  }

  const handleChipSelect = (amount) => {
    setSelectedAmount(amount)
    setBuyInput(String(amount))
  }

  const canSubmit = wallet.length > 5 && (isSell ? sellNumeric > 0 : selectedAmount > 0)

  // liveMode = "talk to real providers" vs "play the mock TransactionFlow
  // animation". with the signed-URL pattern, the frontend can't tell which
  // providers are configured up-front (creds live on the backend), so we
  // gate purely on USE_MOCK. provider-level readiness surfaces at fetch
  // time — getBootstrap() throws with a clean error if the backend returns
  // 503, and the modal handles it gracefully.
  const liveMode = !USE_MOCK

  const handleSubmit = () => {
    if (!canSubmit) {
      // mark wallet as touched so the error message becomes visible if the
      // user clicked Continue without filling it.
      if (!wallet) setWalletTouched(true)
      return
    }
    setStage('compare')
  }

  const handlePickProvider = (providerId) => {
    setPickedProvider(providerId)

    if (liveMode) {
      // open the picked provider's widget. don't switch stage — the modal is
      // an overlay; the compare stays mounted underneath.
      //
      // amount semantics differ by mode:
      //   buy  → user picked a fiat amount → fiatAmount=selectedAmount, no crypto
      //   sell → user picked a crypto amount → cryptoAmount=sellNumeric, plus
      //          fiatAmount=receiveAmount as a hint for providers (mtpelerin
      //          uses fiat-source side even on sell tab).
      provider.startOrder({
        providerId,
        crypto,
        fiatAmount: isSell ? Number(receiveAmount) : selectedAmount,
        cryptoAmount: isSell ? sellNumeric : undefined,
        walletAddress: wallet,
        fiatCurrency: fiat.code,
        mode: isSell ? 'sell' : 'buy',
      })
      return
    }

    // fallback: mocked flow (offline demo / no API key configured).
    setStage('flow')
  }

  const handleBackToForm = () => {
    setStage('form')
    setQuoteCards([])
  }

  const handleReset = () => {
    setStage('form')
    setWallet('')
    setSellAmount('')
    setPickedProvider(null)
    setQuoteCards([])
    provider.close()
  }

  // sync the deep-linked initial crypto to the parent (SwapPage uses
   // it for the reactive blob color). without this, a user landing on
   // /buy?asset=ETH sees BTC-colored blobs because the parent's state
   // was set to CRYPTOS[0] at SwapPage mount, before SwapWidget had a
   // chance to derive crypto from the URL. fires once on mount only;
   // user-driven changes flow through handleCryptoSelect already.
  useEffect(() => {
    onCryptoChange?.(initialCrypto)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // fetch quotes from all providers in parallel when entering 'compare'.
  // transak: real backend proxy. mtpelerin/topper: 501 placeholder until their
  // pricing APIs are confirmed (see backend/app.js stub endpoints).
  useEffect(() => {
    if (stage !== 'compare') return
    let cancelled = false

    const meta = listProviderMetadata()
    // initial state: all loading.
    setQuoteCards(meta.map((m) => ({
      id: m.id,
      name: m.displayName,
      state: 'loading',
      unverified: m.hasWebhook ? false : true,
    })))

    const requestedFiat = fiat.code
    const requestedAmount = isSell ? Number(receiveAmount) : selectedAmount
    const cryptoSymbol = crypto.transakCode || crypto.symbol
    const cryptoNetwork = crypto.network || 'ethereum'
    const side = isSell ? 'SELL' : 'BUY'

    Promise.allSettled([
      fetchQuote('transak', { fiat: requestedFiat, crypto: cryptoSymbol, network: cryptoNetwork, side, amount: requestedAmount }),
      fetchQuote('mtpelerin', { fiat: requestedFiat, crypto: cryptoSymbol, network: cryptoNetwork, side, amount: requestedAmount }),
      fetchQuote('topper', { fiat: requestedFiat, crypto: cryptoSymbol, network: cryptoNetwork, side, amount: requestedAmount }),
    ]).then((results) => {
      if (cancelled) return
      const next = meta.map((m, i) => {
        const r = results[i]
        if (r.status === 'fulfilled' && r.value) {
          return {
            id: m.id,
            name: m.displayName,
            state: 'ok',
            unverified: m.hasWebhook ? false : true,
            ...r.value,
          }
        }
        return {
          id: m.id,
          name: m.displayName,
          state: 'unavailable',
          unverified: m.hasWebhook ? false : true,
        }
      })
      setQuoteCards(assignBadges(next))
    })

    return () => { cancelled = true }
  }, [stage, fiat.code, isSell, receiveAmount, selectedAmount, crypto.transakCode, crypto.symbol, crypto.network])

  const flowAmountUsd = isSell ? receiveAmount : selectedAmount
  const flowAmountCrypto = isSell ? sellAmount : receiveAmount

  return (
    <BlurIn delay={0.15}>
      {/* overflow-visible so the crypto/fiat/payment-method dropdowns can
          extend past the card bottom — rounded corners are preserved by
          rounded-xl alone, no clipping needed. */}
      <motion.div
        className="bg-surface-container-lowest rounded-xl shadow-md shadow-black/5 dark:shadow-black/30 border border-outline-variant/10 dark:border-white/5 duration-300"
      >
        {/* Header */}
        <div className="px-4 sm:px-8 pt-5 sm:pt-8 pb-3 sm:pb-6 flex items-center justify-between gap-3">
          <BrandMark size={36} variant="subtle" />

          {/* tab group — `<a>` styled as a button. wrapping a real <button>
              inside a <Link>/<a> is invalid HTML5 (interactive-in-interactive)
              and produces a double tab stop. styling the Link directly fixes
              both. */}
          <div role="tablist" aria-label={t('swap.tabs.buy') + ' / ' + t('swap.tabs.sell')} className="bg-surface-container-low dark:bg-surface-container-high/50 p-1 rounded-lg flex dark:border dark:border-outline-variant/10">
            <Link
              to="/buy"
              role="tab"
              aria-selected={!isSell}
              className={`px-4 sm:px-6 py-1.5 rounded-lg font-semibold text-xs sm:text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${!isSell ? 'bg-surface-container-lowest text-primary shadow-sm' : 'text-secondary hover:text-on-surface'}`}
            >
              {t('swap.tabs.buy')}
            </Link>
            <Link
              to="/sell"
              role="tab"
              aria-selected={isSell}
              className={`px-4 sm:px-6 py-1.5 rounded-lg font-semibold text-xs sm:text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${isSell ? 'bg-surface-container-lowest text-primary shadow-sm' : 'text-secondary hover:text-on-surface'}`}
            >
              {t('swap.tabs.sell')}
            </Link>
          </div>

          <div className="relative shrink-0">
            <button onClick={() => { setShowFiatMenu((v) => !v); setShowCryptoMenu(false); setShowPayMenu(false) }} className="flex items-center gap-1.5 sm:gap-2 py-1.5 px-2 sm:px-3 rounded-lg hover:bg-surface-container-low dark:hover:bg-surface-container-high/50 transition-colors">
              <span className="text-xs font-bold text-secondary font-mono">{fiat.symbol}</span>
              <span className="text-xs font-bold text-on-surface">{fiat.code}</span>
              <CaretDown size={14} weight="bold" className="text-secondary" />
            </button>
            <AnimatePresence>
              {showFiatMenu && (
                <motion.div initial={{ opacity: 0, y: -8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.95 }} transition={{ duration: 0.2 }} className="absolute right-0 top-10 bg-surface-container-lowest dark:bg-surface-container rounded-xl shadow-lg shadow-black/10 dark:shadow-black/40 border border-outline-variant/20 dark:border-white/10 py-2 z-50 min-w-[140px]">
                  {FIAT_OPTIONS.map((f) => (
                    <motion.button key={f.code} onClick={() => { setFiat(f); setShowFiatMenu(false) }} className={`w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-on-surface/[0.04] dark:hover:bg-on-surface/[0.06] transition-colors ${fiat.code === f.code ? 'bg-primary/5' : ''}`}>
                      <span className={`text-xs font-bold font-mono w-5 ${fiat.code === f.code ? 'text-primary' : 'text-secondary'}`}>{f.symbol}</span>
                      <span className={`text-sm font-bold ${fiat.code === f.code ? 'text-primary' : 'text-on-surface'}`}>{f.code}</span>
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* live ticker — when ticker.live is false (api unreachable / rate-limited /
            unknown asset), we show the cached price quietly without the
            up/down chip, so users aren't misled by a stale "+0.00%" indicator. */}
        {stage === 'form' && (
          <div className="px-4 sm:px-8 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CryptoIcon symbol={crypto.symbol} size={16} />
              <motion.span
                key={`${crypto.symbol}-${Math.round(ticker.price)}`}
                initial={{ opacity: 0.5, y: ticker.direction === 'up' ? 4 : -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xs font-bold text-on-surface font-mono"
              >
                ${ticker.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </motion.span>
              {ticker.live && (
                <span className={`text-xs font-bold font-mono ${ticker.direction === 'up' ? 'text-success' : 'text-danger'}`}>
                  {ticker.direction === 'up' ? '▲' : '▼'} {Math.abs(ticker.change).toFixed(2)}%
                </span>
              )}
            </div>
            <Sparkline data={ticker.history} color={crypto.color} width={50} height={16} live={ticker.live} />
          </div>
        )}

        <div className="px-4 sm:px-8 pb-5 sm:pb-8">
          <AnimatePresence mode="wait">
            {stage === 'form' ? (
              // outer key="form" handles transitions between stages.
              // inner key={`form-${mode}`} handles the buy↔sell flip — same
              // stage but different mode. nested AnimatePresence so the
              // mode-flip uses a subtle fade instead of the dramatic
              // horizontal slide reserved for stage changes.
              <motion.div key="form" initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.25 }}>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`form-${mode}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.16 }}
                  >
                <Stagger stagger={0.06} className="space-y-3 sm:space-y-5">
                  {/* Top input: You Pay (buy) / You Send (sell) */}
                  <StaggerItem className="space-y-2 sm:space-y-3">
                    <motion.div className="bg-surface-container/60 dark:bg-black/20 p-4 sm:p-6 rounded-xl border border-outline-variant/5 dark:border-white/5">
                      <div className="mb-1">
                        <label htmlFor="swap-pay-amount" className="text-xs font-bold tracking-widest text-secondary uppercase">
                          {isSell ? t('swap.labels.youSend') : t('swap.labels.youPay')}
                        </label>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        {isSell ? (
                          <input
                            id="swap-pay-amount"
                            className="bg-transparent border-none p-0 text-3xl sm:text-4xl font-bold text-on-surface font-[family-name:var(--font-family-display)] focus:ring-0 focus:outline-none w-full min-w-0 placeholder:text-secondary/30"
                            placeholder={t('swap.placeholders.amount')}
                            type="text"
                            inputMode="decimal"
                            value={sellAmount}
                            onChange={(e) => {
                              const v = e.target.value.replace(/[^0-9.]/g, '')
                              if (v.split('.').length <= 2) setSellAmount(v)
                            }}
                          />
                        ) : (
                          <div className="flex items-center w-full min-w-0">
                            <span className="text-3xl sm:text-4xl font-bold text-on-surface font-[family-name:var(--font-family-display)]">$</span>
                            <input
                              id="swap-pay-amount"
                              className="bg-transparent border-none p-0 text-3xl sm:text-4xl font-bold text-on-surface font-[family-name:var(--font-family-display)] focus:ring-0 focus:outline-none w-full min-w-0 placeholder:text-secondary/30"
                              placeholder={t('swap.placeholders.amount')}
                              type="text"
                              inputMode="decimal"
                              value={buyInput}
                              onChange={handleBuyInput}
                            />
                          </div>
                        )}

                        {isSell ? (
                          // wrapper has relative for the absolutely-positioned popup
                          // dropdown to anchor below the trigger.
                          <div className="relative shrink-0">
                            <motion.button onClick={() => setShowCryptoMenu((v) => !v)} className="flex items-center gap-1.5 sm:gap-2 bg-surface-container-lowest dark:bg-surface-container px-3 sm:px-4 py-2 rounded-lg dark:border dark:border-outline-variant/10" whileTap={{ scale: 0.97 }} aria-haspopup="listbox" aria-expanded={showCryptoMenu}>
                              <CryptoIcon symbol={crypto.symbol} size={20} />
                              <span className="text-sm font-bold">{crypto.symbol}</span>
                              <CaretDown size={16} weight="bold" className="text-secondary" />
                            </motion.button>
                            <CryptoDropdown
                              open={showCryptoMenu}
                              cryptos={CRYPTOS}
                              activeSymbol={crypto.symbol}
                              onSelect={handleCryptoSelect}
                            />
                          </div>
                        ) : (
                          <motion.button onClick={() => { setShowFiatMenu((v) => !v); setShowCryptoMenu(false) }} className="flex items-center gap-1.5 sm:gap-2 bg-surface-container-lowest dark:bg-surface-container px-3 sm:px-4 py-2 rounded-lg dark:border dark:border-outline-variant/10 shrink-0" whileTap={{ scale: 0.97 }}>
                            <span className="text-xs font-bold text-secondary font-mono">{fiat.symbol}</span>
                            <span className="text-sm font-bold">{fiat.code}</span>
                            <CaretDown size={16} weight="bold" className="text-secondary" />
                          </motion.button>
                        )}
                      </div>
                    </motion.div>

                    {/* Amount chips */}
                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
                      {(isSell ? sellChips : buyAmounts).map((amount) => {
                        const isActive = isSell
                          ? sellAmount === String(amount)
                          : selectedAmount === amount
                        return (
                          <motion.button
                            key={amount}
                            onClick={() => isSell ? setSellAmount(String(amount)) : handleChipSelect(amount)}
                                                       whileTap={{ scale: 0.92 }}
                            className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs font-semibold transition-colors ${
                              isActive
                                ? 'bg-primary text-on-primary dark:text-on-primary shadow-md'
                                : 'bg-surface-container-low dark:bg-surface-container-high/30 text-secondary hover:bg-primary-container hover:text-on-primary dark:hover:bg-surface-container-high/50 dark:hover:text-on-surface'
                            }`}
                          >
                            {isSell ? `${amount} ${crypto.symbol}` : `$${amount}`}
                          </motion.button>
                        )
                      })}
                    </div>
                  </StaggerItem>

                  {/* swap-direction button — toggles buy↔sell route. sits
                      between the two amount boxes with even breathing room
                      on top and bottom (handled by the parent Stagger's
                      space-y). */}
                  <StaggerItem className="flex justify-center">
                    <motion.button
                      type="button"
                      onClick={() => navigate(isSell ? '/buy' : '/sell')}
                      aria-label={isSell ? t('swap.swapToBuy') : t('swap.swapToSell')}
                      title={isSell ? t('swap.swapToBuy') : t('swap.swapToSell')}
                      className="w-11 h-11 bg-surface-container-lowest dark:bg-surface-container rounded-full flex items-center justify-center border-2 border-outline-variant/15 dark:border-white/10 cursor-pointer relative z-10 hover:border-primary/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 shadow-sm shadow-black/5 dark:shadow-black/20"
                      whileTap={{ rotate: 180, scale: 0.9 }}
                      transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                    >
                      <ArrowsDownUp size={20} weight="bold" className="text-primary" aria-hidden="true" />
                    </motion.button>
                  </StaggerItem>

                  {/* Bottom output: You Receive (buy) / You Get (sell) */}
                  <StaggerItem>
                    <motion.div className="bg-surface-container/60 dark:bg-black/20 p-4 sm:p-6 rounded-xl border border-outline-variant/5 dark:border-white/5">
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-bold tracking-widest text-secondary uppercase">
                          {isSell ? t('swap.labels.youGet') : t('swap.labels.youReceive')}
                        </label>
                        {/* neutral "estimated" hint — at this stage no quote
                            comparison has happened yet, so claiming "Best Rate"
                            here would be misleading. real best-rate badging
                            shows up on the compare cards once quotes arrive. */}
                        <span className="text-xs text-secondary">{t('swap.labels.estimated')}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex flex-col min-w-0">
                          <motion.span key={`${mode}-${receiveAmount}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-3xl sm:text-4xl font-bold text-on-surface font-mono truncate">
                            {isSell ? `$${sellNumeric > 0 ? receiveAmount : '0.00'}` : receiveAmount}
                          </motion.span>
                          <span className="text-xs sm:text-xs text-secondary mt-1">
                            {isSell ? t('swap.labels.inUsd') : t('swap.labels.onNetwork', { network: crypto.label })}
                          </span>
                        </div>

                        {isSell ? (
                          // sell mode "you get": no currency button — fiat is
                          // already chosen in the header selector. shows just
                          // a static label so the box doesn't feel empty on
                          // the right side.
                          <div className="flex items-center gap-1.5 px-3 sm:px-4 py-2 shrink-0">
                            <span className="text-xs font-bold text-secondary font-mono" aria-hidden="true">{fiat.symbol}</span>
                            <span className="text-sm font-bold text-secondary">{fiat.code}</span>
                          </div>
                        ) : (
                          <div className="relative shrink-0">
                            <motion.button onClick={() => setShowCryptoMenu((v) => !v)} className="flex items-center gap-1.5 sm:gap-2 bg-surface-container-lowest dark:bg-surface-container px-3 sm:px-4 py-2 rounded-lg dark:border dark:border-outline-variant/10" whileTap={{ scale: 0.97 }} aria-haspopup="listbox" aria-expanded={showCryptoMenu}>
                              <CryptoIcon symbol={crypto.symbol} size={20} />
                              <span className="text-sm font-bold">{crypto.symbol}</span>
                              <CaretDown size={16} weight="bold" className="text-secondary" />
                            </motion.button>
                            <CryptoDropdown
                              open={showCryptoMenu}
                              cryptos={CRYPTOS}
                              activeSymbol={crypto.symbol}
                              onSelect={handleCryptoSelect}
                            />
                          </div>
                        )}
                      </div>
                    </motion.div>
                  </StaggerItem>

                  {/* providers hint — full comparison happens after Continue */}
                  <StaggerItem>
                    <div className="flex items-center justify-center gap-2 text-xs text-secondary px-1 sm:px-2">
                      <SealCheck size={14} weight="fill" className="text-success" aria-hidden="true" />
                      <span>{t('swap.providersHint', { count: MOCK_PROVIDERS.length })}</span>
                    </div>
                  </StaggerItem>

                  {/* wallet / payout address */}
                  <StaggerItem className="space-y-1.5 sm:space-y-2">
                    <label htmlFor="swap-wallet-address" className="text-xs font-bold tracking-widest text-secondary uppercase ml-1 sm:ml-2">
                      {isSell ? t('swap.labels.payoutAddress') : t('swap.labels.walletAddress')}
                    </label>
                    {/* show red error styling only after the input has been
                        touched and is still empty — avoids screaming at the
                        user before they've interacted. */}
                    <div className={`p-3 sm:p-4 rounded-lg flex items-center gap-2 sm:gap-3 ${
                      wallet || !walletTouched
                        ? 'bg-surface-container-low/80 dark:bg-surface-container-high/40 border border-transparent'
                        : 'bg-error-container/20 dark:bg-error-container/30 border border-error/30 dark:border-error/20'
                    }`}>
                      <span className={`shrink-0 inline-flex ${wallet || !walletTouched ? 'text-primary' : 'text-error'}`} aria-hidden="true">
                        {isSell ? <Bank size={18} weight="bold" /> : <WalletIcon size={18} weight="bold" />}
                      </span>
                      <input
                        id="swap-wallet-address"
                        aria-describedby={walletTouched && !wallet ? 'wallet-error' : undefined}
                        aria-invalid={walletTouched && !wallet ? 'true' : undefined}
                        className="bg-transparent border-none p-0 w-full min-w-0 text-sm text-on-surface focus:ring-0 focus:outline-none placeholder:text-secondary/40"
                        placeholder={isSell ? t('swap.placeholders.payoutAddress') : t('swap.placeholders.walletAddress')}
                        type="text"
                        value={wallet}
                        onChange={(e) => setWallet(e.target.value)}
                        onBlur={() => setWalletTouched(true)}
                      />
                    </div>
                    {walletTouched && !wallet && (
                      <p id="wallet-error" role="alert" className="text-xs text-error/80 px-1 sm:px-2">
                        {isSell ? t('swap.errors.payoutRequired') : t('swap.errors.walletRequired', { network: crypto.label })}
                      </p>
                    )}
                  </StaggerItem>

                  {/* payment / payout method */}
                  <StaggerItem className="space-y-1.5 sm:space-y-2">
                    <label className="text-xs font-bold tracking-widest text-secondary uppercase ml-1 sm:ml-2">
                      {isSell ? t('swap.labels.payoutMethod') : t('swap.labels.paymentMethod')}
                    </label>
                    <motion.button onClick={() => { setShowPayMenu((v) => !v); setShowCryptoMenu(false); setShowFiatMenu(false) }} className="w-full bg-surface-container-lowest dark:bg-surface-container border border-outline-variant/20 dark:border-white/5 p-3 sm:p-4 rounded-lg flex items-center justify-between shadow-sm hover:bg-surface-container-low/30 dark:hover:bg-surface-container-high/20" whileTap={{ scale: 0.99 }}>
                      <div className="flex items-center gap-2 sm:gap-3">
                        <span className="text-secondary inline-flex"><payMethod.Icon size={18} weight="bold" /></span>
                        <span className="text-sm font-medium">{payMethod.label}</span>
                      </div>
                      <motion.span className="text-secondary inline-flex" animate={{ rotate: showPayMenu ? 180 : 0 }}>
                        <CaretDown size={16} weight="bold" />
                      </motion.span>
                    </motion.button>
                    <AnimatePresence>
                      {showPayMenu && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                          <div className="space-y-1 pt-1">
                            {PAYMENT_METHODS.map((m, i) => (
                              <motion.button key={m.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }} onClick={() => { setPayMethod(m); setShowPayMenu(false) }}
                                className={`w-full flex items-center gap-3 p-3 rounded-lg ${payMethod.id === m.id ? 'bg-primary/5 border border-primary/10' : 'hover:bg-surface-container-low dark:hover:bg-surface-container-high/30'}`}>
                                <span className="text-secondary inline-flex"><m.Icon size={18} weight="bold" /></span>
                                <span className={`text-sm font-medium ${payMethod.id === m.id ? 'text-primary' : 'text-on-surface'}`}>{m.label}</span>
                                {payMethod.id === m.id && <Check size={14} weight="bold" className="text-primary ml-auto" />}
                              </motion.button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </StaggerItem>

                  {/* CTA: opens provider comparison stage */}
                  <StaggerItem>
                    <MagneticButton
                      onClick={handleSubmit}
                      aria-disabled={!canSubmit}
                      title={!canSubmit ? (isSell ? t('swap.cta.needAmountAndPayout') : t('swap.cta.needWallet')) : undefined}
                      className={`w-full py-4 sm:py-5 rounded-xl font-bold font-[family-name:var(--font-family-display)] text-base sm:text-lg transition-opacity ${!canSubmit ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'}`}
                      style={{ backgroundColor: crypto.color, color: getOnColor(crypto.color) }}
                    >
                      {t('swap.cta.continue')}
                    </MagneticButton>
                  </StaggerItem>

                </Stagger>
                  </motion.div>
                </AnimatePresence>
              </motion.div>
            ) : stage === 'compare' ? (
              <motion.div key="compare" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.25 }}>
                <ProviderComparison
                  cards={quoteCards}
                  cryptoSymbol={crypto.symbol}
                  cryptoColor={crypto.color}
                  fiatCode={fiat.code}
                  fiatSymbol={fiat.symbol || '$'}
                  onPick={handlePickProvider}
                  onBack={handleBackToForm}
                />
              </motion.div>
            ) : (
              <motion.div key="flow" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 30 }} transition={{ duration: 0.25 }}>
                <TransactionFlow
                  crypto={crypto}
                  amountUsd={flowAmountUsd}
                  amountCrypto={flowAmountCrypto}
                  wallet={wallet}
                  mode={mode}
                  providerName={pickedProvider ? (quoteCards.find((c) => c.id === pickedProvider)?.name || pickedProvider) : null}
                  onReset={handleReset}
                  onViewHistory={onViewHistory}
                  onWarpChange={onWarpChange}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {(stage === 'form' || stage === 'compare') && (
        <>
          <p className="mt-5 sm:mt-8 text-center text-secondary text-xs sm:text-xs px-4 sm:px-12 leading-relaxed">
            {t('swap.footer.disclaimer')}{' '}
            <Link to="/terms" className="underline hover:text-on-surface">{t('footer.termsOfService')}</Link>{' '}
            {t('swap.footer.andTo')}{' '}
            <Link to="/privacy" className="underline hover:text-on-surface">{t('footer.privacyPolicy')}</Link>.{' '}
            {t('swap.footer.transactionsFinal')}
          </p>
          {!liveMode && (
            <p className="mt-2 text-center text-tertiary text-[10px] uppercase tracking-wider font-bold">
              {t('swap.footer.demoMode')}
            </p>
          )}
        </>
      )}

      {liveMode && (
        <ProviderModal
          isOpen={provider.isOpen}
          widgetUrl={provider.widgetUrl}
          onMessage={provider.handleMessage}
          onClose={provider.close}
          providerName={pickedProviderName(pickedProvider)}
          cryptoColor={crypto.color}
        />
      )}

    </BlurIn>
  )
}

function pickedProviderName(id) {
  if (!id) return 'Provider'
  if (id === 'transak') return 'Transak'
  if (id === 'mtpelerin') return 'Mt Pelerin'
  if (id === 'topper') return 'Topper'
  return id
}

// absolutely-positioned crypto picker. anchored to its trigger via the
// surrounding `relative` wrapper. floats over the chips/swap-arrow below
// without pushing them down — matches the interaction pattern users expect
// from modern dex / fintech UIs.
function CryptoDropdown({ open, cryptos, activeSymbol, onSelect }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="listbox"
          initial={{ opacity: 0, y: -8, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.95 }}
          transition={{ duration: 0.18 }}
          className="absolute right-0 top-full mt-2 z-50 min-w-[220px] bg-surface-container-lowest dark:bg-surface-container rounded-xl shadow-lg shadow-black/15 dark:shadow-black/50 border border-outline-variant/20 dark:border-white/10 py-2 max-h-[280px] overflow-y-auto"
        >
          {cryptos.map((c) => {
            const active = c.symbol === activeSymbol
            return (
              <motion.button
                key={c.symbol}
                role="option"
                aria-selected={active}
                onClick={() => onSelect(c)}
                className={`w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-on-surface/[0.04] dark:hover:bg-on-surface/[0.06] transition-colors ${active ? 'bg-primary/5' : ''}`}
              >
                <CryptoIcon symbol={c.symbol} size={24} />
                <div className="flex flex-col">
                  <span className={`text-sm font-bold ${active ? 'text-primary' : 'text-on-surface'}`}>{c.symbol}</span>
                  <span className="text-xs text-secondary">{c.label}</span>
                </div>
              </motion.button>
            )
          })}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
