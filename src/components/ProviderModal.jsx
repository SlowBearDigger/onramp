import { useEffect, useRef, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'motion/react'
import { X, Lock } from '@phosphor-icons/react'

// generic provider widget modal. wraps the picked provider's iframe and
// forwards postMessage events to the parent via onMessage. used by SwapWidget
// for transak / mtpelerin / topper alike.
//
// accessibility:
//   - role="dialog" + aria-modal="true" + aria-labelledby on the header.
//   - ESC closes the modal (matches WCAG 2.1 expectation for non-destructive dismissal).
//   - on open, focus moves to the close button so keyboard users land somewhere actionable.
//   - on close, focus returns to whatever element was focused before opening
//     (prevents the "focus jumps to body" anti-pattern).
//   - background scroll is locked while open so screen-reader users don't lose
//     their place under the modal.
//
// iframe sandbox notes (defense-in-depth, identical across providers):
//   - camera:     required for KYC doc + selfie capture (transak, topper).
//                  mtpelerin's widget may also use it inside its own KYB.
//   - fullscreen: used by some card-entry sub-iframes for PCI compliance.
//   - payment:    Payment Request API for apple pay / google pay.
//   - microphone intentionally dropped — KYC selfie is silent.
//
// sandbox attribute:
//   - allow-same-origin: REQUIRED so the provider's widget can drive its own
//     sub-iframes (transak in particular nests sub-iframes from same origin).
//   - allow-popups: covers redirects to bank auth flows.
//   - allow-forms + allow-scripts: minimum for an interactive widget.
export default function ProviderModal({
  isOpen,
  widgetUrl,
  onMessage,
  onClose,
  providerName,
  cryptoColor = '#047857',
}) {
  const { t } = useTranslation()
  const provider = providerName || t('common.providerName')
  const headingId = useId()
  const closeButtonRef = useRef(null)
  const previouslyFocusedRef = useRef(null)

  // listen for postMessage events while open.
  useEffect(() => {
    if (!isOpen) return
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [isOpen, onMessage])

  // ESC to close, focus management, and scroll lock.
  useEffect(() => {
    if (!isOpen) return

    previouslyFocusedRef.current = document.activeElement
    // defer to next frame so the modal is mounted when we focus.
    const focusTimer = setTimeout(() => {
      closeButtonRef.current?.focus()
    }, 0)

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      clearTimeout(focusTimer)
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      // return focus to whoever opened us. guard against detached nodes.
      const prev = previouslyFocusedRef.current
      if (prev && typeof prev.focus === 'function' && document.contains(prev)) {
        prev.focus()
      }
    }
  }, [isOpen, onClose])

  return (
    <AnimatePresence>
      {isOpen && widgetUrl && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby={headingId}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="relative w-full max-w-md h-[85vh] sm:h-[680px] bg-surface-container-lowest dark:bg-surface-container rounded-2xl overflow-hidden shadow-lg shadow-black/20 dark:shadow-black/50 border border-outline-variant/10 dark:border-white/5 flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/10 dark:border-white/5">
              <div className="flex items-center gap-2">
                <div
                  aria-hidden="true"
                  className="w-2 h-2 rounded-full animate-pulse"
                  style={{ backgroundColor: cryptoColor }}
                />
                <h2 id={headingId} className="text-sm font-bold text-on-surface m-0">
                  {t('modal.securePayment', { provider })}
                </h2>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container-high dark:hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                aria-label={t('modal.closeAria', { provider })}
              >
                <X size={18} weight="bold" className="text-secondary" aria-hidden="true" />
              </button>
            </div>

            <iframe
              src={widgetUrl}
              className="flex-1 w-full border-none"
              allow="camera;fullscreen;payment"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals"
              referrerPolicy="no-referrer"
              title={t('modal.iframeTitle', { provider })}
            />

            <div className="px-4 py-2 border-t border-outline-variant/10 dark:border-white/5 flex items-center justify-center gap-2">
              <Lock size={12} weight="bold" className="text-secondary" aria-hidden="true" />
              <span className="text-[10px] text-secondary font-medium">{t('modal.poweredBy', { provider })}</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
