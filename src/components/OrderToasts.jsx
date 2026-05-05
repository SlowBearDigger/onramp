import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'motion/react'
import { CheckCircle, CircleNotch, WarningCircle, X, ShieldWarning } from '@phosphor-icons/react'
import { useOrders } from '../hooks/useOrders'

// in-app order status toasts.
//
// listens to useOrders' polling output and fires a toast whenever an
// order's rawStatus transitions. complements OS-level web push (which
// fires when the app is closed) by giving immediate visual feedback
// while the user has the app open. no permission needed.
//
// transitions we surface (most-noisy → least):
//   AWAITING_PAYMENT_FROM_USER → PAYMENT_DONE_MARKED_BY_USER
//   PAYMENT_DONE_MARKED_BY_USER → PROCESSING
//   PROCESSING → COMPLETED  (or FAILED / EXPIRED / CANCELLED / REFUNDED)
//
// also fires on first appearance of an order if its status is already
// in a "interesting" state (PROCESSING, COMPLETED, FAILED) — covers the
// case where the user navigates to /swap/history with a fresh wallet
// that already had orders queued.

const SUCCESS_STATUSES = new Set(['COMPLETED'])
const FAILURE_STATUSES = new Set(['FAILED', 'EXPIRED', 'CANCELLED', 'REFUNDED'])
const PROGRESS_STATUSES = new Set([
  'AWAITING_PAYMENT_FROM_USER',
  'PAYMENT_DONE_MARKED_BY_USER',
  'PROCESSING',
  'PAYMENT_SUBMITTED_UNVERIFIED',
])

function variantFor(status) {
  if (SUCCESS_STATUSES.has(status)) return 'success'
  if (FAILURE_STATUSES.has(status)) return 'error'
  if (status === 'PAYMENT_SUBMITTED_UNVERIFIED' || status === 'CREATED_UNVERIFIED') return 'unverified'
  return 'progress'
}

const variantStyles = {
  success: 'bg-success/10 text-success border-success/30',
  error: 'bg-error/10 text-error border-error/30',
  unverified: 'bg-warning/10 text-warning border-warning/30',
  progress: 'bg-primary/10 text-primary border-primary/30',
}

const variantIcons = {
  success: CheckCircle,
  error: WarningCircle,
  unverified: ShieldWarning,
  progress: CircleNotch,
}

export default function OrderToasts() {
  const { t } = useTranslation()
  const { orders } = useOrders()
  const [toasts, setToasts] = useState([])
  // map orderId → last seen rawStatus, to detect transitions
  const previousRef = useRef(new Map())
  // skip emitting for the FIRST poll (the initial fetch). otherwise every
  // existing in-flight order on page load would spam toasts.
  const seededRef = useRef(false)

  useEffect(() => {
    const previous = previousRef.current

    if (!seededRef.current) {
      // first observed snapshot — record statuses without emitting toasts.
      orders.forEach((o) => previous.set(o.id, o.rawStatus))
      seededRef.current = true
      return
    }

    const newToasts = []
    orders.forEach((o) => {
      const prev = previous.get(o.id)
      if (prev === o.rawStatus) return
      previous.set(o.id, o.rawStatus)

      // skip transitions to "uninteresting" states. AWAITING_PAYMENT is the
      // initial state and emitting a toast for it on every order would be
      // noise — users already see the widget when they're paying.
      if (o.rawStatus === 'AWAITING_PAYMENT_FROM_USER' && prev) {
        return // a transition INTO awaiting_payment from somewhere else is unusual; skip
      }

      // build the toast
      const variant = variantFor(o.rawStatus)
      const i18nKey = `history.status.detail.${o.detailKey}`
      newToasts.push({
        id: `${o.id}-${o.rawStatus}-${Date.now()}`,
        orderId: o.id,
        symbol: o.symbol,
        amountCrypto: o.amountCrypto,
        message: t(i18nKey, { defaultValue: o.rawStatus }),
        variant,
        provider: o.provider,
      })
    })

    if (newToasts.length === 0) return
    setToasts((current) => [...current, ...newToasts])

    // auto-dismiss each new toast after 6s. failure toasts stay 10s
    // because they're more important and may need to be read carefully.
    const timers = newToasts.map((toast) => {
      const dur = toast.variant === 'error' ? 10_000 : 6_000
      return setTimeout(() => {
        setToasts((current) => current.filter((existing) => existing.id !== toast.id))
      }, dur)
    })
    return () => timers.forEach(clearTimeout)
  }, [orders, t])

  const dismiss = (id) => setToasts((current) => current.filter((t) => t.id !== id))

  return (
    <div
      aria-live="polite"
      aria-label={t('orderToasts.regionLabel', { defaultValue: 'Order updates' })}
      // bottom-positioned but ABOVE the bottom nav on mobile (which is z-50);
      // we sit at z-60. desktop has no bottom nav so the spacing is irrelevant.
      className="fixed left-3 right-3 sm:left-auto sm:right-4 sm:max-w-sm z-[60] flex flex-col gap-2 pointer-events-none"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5rem)' }}
    >
      <AnimatePresence>
        {toasts.map((toast) => {
          const Icon = variantIcons[toast.variant]
          const cls = variantStyles[toast.variant]
          return (
            <motion.div
              key={toast.id}
              role="status"
              initial={{ opacity: 0, y: 30, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.96, transition: { duration: 0.18 } }}
              transition={{ type: 'spring', stiffness: 350, damping: 28 }}
              className={`pointer-events-auto bg-surface-container-lowest dark:bg-surface-container border rounded-xl shadow-lg shadow-black/10 dark:shadow-black/40 px-4 py-3 flex items-start gap-3 ${cls}`}
            >
              <span className={`inline-flex shrink-0 mt-0.5 ${toast.variant === 'progress' ? 'animate-spin' : ''}`}>
                <Icon size={20} weight="bold" aria-hidden="true" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold leading-tight">
                  {toast.amountCrypto} {toast.symbol} · {toast.provider}
                </p>
                <p className="text-xs text-secondary mt-0.5 leading-snug">
                  {toast.message}
                </p>
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label={t('orderToasts.dismiss', { defaultValue: 'Dismiss' })}
                className="text-secondary hover:text-on-surface transition-colors p-0.5 -m-0.5 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
              >
                <X size={14} weight="bold" aria-hidden="true" />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
