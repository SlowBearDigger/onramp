import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { SealCheck, Check, WarningCircle } from '@phosphor-icons/react'
import { CryptoIcon } from '../config/cryptos'
import { MagneticButton } from './Motion'
import { MOCK_PROVIDERS, PROCESSING_STEPS, generateTxHash } from '../data/mockData'
import ConfettiBurst from './ConfettiBurst'
// CosmicWarp effect is now handled by ReactiveBlobs in the background

const slideVariants = {
  enter: { x: 60, opacity: 0 },
  center: { x: 0, opacity: 1 },
  exit: { x: -60, opacity: 0 },
}

// review stage. providerName, when passed, picks the matching mock entry so
// the displayed fee/speed match the provider the user just chose. falls back
// to the first entry if not found (offline demo).
function ReviewStage({ crypto, amountUsd, amountCrypto, wallet, mode, providerName, onConfirm, onBack }) {
  const provider = (providerName && MOCK_PROVIDERS.find((p) => p.name === providerName)) || MOCK_PROVIDERS[0]

  return (
    <motion.div variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }} className="space-y-5">
      <div className="text-center mb-2">
        <p className="text-xs font-bold text-secondary uppercase tracking-widest mb-3">Review Order</p>
        <CryptoIcon symbol={crypto.symbol} size={48} />
        <motion.p initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="text-3xl font-extrabold text-on-surface mt-3 font-[family-name:var(--font-family-display)]">
          {amountCrypto} {crypto.symbol}
        </motion.p>
        <p className="text-sm text-secondary mt-1">${Number(amountUsd).toLocaleString()} USD</p>
      </div>

      <div className="space-y-3 bg-surface-container-low/80 dark:bg-surface-container-high/40 p-4 rounded-lg">
        <div className="flex justify-between text-sm">
          <span className="text-secondary">{mode === 'buy' ? 'Send to' : 'From'}</span>
          <span className="font-mono text-xs text-on-surface">{wallet || 'Not provided'}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-secondary">Provider</span>
          <span className="font-bold text-on-surface flex items-center gap-1.5">
            <SealCheck size={14} weight="fill" className="text-success" />
            {provider.name}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-secondary">Rate</span>
          <span className="font-medium text-on-surface">1 {crypto.symbol} = ${crypto.rate.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-secondary">Fee</span>
          <span className="font-bold" style={{ color: crypto.color }}>${provider.fee} USD</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-secondary">Speed</span>
          <span className="font-medium text-on-surface">{provider.speed}</span>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <MagneticButton onClick={onBack} className="flex-1 py-3.5 rounded-xl font-bold text-sm bg-surface-container-highest dark:bg-surface-container-high text-on-surface">
          Back
        </MagneticButton>
        <MagneticButton onClick={onConfirm} className="flex-1 py-3.5 rounded-xl font-bold text-sm text-white shadow-lg" style={{ backgroundColor: crypto.color }}>
          Confirm {mode === 'buy' ? 'Purchase' : 'Sale'}
        </MagneticButton>
      </div>

      <p className="text-center text-xs text-secondary/50 mt-3">
        Processed by {provider.name} · Non-custodial
      </p>
    </motion.div>
  )
}

