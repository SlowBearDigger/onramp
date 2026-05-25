import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'motion/react'
import { ClockCounterClockwise, CircleNotch, Info, ArrowSquareOut, ShieldWarning, Bell, BellSlash } from '@phosphor-icons/react'
import { BlurIn, Stagger, StaggerItem, HoverCard, MagneticButton } from './Motion'
import { CryptoIcon } from '../config/cryptos'
import { formatDate } from '../data/mockData'
import { useOrders, readLastWallet } from '../hooks/useOrders'
import { usePushNotifications } from '../hooks/usePushNotifications'
import { explorerUrlFor, shortHash } from '../utils/explorer'

// filters use stable internal ids; the visible label comes from i18n.
const FILTER_IDS = ['all', 'buy', 'sell']

// status visual style — label is now translated via t('history.status.<key>').
const statusStyles = {
  completed: { bg: 'bg-success/10', text: 'text-success', key: 'completed' },
  pending:   { bg: 'bg-tertiary/10', text: 'text-tertiary', key: 'pending' },
  failed:    { bg: 'bg-error/10', text: 'text-error', key: 'failed' },
}

// "Updated Xs ago" label that re-renders every 10s without re-fetching.
function useRelativeAge(ts) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!ts) return
    const id = setInterval(() => setNow(Date.now()), 10_000)
    return () => clearInterval(id)
  }, [ts])
  if (!ts) return null
  const seconds = Math.max(0, Math.floor((now - ts) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return `${hours}h`
}

export default function HistoryView() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [filter, setFilter] = useState('all')
  const [expandedId, setExpandedId] = useState(null)
  const { orders, state, lastFetchedAt, isPolling, refresh } = useOrders()
  const age = useRelativeAge(lastFetchedAt)
  const wallet = readLastWallet()
  const push = usePushNotifications({ customerId: wallet })

  const filtered = filter === 'all'
    ? orders
    : orders.filter((tx) => tx.type === filter)

  const isMockData = state === 'mock'
  const isError = state === 'error'

  return (
    <BlurIn delay={0.1}>
      <div className="max-w-lg w-full mx-auto">
        <div className="mb-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-xl sm:text-2xl font-bold text-on-surface mb-1 font-[family-name:var(--font-family-display)]">{t('history.title')}</h2>
            {/* polling indicator + last-updated label. clicking the label
                triggers an immediate refresh — useful when the user wants to
                check for an update before the next 5s tick. */}
            {!isMockData && lastFetchedAt && (
              <button
                type="button"
                onClick={refresh}
                disabled={state === 'loading'}
                className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-secondary/80 hover:text-on-surface transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
                aria-label={t('history.live.refresh')}
                title={t('history.live.refresh')}
              >
                <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                  {isPolling && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
                  )}
                  <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${isPolling ? 'bg-primary' : 'bg-secondary/40'}`} />
                </span>
                {isPolling
                  ? t('history.live.checking')
                  : t('history.live.lastUpdated', { age: age || '0s' })}
              </button>
            )}
          </div>
          <p className="text-sm text-secondary">
            {t('history.count', { count: orders.length })}
            {isMockData && <span className="ml-2 text-[10px] uppercase tracking-wider font-bold text-tertiary">· {t('history.demoBadge')}</span>}
            {isError && <span className="ml-2 text-[10px] uppercase tracking-wider font-bold text-error">· {t('history.errorBadge')}</span>}
          </p>

          {/* push notifications status — every state renders something
              actionable so the user always understands what's happening. */}
          {push.state === 'unsubscribed' && wallet && (
            <button
              type="button"
              onClick={push.subscribe}
              className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 text-primary text-xs font-bold hover:bg-primary/15 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <Bell size={14} weight="bold" aria-hidden="true" />
              {t('push.enable', { defaultValue: 'Enable order notifications' })}
            </button>
          )}
          {push.state === 'subscribed' && (
            <button
              type="button"
              onClick={push.unsubscribe}
              className="mt-3 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-success hover:text-on-surface transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
              title={t('push.disableTooltip', { defaultValue: 'Click to disable' })}
            >
              <Bell size={11} weight="bold" aria-hidden="true" />
              {t('push.active', { defaultValue: 'Notifications on · click to disable' })}
            </button>
          )}
          {push.state === 'denied' && (
            <p className="mt-3 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-secondary">
              <BellSlash size={11} weight="bold" aria-hidden="true" />
              {t('push.denied', { defaultValue: 'Notifications blocked — re-allow in browser settings' })}
            </p>
          )}
          {push.state === 'ios-needs-pwa' && (
            <div className="mt-3 inline-flex items-start gap-2 px-3 py-2 rounded-lg bg-tertiary/10 text-tertiary text-[11px] leading-snug max-w-sm">
              <Bell size={13} weight="bold" aria-hidden="true" className="shrink-0 mt-0.5" />
              <span>
                {t('push.iosNeedsPwa', { defaultValue: 'On iPhone, tap the Share icon → "Add to Home Screen", then open the installed app to enable notifications.' })}
              </span>
            </div>
          )}
          {push.state === 'unsupported' && (
            <p className="mt-3 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-secondary">
              <BellSlash size={11} weight="bold" aria-hidden="true" />
              {t('push.unsupported', { defaultValue: 'This browser does not support push notifications' })}
            </p>
          )}
          {push.state === 'error' && (
            <div className="mt-3 inline-flex items-start gap-2 max-w-sm">
              <button
                type="button"
                onClick={push.subscribe}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-error/10 text-error text-xs font-bold hover:bg-error/15 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                title={push.error?.message}
              >
                <Bell size={14} weight="bold" aria-hidden="true" />
                {t('push.retry', { defaultValue: 'Retry · enable notifications' })}
              </button>
            </div>
          )}
          {push.state === 'error' && push.error?.message && (
            <p className="mt-1.5 text-[11px] text-error/80 leading-snug max-w-sm">{push.error.message}</p>
          )}
        </div>

        {/* filter chips */}
        <div className="flex gap-2 mb-6" role="group" aria-label={t('history.title')}>
          {FILTER_IDS.map((f) => (
            <motion.button
              key={f}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              whileTap={{ scale: 0.96 }}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                filter === f
                  ? 'bg-primary text-on-primary shadow-md'
                  : 'bg-surface-container-low dark:bg-surface-container-high/30 text-secondary hover:text-on-surface hover:bg-surface-container-high dark:hover:bg-surface-container-high/50'
              }`}
            >
              {t(`history.filters.${f}`)}
            </motion.button>
          ))}
        </div>

        {/* loading state — first fetch only, before any orders are in. */}
        {state === 'loading' && orders.length === 0 && (
          <div role="status" aria-live="polite" className="flex items-center justify-center py-16 text-secondary">
            <CircleNotch size={20} weight="bold" className="animate-spin mr-2" aria-hidden="true" />
            {t('history.loading')}
          </div>
        )}

        {/* empty state — ready, no rows, not an error. covers two cases:
              1. user is logged out / hasn't bought anything yet,
              2. user with stored wallet has no transactions on file.
            polish: animated halo on the icon to feel less static, a
            secondary CTA that adapts to context (try swap when 'all',
            show all when filtered), and a footnote linking the privacy
            disclosure so the "your history isn't synced anywhere" angle
            is reinforced exactly where the user expects to see it. */}
        {state === 'ready' && filtered.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="text-center py-12 sm:py-16 px-4"
          >
            <div className="relative inline-flex items-center justify-center w-16 h-16 mb-4" aria-hidden="true">
              {/* halo — gentle breathing pulse to draw the eye without
                  being distracting. respects prefers-reduced-motion via
                  motion's automatic handling. */}
              <motion.span
                className="absolute inset-0 rounded-2xl bg-primary/15"
                animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0.2, 0.6] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              />
              <span className="relative inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 text-primary">
                <ClockCounterClockwise size={28} weight="regular" />
              </span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-on-surface mb-1.5 font-[family-name:var(--font-family-display)]">
              {filter === 'all'
                ? t('history.emptyAllTitle')
                : t('history.emptyFilteredTitle', { filter: t(`history.filters.${filter}`).toLowerCase() })}
            </h3>
            <p className="text-sm text-secondary leading-relaxed max-w-xs mx-auto mb-6">
              {filter === 'all'
                ? t('history.emptyAllDesc')
                : t('history.emptyFilteredDesc', { filter: t(`history.filters.${filter}`).toLowerCase() })}
            </p>
            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-center max-w-xs sm:max-w-none mx-auto">
              <MagneticButton
                onClick={() => navigate(filter === 'sell' ? '/sell' : '/buy')}
                className="inline-flex items-center justify-center gap-1.5 bg-primary text-on-primary px-5 py-2.5 rounded-lg font-bold text-sm hover:opacity-90 transition-opacity"
              >
                {t('history.emptyCta')}
              </MagneticButton>
              {filter === 'all' ? (
                <button
                  type="button"
                  onClick={() => navigate('/swap')}
                  className="inline-flex items-center justify-center gap-1.5 text-primary hover:bg-primary/10 px-4 py-2.5 rounded-lg font-bold text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  {t('history.emptyTrySwap', { defaultValue: 'Try a swap' })}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setFilter('all')}
                  className="inline-flex items-center justify-center gap-1.5 text-primary hover:bg-primary/10 px-4 py-2.5 rounded-lg font-bold text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  {t('history.emptyShowAll', { defaultValue: 'Show all transactions' })}
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* transaction list */}
        <Stagger stagger={0.05} className="space-y-3">
          {filtered.map((tx) => {
            const status = statusStyles[tx.status]
            const isExpanded = expandedId === tx.id

            return (
              <StaggerItem key={tx.id}>
                <HoverCard
                  className="bg-surface-container-lowest dark:bg-surface-container border border-outline-variant/10 dark:border-white/5 rounded-xl p-4 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : tx.id)}
                >
                  <div className="flex items-center gap-3">
                    <CryptoIcon symbol={tx.symbol} size={36} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-on-surface">{tx.symbol}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${tx.type === 'buy' ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}>
                          {t(`history.type.${tx.type}`)}
                        </span>
                        {tx.unverified && (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-warning/10 text-warning"
                            title={t('history.unverified.tooltip')}
                          >
                            <ShieldWarning size={11} weight="bold" aria-hidden="true" />
                            {t('history.unverified.label')}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-secondary">{formatDate(tx.date)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-on-surface font-mono">{tx.amountCrypto} {tx.symbol}</p>
                      <p className="text-xs text-secondary font-mono">${tx.amountUsd.toLocaleString()}</p>
                    </div>
                    <div className={`px-2.5 py-1 rounded-full text-xs font-bold ${status.bg} ${status.text} shrink-0 hidden sm:block`}>
                      {t(`history.status.${status.key}`)}
                    </div>
                  </div>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-4 pt-4 border-t border-outline-variant/10 dark:border-white/5 space-y-2.5">
                          <div className="flex justify-between items-baseline text-xs gap-3">
                            <span className="text-secondary shrink-0">{t('history.detail.status')}</span>
                            <span className="text-right">
                              <span className={`font-bold ${status.text}`}>{t(`history.status.${status.key}`)}</span>
                              {/* granular sub-status pulled from the raw provider state.
                                  shows what's actually happening behind the scenes —
                                  "Awaiting your payment" vs "Provider processing" vs
                                  "Crypto sent on-chain", etc. */}
                              {tx.detailKey && tx.detailKey !== status.key && (
                                <span className="block text-[10px] text-secondary mt-0.5">
                                  {t(`history.status.detail.${tx.detailKey}`, { defaultValue: tx.rawStatus })}
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs gap-3">
                            <span className="text-secondary shrink-0">{t('history.detail.wallet')}</span>
                            <span className="font-mono text-on-surface truncate">{tx.wallet}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-secondary">{t('history.detail.provider')}</span>
                            <span className="font-bold text-on-surface">{tx.provider}</span>
                          </div>
                          {tx.network && (
                            <div className="flex justify-between text-xs">
                              <span className="text-secondary">{t('history.detail.network')}</span>
                              <span className="font-mono text-on-surface text-[11px] uppercase tracking-wider">{tx.network}</span>
                            </div>
                          )}
                          {tx.txHash && (() => {
                            const url = explorerUrlFor(tx.network, tx.txHash)
                            return (
                              <div className="flex justify-between items-center text-xs gap-3">
                                <span className="text-secondary shrink-0">{t('history.detail.txHash')}</span>
                                {url ? (
                                  <a
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="font-mono text-primary hover:underline inline-flex items-center gap-1 truncate"
                                  >
                                    {shortHash(tx.txHash)}
                                    <ArrowSquareOut size={11} weight="bold" aria-hidden="true" className="shrink-0" />
                                  </a>
                                ) : (
                                  <span className="font-mono text-secondary truncate">{shortHash(tx.txHash)}</span>
                                )}
                              </div>
                            )
                          })()}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </HoverCard>
              </StaggerItem>
            )
          })}
        </Stagger>

        {/* localStorage transparency footnote — only show when there are
            rows to clarify, OR also when empty if you want to set
            expectation up-front. only when populated keeps the empty
            state cleanest. */}
        {filtered.length > 0 && (
          <div className="mt-6 flex items-start gap-2 text-[11px] text-secondary/80 leading-relaxed px-1">
            <Info size={12} weight="bold" className="shrink-0 mt-0.5" aria-hidden="true" />
            <p>{t('history.localStorageNotice')}</p>
          </div>
        )}
      </div>
    </BlurIn>
  )
}
