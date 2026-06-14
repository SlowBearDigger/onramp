import { useState, useMemo, useRef, lazy, Suspense } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'motion/react'
import {
  PaperPlaneTilt, Link as LinkIcon, Check, Warning, ShieldCheck,
  CaretDown, Star, QrCode, CircleNotch, X,
} from '@phosphor-icons/react'
import Sidebar from '../components/Sidebar'
import BottomNav from '../components/BottomNav'
import ProviderModal from '../components/ProviderModal'
import TransactionFlow from '../components/TransactionFlow'
import { BlurIn, Stagger, StaggerItem, MagneticButton } from '../components/Motion'
import { CRYPTOS, CryptoIcon, FIAT_OPTIONS } from '../config/cryptos'
import { useProvider } from '../hooks/useProvider'
import { useTrustedAddresses } from '../hooks/useTrustedAddresses'
import { validateAddress, truncateAddress } from '../utils/address'
import { getOnColor } from '../utils/contrast'

// "Pay recipient" — collapse the on-ramp → withdraw → send chain into one
// screen. the user (or a shared link) provides a recipient address, asset,
// currency and amount; we pre-fill the ramp provider's widget with that
// destination so the payer never copies an address or computes fees by hand.
//
// IMPORTANT scope notes (frontend-first scaffold):
//   - we never touch the value flow. the regulated ramp (Transak) takes the
//     fiat and delivers the crypto to the recipient. we're a thin UI layer.
//   - copy says "recipient", never "merchant" — keeping us clear of payment-
//     facilitator framing (pending the client's legal review).
//   - launching the real widget with a third-party destination depends on
//     the ramp confirming retail support for it. until then this runs the
//     mock flow (USE_MOCK) so it's demoable; the live path reuses the same
//     useProvider plumbing as the buy/sell ramp.

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

// QR renderer is lazy — qr-code-styling is ~50KB and only needed when a
// link creator actually opens the QR panel, never on the payer path.
const PayQr = lazy(() => import('../components/PayQr'))

// deep-link params for the payer side. a freelancer shares
//   /pay?to=0x..&asset=USDC&currency=EUR&amount=100&ref=INV-001
// and the client lands here with everything pre-filled.
function resolveAsset(searchParams) {
  const wanted = (searchParams.get('asset') || '').toUpperCase().trim()
  return CRYPTOS.find((c) => c.symbol === wanted) || CRYPTOS.find((c) => c.symbol === 'USDC') || CRYPTOS[0]
}
function resolveFiat(searchParams) {
  const wanted = (searchParams.get('currency') || searchParams.get('fiat') || '').toUpperCase().trim()
  return FIAT_OPTIONS.find((f) => f.code === wanted) || FIAT_OPTIONS[0]
}
function resolveAmount(searchParams) {
  const n = Number(searchParams.get('amount'))
  if (Number.isFinite(n) && n > 0 && n <= 100_000) return String(Math.round(n * 100) / 100)
  return ''
}