// ─── Processing Stage (Cosmic Warp) ─────────────────────────────────────
function ProcessingStage({ crypto, onComplete, onWarpChange }) {
  const [currentStep, setCurrentStep] = useState(0)

  useEffect(() => {
    if (currentStep >= PROCESSING_STEPS.length) {
      // Signal "landing" phase to blobs before transitioning to success
      onWarpChange?.('landing')
      const landing = setTimeout(onComplete, 1200)
      return () => clearTimeout(landing)
    }
    const timer = setTimeout(() => setCurrentStep((s) => s + 1), PROCESSING_STEPS[currentStep].duration)
    return () => clearTimeout(timer)
  }, [currentStep, onComplete, onWarpChange])

  return (
    <motion.div
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.3 }}
      className="relative py-8 min-h-[280px] flex flex-col items-center justify-center"
    >
      {/* Warp effect is now in ReactiveBlobs (page background) */}

      {/* Centered icon */}
      <motion.div
        className="relative z-10 flex flex-col items-center gap-6"
        animate={{
          scale: currentStep === 0 ? 1 : currentStep < PROCESSING_STEPS.length ? 0.85 : 1.1,
        }}
        transition={{ duration: 1, ease: 'easeInOut' }}
      >
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center relative"
          style={{ backgroundColor: `${crypto.color}15` }}
        >
          {currentStep > 0 && currentStep < PROCESSING_STEPS.length && (
            <motion.div
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                backgroundColor: crypto.color,
                filter: 'blur(14px)',
                willChange: 'opacity',
              }}
              animate={{ opacity: [0.15, 0.35, 0.15] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
          <div className="relative z-10">
            <CryptoIcon symbol={crypto.symbol} size={40} />
          </div>
        </div>

        {/* Step indicators */}
        <div className="space-y-3 w-full">
          {PROCESSING_STEPS.map((step, i) => (
            <motion.div
              key={step.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.3, duration: 0.4 }}
              className="flex items-center gap-3"
            >
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                  i < currentStep
                    ? 'text-white'
                    : i === currentStep
                    ? 'border-2'
                    : 'bg-surface-container-high/50 dark:bg-white/5'
                }`}
                style={
                  i < currentStep
                    ? { backgroundColor: crypto.color }
                    : i === currentStep
                    ? { borderColor: crypto.color }
                    : {}
                }
              >
                {i < currentStep && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="inline-flex"
                  >
                    <Check size={11} weight="bold" />
                  </motion.span>
                )}
                {i === currentStep && (
                  <motion.div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: crypto.color }}
                    animate={{ scale: [1, 1.6, 1], opacity: [1, 0.5, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                )}
              </div>
              <span
                className={`text-sm ${
                  i < currentStep
                    ? 'text-on-surface/50 line-through'
                    : i === currentStep
                    ? 'text-on-surface font-semibold'
                    : 'text-secondary/40'
                }`}
              >
                {step.label}
              </span>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Success Stage ───────────────────────────────────────────────────────
function SuccessStage({ crypto, amountCrypto, amountUsd, mode, onNewPurchase, onViewHistory }) {
  const txHash = generateTxHash()

  return (
    <motion.div variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }} className="py-4 space-y-6 text-center">
      <div className="relative w-32 h-32 mx-auto">
        <ConfettiBurst color={crypto.color} particleCount={45} />
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
          className="absolute inset-0 m-auto w-20 h-20 rounded-full flex items-center justify-center text-white"
          style={{ backgroundColor: crypto.color }}
        >
          <motion.span
            className="inline-flex"
            initial={{ opacity: 0, rotate: -90 }}
            animate={{ opacity: 1, rotate: 0 }}
            transition={{ delay: 0.4, duration: 0.4 }}
          >
            <Check size={36} weight="bold" />
          </motion.span>
        </motion.div>
      </div>

      <div>
        <motion.h3 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="text-xl font-bold text-on-surface mb-1">
          {mode === 'buy' ? 'Purchase' : 'Sale'} Complete!
        </motion.h3>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="text-secondary text-sm">
          {mode === 'buy' ? 'Your crypto is on its way' : 'Funds are being sent to your account'}
        </motion.p>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="bg-surface-container-low/80 dark:bg-surface-container-high/40 p-4 rounded-lg space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-secondary">Amount</span>
          <span className="font-bold text-on-surface">{amountCrypto} {crypto.symbol}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-secondary">Value</span>
          <span className="font-medium text-on-surface">${Number(amountUsd).toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-secondary">Tx Hash</span>
          <span className="font-mono text-xs text-secondary">{txHash.slice(0, 10)}...{txHash.slice(-6)}</span>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="flex gap-3 pt-2">
        <MagneticButton onClick={onViewHistory} className="flex-1 py-3.5 rounded-xl font-bold text-sm bg-surface-container-highest dark:bg-surface-container-high text-on-surface">
          View History
        </MagneticButton>
        <MagneticButton onClick={onNewPurchase} className="flex-1 py-3.5 rounded-xl font-bold text-sm text-white shadow-lg" style={{ backgroundColor: crypto.color }}>
          New {mode === 'buy' ? 'Purchase' : 'Sale'}
        </MagneticButton>
      </motion.div>
    </motion.div>
  )
}

// ─── Error Stage ─────────────────────────────────────────────────────────
function ErrorStage({ crypto, mode, onRetry, onBack }) {
  return (
    <motion.div variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }} className="py-6 space-y-6 text-center">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        className="w-20 h-20 rounded-full mx-auto flex items-center justify-center bg-error/10"
      >
        <WarningCircle size={36} weight="bold" className="text-error" />
      </motion.div>
      <div>
        <h3 className="text-xl font-bold text-on-surface mb-1">{mode === 'buy' ? 'Purchase' : 'Sale'} Failed</h3>
        <p className="text-secondary text-sm">Something went wrong with the transaction. Please try again.</p>
      </div>
      <div className="flex gap-3 pt-2">
        <MagneticButton onClick={onBack} className="flex-1 py-3.5 rounded-xl font-bold text-sm bg-surface-container-highest dark:bg-surface-container-high text-on-surface">
          Cancel
        </MagneticButton>
        <MagneticButton onClick={onRetry} className="flex-1 py-3.5 rounded-xl font-bold text-sm text-white shadow-lg" style={{ backgroundColor: crypto.color }}>
          Try Again
        </MagneticButton>
      </div>
    </motion.div>
  )
}

// ─── Main Flow Controller ────────────────────────────────────────────────
export default function TransactionFlow({
  crypto, amountUsd, amountCrypto, wallet, mode = 'buy',
  providerName,
  onReset, onViewHistory, onWarpChange,
}) {
  const [stage, setStage] = useState('review')

  // Sync warp phase with stage
  useEffect(() => {
    if (!onWarpChange) return
    if (stage === 'processing') onWarpChange('warp')
    else if (stage === 'success') onWarpChange('success')
    else onWarpChange('idle')
    return () => onWarpChange('idle')
  }, [stage, onWarpChange])

  return (
    <AnimatePresence mode="wait">
      {stage === 'review' && (
        <ReviewStage
          key="review"
          crypto={crypto}
          amountUsd={amountUsd}
          amountCrypto={amountCrypto}
          wallet={wallet}
          mode={mode}
          providerName={providerName}
          onConfirm={() => setStage('processing')}
          onBack={onReset}
        />
      )}
      {stage === 'processing' && (
        <ProcessingStage
          key="processing"
          crypto={crypto}
          onComplete={() => setStage('success')}
          onWarpChange={onWarpChange}
        />
      )}
      {stage === 'success' && (
        <SuccessStage
          key="success"
          crypto={crypto}
          amountCrypto={amountCrypto}
          amountUsd={amountUsd}
          mode={mode}
          onNewPurchase={onReset}
          onViewHistory={onViewHistory}
        />
      )}
      {stage === 'error' && (
        <ErrorStage
          key="error"
          crypto={crypto}
          mode={mode}
          onRetry={() => { setStage('review'); onReset?.() }}
          onBack={onReset}
        />
      )}
    </AnimatePresence>
  )
}
