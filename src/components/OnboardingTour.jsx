import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'motion/react'
import { X, CaretRight, CaretLeft, CreditCard, Swap, ClockCounterClockwise } from '@phosphor-icons/react'

// first-visit onboarding tour. shows when the user lands on the app
// surface (any of /buy /sell /swap /history) for the first time.
// dismissible via X or "Got it" on the last step; one-shot via
// localStorage flag so returning users don't see it again.
//
// 3 steps — Buy/Sell explained, Swap explained, History explained.
// progress dots at the bottom, prev/next arrows, skip button.
// scoped to the app surface so marketing pages stay clean.

const STORAGE_KEY = 'onramp:onboarding:seen'

function readSeen() {
  try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
}
function writeSeen() {
  try { localStorage.setItem(STORAGE_KEY, '1') } catch { /* private mode */ }
}

const STEPS = [
  {
    Icon: CreditCard,
    titleKey: 'onboarding.buy.title',
    bodyKey: 'onboarding.buy.body',
  },
  {
    Icon: Swap,
    titleKey: 'onboarding.swap.title',
    bodyKey: 'onboarding.swap.body',
  },
  {
    Icon: ClockCounterClockwise,
    titleKey: 'onboarding.history.title',
    bodyKey: 'onboarding.history.body',
  },
]

export default function OnboardingTour() {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    // skip entirely under e2e — the modal's backdrop intercepts clicks
    // and breaks deterministic interaction tests. set VITE_E2E=true in
    // the e2e webServer env (see playwright.config.js).
    if (import.meta.env?.VITE_E2E === 'true') return
    if (!readSeen()) {
      // small delay so the page content paints first, otherwise the
      // modal overlays unstyled content during the first ~200ms.
      const id = setTimeout(() => setVisible(true), 600)
      return () => clearTimeout(id)
    }
  }, [])

  const dismiss = () => {
    writeSeen()
    setVisible(false)
  }

  const next = () => {
    if (step < STEPS.length - 1) setStep((s) => s + 1)
    else dismiss()
  }

  const prev = () => {
    if (step > 0) setStep((s) => s - 1)
  }

  const current = STEPS[step]
  const Icon = current.Icon
  const isLast = step === STEPS.length - 1

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* backdrop. clicking it dismisses too. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={dismiss}
            aria-hidden="true"
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[80]"
          />
          {/* modal */}
          <motion.div
            role="dialog"
            aria-label={t('onboarding.aria', { defaultValue: 'Welcome tour' })}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 280, damping: 26 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[90] w-[min(calc(100vw-1.5rem),24rem)] bg-surface-container-lowest dark:bg-surface-container rounded-2xl shadow-2xl shadow-black/20 dark:shadow-black/60 border border-outline-variant/15 dark:border-white/10 p-6"
          >
            {/* close */}
            <button
              type="button"
              onClick={dismiss}
              aria-label={t('onboarding.skip', { defaultValue: 'Skip tour' })}
              className="absolute top-3 right-3 text-secondary hover:text-on-surface transition-colors p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
            >
              <X size={14} weight="bold" aria-hidden="true" />
            </button>

            {/* content */}
            <div className="flex flex-col items-center text-center">
              <motion.span
                key={step}
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 text-primary mb-4"
                aria-hidden="true"
              >
                <Icon size={28} weight="bold" />
              </motion.span>
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18 }}
                >
                  <h2 className="text-lg sm:text-xl font-bold text-on-surface mb-2 font-[family-name:var(--font-family-display)]">
                    {t(current.titleKey)}
                  </h2>
                  <p className="text-sm text-secondary leading-relaxed">
                    {t(current.bodyKey)}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* dots + nav */}
            <div className="mt-6 flex items-center justify-between">
              <button
                type="button"
                onClick={prev}
                disabled={step === 0}
                aria-label={t('onboarding.prev', { defaultValue: 'Previous' })}
                className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-secondary hover:text-on-surface hover:bg-surface-container-low transition-colors disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <CaretLeft size={16} weight="bold" aria-hidden="true" />
              </button>

              <div className="flex items-center gap-1.5" role="tablist" aria-label="progress">
                {STEPS.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setStep(i)}
                    aria-label={`step ${i + 1}`}
                    aria-current={i === step ? 'true' : undefined}
                    className={`h-1.5 rounded-full transition-all ${
                      i === step ? 'w-6 bg-primary' : 'w-1.5 bg-secondary/30 hover:bg-secondary/50'
                    }`}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={next}
                className={`inline-flex items-center justify-center min-w-9 h-9 px-2.5 gap-1 rounded-lg font-bold text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                  isLast
                    ? 'bg-primary text-on-primary px-3.5 hover:bg-primary/90'
                    : 'text-primary hover:bg-surface-container-low'
                }`}
              >
                {isLast ? (
                  <span>{t('onboarding.gotIt', { defaultValue: 'Got it' })}</span>
                ) : (
                  <>
                    <span className="sr-only sm:not-sr-only">{t('onboarding.next', { defaultValue: 'Next' })}</span>
                    <CaretRight size={14} weight="bold" aria-hidden="true" />
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export { STORAGE_KEY as ONBOARDING_STORAGE_KEY }