export default function PayRecipientPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // payer mode = arrived via a shared link with a destination already set.
  const isPayerLink = Boolean((searchParams.get('to') || '').trim())

  const [recipient, setRecipient] = useState(() => (searchParams.get('to') || '').trim())
  const [recipientTouched, setRecipientTouched] = useState(false)
  const [asset, setAsset] = useState(() => resolveAsset(searchParams))
  const [fiat, setFiat] = useState(() => resolveFiat(searchParams))
  const [amount, setAmount] = useState(() => resolveAmount(searchParams))
  const [showAssetMenu, setShowAssetMenu] = useState(false)
  const [showFiatMenu, setShowFiatMenu] = useState(false)

  const [stage, setStage] = useState('form') // form | confirm | flow (mock)
  const [verified, setVerified] = useState(false) // confirm-step "I checked the address"

  const trusted = useTrustedAddresses()

  const validation = useMemo(
    () => validateAddress(recipient, asset.network),
    [recipient, asset.network],
  )
  const amountNum = parseFloat(amount) || 0
  const canContinue = validation.valid && amountNum > 0

  const liveMode = !USE_MOCK
  const successPendingRef = useRef(false)
  const provider = useProvider({
    onSuccess: () => { successPendingRef.current = true },
    onClose: () => {
      if (successPendingRef.current) {
        successPendingRef.current = false
        setTimeout(() => navigate('/history'), 200)
      }
    },
  })

  const handleContinue = () => {
    if (!canContinue) {
      if (!recipient) setRecipientTouched(true)
      return
    }
    setVerified(false)
    setStage('confirm')
  }

  const handlePay = () => {
    if (liveMode) {
      provider.startOrder({
        providerId: 'transak',
        crypto: asset,
        fiatAmount: amountNum,
        walletAddress: recipient,
        fiatCurrency: fiat.code,
        mode: 'buy',
      })
      return
    }
    setStage('flow')
  }

  const handleReset = () => {
    setStage('form')
    setVerified(false)
    provider.close()
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
                    {t('pay.title')}
                  </h1>
                  <p className="text-xs text-secondary mt-0.5">
                    {isPayerLink ? t('pay.subtitlePayer') : t('pay.subtitle')}
                  </p>
                </div>
                <span className="text-[10px] uppercase tracking-wider font-bold text-tertiary bg-tertiary/10 px-2 py-0.5 rounded">
                  {t('pay.badge')}
                </span>
              </div>

              <AnimatePresence mode="wait">
                {stage === 'form' && (
                  <motion.div
                    key="form"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                  >
                    <PayForm
                      recipient={recipient}
                      onRecipient={(v) => { setRecipient(v); setRecipientTouched(true) }}
                      recipientTouched={recipientTouched}
                      onRecipientBlur={() => setRecipientTouched(true)}
                      validation={validation}
                      asset={asset}
                      onAsset={setAsset}
                      showAssetMenu={showAssetMenu}
                      setShowAssetMenu={setShowAssetMenu}
                      fiat={fiat}
                      onFiat={setFiat}
                      showFiatMenu={showFiatMenu}
                      setShowFiatMenu={setShowFiatMenu}
                      amount={amount}
                      onAmount={setAmount}
                      trusted={trusted}
                      isPayerLink={isPayerLink}
                      canContinue={canContinue}
                      onContinue={handleContinue}
                    />
                  </motion.div>
                )}

                {stage === 'confirm' && (
                  <motion.div
                    key="confirm"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ConfirmCard
                      recipient={recipient}
                      validation={validation}
                      asset={asset}
                      fiat={fiat}
                      amount={amount}
                      verified={verified}
                      onVerifiedChange={setVerified}
                      trusted={trusted}
                      onBack={() => setStage('form')}
                      onPay={handlePay}
                    />
                  </motion.div>
                )}

                {stage === 'flow' && (
                  <motion.div
                    key="flow"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.2 }}
                  >
                    <TransactionFlow
                      crypto={asset}
                      amountUsd={amount}
                      amountCrypto={'—'}
                      wallet={recipient}
                      mode="buy"
                      providerName="Transak"
                      onReset={handleReset}
                      onViewHistory={() => navigate('/history')}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* footer — non-custodial / thin-layer disclosure */}
              {stage !== 'flow' && (
                <div className="mt-5 pt-4 border-t border-outline-variant/10 dark:border-white/5 flex items-start gap-2 text-[11px] text-secondary leading-relaxed">
                  <ShieldCheck size={13} weight="bold" className="shrink-0 mt-0.5" aria-hidden="true" />
                  <p>{t('pay.footnote')}</p>
                </div>
              )}
            </div>
          </BlurIn>
        </div>
      </main>
      <BottomNav />

      {liveMode && (
        <ProviderModal
          isOpen={provider.isOpen}
          widgetUrl={provider.widgetUrl}
          state={provider.state}
          error={provider.error}
          onRetry={provider.retry}
          checkout={provider.checkoutMode}
          onMessage={provider.handleMessage}
          onClose={provider.close}
          providerName="Transak"
          cryptoColor={asset.color}
        />
      )}
    </div>
  )
}

