import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'motion/react'
import { X, ShieldCheck } from '@phosphor-icons/react'

// privacy disclosure banner. shown once per browser; dismissed forever via
// localStorage key. links to /privacy for the full policy.
//
// this is NOT a "consent gate" — there is nothing to consent to. we don't
// run third-party analytics, advertising trackers, or cross-site cookies.
// the banner discloses the strictly-functional localStorage we DO use
// (theme, language, last-used wallet, transaction history snapshots) so a
// privacy-conscious user knows what's happening before they interact.
//
// GDPR §3.3 of the spec asks for "minimal data collection, privacy policy".
// both are satisfied; this banner is best-practice on top.

const STORAGE_KEY = 'onramp:privacy:disclosed'

function readDismissed() {
  try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
}

function writeDismissed() {
  try { localStorage.setItem(STORAGE_KEY, '1') } catch { /* private mode */ }
}

export default function PrivacyDisclosure() {
  const { t } = useTranslation()
  // start hidden — only show once we've checked localStorage. avoids a flash
  // for returning users on every page load.
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!readDismissed()) {
      // tiny delay so the banner doesn't compete with hero animations on
      // first paint. feels like the page settled, then a polite disclosure.
      const t = setTimeout(() => setVisible(true), 600)
      return () => clearTimeout(t)
    }
  }, [])

  const dismiss = () => {
    writeDismissed()
    setVisible(false)
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="region"
          aria-label={t('privacyDisclosure.aria')}
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          className="fixed bottom-3 left-3 right-3 sm:left-auto sm:right-4 sm:bottom-4 sm:max-w-sm z-50 bg-surface-container-lowest dark:bg-surface-container border border-outline-variant/20 dark:border-white/10 rounded-xl shadow-lg shadow-black/10 dark:shadow-black/40 p-4 sm:p-5"
        >
          <div className="flex items-start gap-3">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary shrink-0" aria-hidden="true">
              <ShieldCheck size={18} weight="bold" />
            </span>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-bold text-on-surface mb-1.5 font-[family-name:var(--font-family-display)]">
                {t('privacyDisclosure.title')}
              </h2>
              <p className="text-xs text-secondary leading-relaxed mb-3">
                {t('privacyDisclosure.body')}{' '}
                <Link
                  to="/privacy"
                  className="text-primary font-semibold hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
                >
                  {t('privacyDisclosure.readMore')}
                </Link>
              </p>
              <button
                type="button"
                onClick={dismiss}
                className="bg-primary text-on-primary px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-primary/90 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                {t('privacyDisclosure.cta')}
              </button>
            </div>
            <button
              type="button"
              onClick={dismiss}
              aria-label={t('privacyDisclosure.dismiss')}
              className="text-secondary hover:text-on-surface transition-colors p-1 -m-1 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
            >
              <X size={14} weight="bold" aria-hidden="true" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// exported helper so tests can reset state without touching localStorage directly.
export { STORAGE_KEY as PRIVACY_DISCLOSURE_STORAGE_KEY }