function PayForm({
  recipient, onRecipient, recipientTouched, onRecipientBlur, validation,
  asset, onAsset, showAssetMenu, setShowAssetMenu,
  fiat, onFiat, showFiatMenu, setShowFiatMenu,
  amount, onAmount,
  trusted, isPayerLink, canContinue, onContinue,
}) {
  const { t } = useTranslation()
  const showError = recipientTouched && recipient.length > 0 && !validation.valid

  return (
    <Stagger stagger={0.05} className="space-y-4">
      {/* saved recipients quick-pick (create mode only, when any exist) */}
      {!isPayerLink && trusted.entries.length > 0 && (
        <StaggerItem>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {trusted.entries.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => onRecipient(e.address)}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-low dark:bg-surface-container-high/40 text-xs font-semibold text-on-surface hover:bg-primary/10 transition-colors"
                title={e.address}
              >
                <Star size={12} weight="fill" className="text-tertiary" aria-hidden="true" />
                {e.nickname}
              </button>
            ))}
          </div>
        </StaggerItem>
      )}

      {/* recipient address */}
      <StaggerItem className="space-y-1.5">
        <label htmlFor="pay-recipient" className="text-[11px] font-bold tracking-widest text-secondary uppercase ml-1">
          {t('pay.recipientLabel')}
        </label>
        <div className={`p-3 sm:p-4 rounded-xl flex items-center gap-3 transition-colors ${
          showError
            ? 'bg-error-container/20 dark:bg-error-container/30 border border-error/30'
            : validation.valid
              ? 'bg-surface-container-low/80 dark:bg-surface-container-high/40 border border-success/30'
              : 'bg-surface-container-low/80 dark:bg-surface-container-high/40 border border-transparent'
        }`}>
          <span className={`shrink-0 inline-flex ${showError ? 'text-error' : validation.valid ? 'text-success' : 'text-secondary'}`} aria-hidden="true">
            {validation.valid ? <ShieldCheck size={18} weight="bold" /> : <PaperPlaneTilt size={18} weight="bold" />}
          </span>
          <input
            id="pay-recipient"
            className="bg-transparent border-none p-0 w-full min-w-0 text-sm text-on-surface focus:ring-0 focus:outline-none placeholder:text-secondary/40 font-mono"
            placeholder={t('pay.recipientPlaceholder')}
            type="text"
            value={recipient}
            onChange={(e) => onRecipient(e.target.value)}
            onBlur={onRecipientBlur}
            aria-invalid={showError ? 'true' : undefined}
            aria-describedby={showError ? 'pay-recipient-error' : undefined}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        {showError && (
          <p id="pay-recipient-error" role="alert" className="text-xs text-error/80 px-1">
            {validation.reason === 'checksum'
              ? t('pay.errors.checksum')
              : t('pay.errors.format', { network: asset.label })}
          </p>
        )}
        {validation.valid && validation.unchecked && (
          <p className="text-xs text-tertiary/90 px-1">{t('pay.errors.unchecked', { network: asset.label })}</p>
        )}
      </StaggerItem>

      {/* asset + currency row */}
      <StaggerItem className="grid grid-cols-2 gap-3">
        {/* asset (what the recipient gets) */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold tracking-widest text-secondary uppercase ml-1">{t('pay.assetLabel')}</label>
          <div className="relative">
            <button
              type="button"
              onClick={() => { setShowAssetMenu((v) => !v); setShowFiatMenu(false) }}
              className="w-full flex items-center justify-between gap-2 bg-surface-container-low dark:bg-surface-container-high/40 px-3 py-3 rounded-xl hover:bg-surface-container dark:hover:bg-surface-container-high/60 transition-colors"
              aria-haspopup="listbox"
              aria-expanded={showAssetMenu}
            >
              <span className="flex items-center gap-2 min-w-0">
                <CryptoIcon symbol={asset.symbol} size={20} />
                <span className="text-sm font-bold truncate">{asset.symbol}</span>
              </span>
              <CaretDown size={14} weight="bold" className="text-secondary shrink-0" aria-hidden="true" />
            </button>
            <AnimatePresence>
              {showAssetMenu && (
                <motion.ul
                  role="listbox"
                  initial={{ opacity: 0, y: -8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.96 }}
                  transition={{ duration: 0.16 }}
                  className="absolute left-0 right-0 top-full mt-2 z-50 max-h-[260px] overflow-y-auto bg-surface-container-lowest dark:bg-surface-container rounded-xl shadow-lg shadow-black/15 dark:shadow-black/50 border border-outline-variant/20 dark:border-white/10 py-2 list-none m-0 p-0"
                >
                  {CRYPTOS.map((c) => {
                    const active = c.symbol === asset.symbol
                    return (
                      <li key={c.symbol}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() => { onAsset(c); setShowAssetMenu(false) }}
                          className={`w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-on-surface/[0.04] dark:hover:bg-on-surface/[0.06] transition-colors ${active ? 'bg-primary/5' : ''}`}
                        >
                          <CryptoIcon symbol={c.symbol} size={22} />
                          <span className="flex flex-col">
                            <span className={`text-sm font-bold ${active ? 'text-primary' : 'text-on-surface'}`}>{c.symbol}</span>
                            <span className="text-xs text-secondary">{c.label}</span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* currency (what the payer is charged in) */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold tracking-widest text-secondary uppercase ml-1">{t('pay.currencyLabel')}</label>
          <div className="relative">
            <button
              type="button"
              onClick={() => { setShowFiatMenu((v) => !v); setShowAssetMenu(false) }}
              className="w-full flex items-center justify-between gap-2 bg-surface-container-low dark:bg-surface-container-high/40 px-3 py-3 rounded-xl hover:bg-surface-container dark:hover:bg-surface-container-high/60 transition-colors"
              aria-haspopup="listbox"
              aria-expanded={showFiatMenu}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-bold text-secondary font-mono">{fiat.symbol}</span>
                <span className="text-sm font-bold truncate">{fiat.code}</span>
              </span>
              <CaretDown size={14} weight="bold" className="text-secondary shrink-0" aria-hidden="true" />
            </button>
            <AnimatePresence>
              {showFiatMenu && (
                <motion.ul
                  role="listbox"
                  initial={{ opacity: 0, y: -8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.96 }}
                  transition={{ duration: 0.16 }}
                  className="absolute left-0 right-0 top-full mt-2 z-50 max-h-[260px] overflow-y-auto bg-surface-container-lowest dark:bg-surface-container rounded-xl shadow-lg shadow-black/15 dark:shadow-black/50 border border-outline-variant/20 dark:border-white/10 py-2 list-none m-0 p-0"
                >
                  {FIAT_OPTIONS.map((f) => {
                    const active = f.code === fiat.code
                    return (
                      <li key={f.code}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() => { onFiat(f); setShowFiatMenu(false) }}
                          className={`w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-on-surface/[0.04] dark:hover:bg-on-surface/[0.06] transition-colors ${active ? 'bg-primary/5' : ''}`}
                        >
                          <span className={`text-xs font-bold font-mono w-5 ${active ? 'text-primary' : 'text-secondary'}`}>{f.symbol}</span>
                          <span className={`text-sm font-bold ${active ? 'text-primary' : 'text-on-surface'}`}>{f.code}</span>
                        </button>
                      </li>
                    )
                  })}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        </div>
      </StaggerItem>

      {/* amount */}
      <StaggerItem className="space-y-1.5">
        <label htmlFor="pay-amount" className="text-[11px] font-bold tracking-widest text-secondary uppercase ml-1">
          {t('pay.amountLabel')}
        </label>
        <div className="bg-surface-container/60 dark:bg-black/20 p-4 rounded-xl border border-outline-variant/5 dark:border-white/5 flex items-center gap-2">
          <span className="text-2xl sm:text-3xl font-bold text-on-surface font-[family-name:var(--font-family-display)]">{fiat.symbol}</span>
          <input
            id="pay-amount"
            className="bg-transparent border-none p-0 text-2xl sm:text-3xl font-bold text-on-surface font-[family-name:var(--font-family-display)] focus:ring-0 focus:outline-none w-full min-w-0 placeholder:text-secondary/30"
            placeholder="0.00"
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9.]/g, '')
              if (v.split('.').length <= 2) onAmount(v)
            }}
          />
          <span className="text-xs font-bold text-secondary uppercase shrink-0">{fiat.code}</span>
        </div>
      </StaggerItem>

      {/* primary action */}
      <StaggerItem>
        <MagneticButton
          onClick={onContinue}
          aria-disabled={!canContinue}
          className={`w-full py-4 rounded-xl font-bold font-[family-name:var(--font-family-display)] text-base sm:text-lg transition-opacity ${!canContinue ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'}`}
          style={{ backgroundColor: asset.color, color: getOnColor(asset.color) }}
        >
          {t('pay.review')}
        </MagneticButton>
      </StaggerItem>

      {/* shareable link + QR (create mode) */}
      {!isPayerLink && (
        <StaggerItem>
          <ShareLinkRow recipient={recipient} asset={asset} fiat={fiat} amount={amount} canShare={canContinue} />
        </StaggerItem>
      )}
    </Stagger>
  )
}

// builds /pay?to=..&asset=..&currency=..&amount=.. against the current
// origin + router base. used by the freelancer/store to send a prefilled
// link or render it as a QR at point of sale.
function buildPayLink({ recipient, asset, fiat, amount }) {
  const base = `${window.location.origin}${import.meta.env.BASE_URL || '/'}`.replace(/\/$/, '')
  const qs = new URLSearchParams()
  qs.set('to', recipient.trim())
  qs.set('asset', asset.symbol)
  qs.set('currency', fiat.code)
  if (parseFloat(amount) > 0) qs.set('amount', String(parseFloat(amount)))
  return `${base}/pay?${qs.toString()}`
}

function ShareLinkRow({ recipient, asset, fiat, amount, canShare }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)

  const url = canShare ? buildPayLink({ recipient, asset, fiat, amount }) : null

  const copy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // clipboard blocked (insecure context / permissions) — surface the URL
      // so the user can copy it manually rather than failing silently.
      window.prompt(t('pay.copyManual'), url)
    }
  }

  const shareClasses = (enabled) =>
    `flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed text-sm font-bold transition-colors ${
      enabled
        ? 'border-primary/40 text-primary hover:bg-primary/5'
        : 'border-outline-variant/30 text-secondary/50 cursor-not-allowed'
    }`

  return (
    <>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <button type="button" onClick={copy} aria-disabled={!canShare} className={shareClasses(canShare)}>
          {copied ? (
            <><Check size={16} weight="bold" aria-hidden="true" /> {t('pay.linkCopied')}</>
          ) : (
            <><LinkIcon size={16} weight="bold" aria-hidden="true" /> {t('pay.createLink')}</>
          )}
        </button>
        <button
          type="button"
          onClick={() => canShare && setQrOpen(true)}
          aria-disabled={!canShare}
          aria-label={t('pay.qr.open')}
          title={t('pay.qr.open')}
          className={`${shareClasses(canShare)} px-4`}
        >
          <QrCode size={18} weight="bold" aria-hidden="true" />
        </button>
      </div>
      <AnimatePresence>
        {qrOpen && url && (
          <PayQrModal
            url={url}
            footerText={t('pay.qr.footer', { amount: `${fiat.symbol}${amount} ${fiat.code}`, asset: asset.symbol })}
            onClose={() => setQrOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  )
}

// centered overlay hosting the lazy QR. backdrop click or X dismisses.
function PayQrModal({ url, footerText, onClose }) {
  const { t } = useTranslation()
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        aria-hidden="true"
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[80]"
      />
      <motion.div
        role="dialog"
        aria-label={t('pay.qr.title')}
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[90] w-[min(calc(100vw-1.5rem),22rem)] bg-surface-container-lowest dark:bg-surface-container rounded-2xl shadow-2xl shadow-black/20 dark:shadow-black/60 border border-outline-variant/15 dark:border-white/10 p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-on-surface font-[family-name:var(--font-family-display)] m-0">
            {t('pay.qr.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="text-secondary hover:text-on-surface transition-colors p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
          >
            <X size={14} weight="bold" aria-hidden="true" />
          </button>
        </div>
        <Suspense fallback={
          <div role="status" className="h-[240px] flex items-center justify-center text-secondary">
            <CircleNotch size={20} weight="bold" className="animate-spin" aria-hidden="true" />
          </div>
        }>
          <PayQr url={url} footerText={footerText} />
        </Suspense>
      </motion.div>
    </>
  )
}

function ConfirmCard({
  recipient, validation, asset, fiat, amount,
  verified, onVerifiedChange, trusted, onBack, onPay,
}) {
  const { t } = useTranslation()
  const [saveOpen, setSaveOpen] = useState(false)
  const [nickname, setNickname] = useState('')
  const alreadyTrusted = trusted.has(recipient, asset.network)

  const saveTrusted = () => {
    if (!nickname.trim()) return
    // createdAt stamped here (UI layer) since the hook stays clock-free.
    trusted.save({ nickname, address: recipient, network: asset.network, createdAt: Date.now() })
    setSaveOpen(false)
    setNickname('')
  }

  return (
    <div className="space-y-4">
      {/* verification card — show the address head/tail prominently so the
          user can eyeball it, plus the full string in mono below. */}
      <div className="bg-surface-container/60 dark:bg-black/20 rounded-xl border border-outline-variant/10 dark:border-white/5 p-4 sm:p-5 space-y-4">
        <div className="flex items-center gap-2 text-secondary">
          <ShieldCheck size={16} weight="bold" className={validation.checksummed ? 'text-success' : 'text-tertiary'} aria-hidden="true" />
          <span className="text-[11px] font-bold uppercase tracking-widest">{t('pay.confirm.recipientHeading')}</span>
        </div>
        <div>
          <p className="text-xl sm:text-2xl font-bold text-on-surface font-mono tracking-tight">
            {truncateAddress(recipient, 8, 6)}
          </p>
          <p className="text-[11px] text-secondary font-mono break-all mt-1.5 leading-relaxed">{recipient}</p>
          {validation.checksummed && (
            <p className="text-[11px] text-success font-semibold mt-1.5 inline-flex items-center gap-1">
              <Check size={12} weight="bold" aria-hidden="true" /> {t('pay.confirm.checksumOk')}
            </p>
          )}
        </div>

        {/* amount + asset summary */}
        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-outline-variant/10 dark:border-white/5">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-secondary font-bold mb-0.5">{t('pay.confirm.theyReceive')}</p>
            <p className="text-sm font-bold text-on-surface inline-flex items-center gap-1.5">
              <CryptoIcon symbol={asset.symbol} size={16} /> {asset.symbol}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-secondary font-bold mb-0.5">{t('pay.confirm.youPay')}</p>
            <p className="text-sm font-bold text-on-surface font-mono">{fiat.symbol}{amount} {fiat.code}</p>
          </div>
        </div>

      </div>

      {/* irreversible warning */}
      <div className="flex items-start gap-2.5 p-3 rounded-xl bg-error-container/15 dark:bg-error-container/25 border border-error/20">
        <Warning size={18} weight="fill" className="text-error shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-xs text-on-surface/90 leading-relaxed">{t('pay.confirm.irreversible')}</p>
      </div>

      {/* explicit verification checkbox — gates the Pay button */}
      <label className="flex items-start gap-2.5 cursor-pointer px-1">
        <input
          type="checkbox"
          checked={verified}
          onChange={(e) => onVerifiedChange(e.target.checked)}
          className="mt-0.5 w-4 h-4 rounded accent-primary shrink-0"
        />
        <span className="text-xs text-on-surface/90 leading-relaxed">{t('pay.confirm.verifyCheckbox')}</span>
      </label>

      {/* save as trusted (optional) */}
      {!alreadyTrusted && (
        <div className="px-1">
          {!saveOpen ? (
            <button
              type="button"
              onClick={() => setSaveOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline underline-offset-2"
            >
              <Star size={13} weight="bold" aria-hidden="true" /> {t('pay.confirm.saveTrusted')}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <input
                className="flex-1 bg-surface-container-low/80 dark:bg-surface-container-high/40 border border-transparent px-3 py-2 rounded-lg text-sm text-on-surface focus:ring-0 focus:outline-none focus-visible:border-primary/40 placeholder:text-secondary/40"
                placeholder={t('pay.confirm.nicknamePlaceholder')}
                type="text"
                maxLength={32}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                autoFocus
              />
              <button
                type="button"
                onClick={saveTrusted}
                disabled={!nickname.trim()}
                className="px-3 py-2 rounded-lg bg-primary text-on-primary text-xs font-bold disabled:opacity-40"
              >
                {t('common.continue')}
              </button>
            </div>
          )}
        </div>
      )}
      {alreadyTrusted && (
        <p className="px-1 text-xs text-secondary inline-flex items-center gap-1.5">
          <Star size={13} weight="fill" className="text-tertiary" aria-hidden="true" /> {t('pay.confirm.alreadyTrusted')}
        </p>
      )}

      {/* actions */}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onBack}
          className="px-5 py-3.5 rounded-xl font-bold text-sm text-on-surface bg-surface-container-low dark:bg-surface-container-high/40 hover:bg-surface-container dark:hover:bg-surface-container-high/60 transition-colors"
        >
          {t('common.back')}
        </button>
        <MagneticButton
          onClick={verified ? onPay : undefined}
          aria-disabled={!verified}
          className={`flex-1 py-3.5 rounded-xl font-bold font-[family-name:var(--font-family-display)] text-base inline-flex items-center justify-center gap-2 transition-opacity ${!verified ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'}`}
          style={{ backgroundColor: asset.color, color: getOnColor(asset.color) }}
        >
          <PaperPlaneTilt size={18} weight="bold" aria-hidden="true" />
          {t('pay.confirm.payNow', { amount: `${fiat.symbol}${amount}` })}
        </MagneticButton>
      </div>
    </div>
  )
}
