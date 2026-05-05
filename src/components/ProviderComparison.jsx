import { motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, CircleNotch, WarningCircle } from '@phosphor-icons/react'
import { MagneticButton, Stagger, StaggerItem } from './Motion'

// presentational comparison cards. parent passes pre-fetched quote state
// per provider; this component just renders. picking a card calls onPick
// with the provider id.
//
// card.state values:
//   'loading'      → spinner; quote in flight
//   'ok'           → real quote received; show numbers + badge
//   'unavailable'  → upstream returned 501/4xx/timeout. card is still
//                    selectable — user can open the widget for live pricing.
export default function ProviderComparison({
  cards,
  cryptoSymbol,
  cryptoColor = '#047857',
  fiatCode = 'USD',
  fiatSymbol = '$',
  onPick,
  onBack,
}) {
  const { t } = useTranslation()
  const headingId = 'provider-comparison-heading'
  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm font-bold text-secondary hover:text-on-surface transition-colors"
        >
          <ArrowLeft size={16} weight="bold" aria-hidden="true" />
          {t('common.back')}
        </button>
        <h2
          id={headingId}
          className="text-xs font-bold uppercase tracking-widest text-secondary m-0"
        >
          {t('compare.heading', { symbol: cryptoSymbol })}
        </h2>
      </div>

      <div role="list" className="space-y-2.5">
        <Stagger stagger={0.07} className="space-y-2.5">
          {cards.map((card) => (
            <StaggerItem key={card.id} role="listitem">
              <ProviderCard
                card={card}
                cryptoSymbol={cryptoSymbol}
                cryptoColor={cryptoColor}
                fiatCode={fiatCode}
                fiatSymbol={fiatSymbol}
                onPick={onPick}
              />
            </StaggerItem>
          ))}
        </Stagger>
      </div>

      <p className="text-[11px] text-secondary text-center px-2 leading-relaxed">
        {t('compare.footnote')}
      </p>
    </section>
  )
}

function ProviderCard({ card, cryptoSymbol, cryptoColor, fiatCode, fiatSymbol, onPick }) {
  const { t } = useTranslation()
  const { id, name, state, cryptoAmount, fee, rateText, badge, unverified } = card

  // build a flat, screen-reader-friendly summary so the button's accessible
  // name doesn't read as a stream of disconnected fragments.
  const accessibleLabel = (() => {
    if (state === 'loading') return t('compare.ariaLabel.loading', { name })
    if (state === 'unavailable') return t('compare.ariaLabel.unavailable', { name })
    const badgeSuffix = badge ? t('compare.ariaLabel.badgeSuffix', { badge: t(`compare.badges.${badge}`).toLowerCase() }) : ''
    const unverifiedSuffix = unverified ? t('compare.ariaLabel.unverifiedSuffix') : ''
    return t('compare.ariaLabel.ok', {
      name,
      amount: cryptoAmount,
      symbol: cryptoSymbol,
      fiatSymbol,
      fee: fmtFee(fee),
      fiatCode,
      badgeSuffix,
      unverifiedSuffix,
    })
  })()

  return (
    <motion.button
      onClick={() => onPick(id)}
      aria-label={accessibleLabel}
      aria-busy={state === 'loading' ? 'true' : undefined}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.99 }}
      className="w-full text-left bg-surface-container-low/60 dark:bg-surface-container-high/30 border border-outline-variant/10 dark:border-white/5 hover:border-primary/30 hover:bg-surface-container-low dark:hover:bg-surface-container-high/50 p-3 sm:p-4 rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <div className="flex items-center justify-between gap-3" aria-hidden="true">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-on-primary text-xs font-bold shrink-0"
            style={{ backgroundColor: cryptoColor }}
          >
            {name.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-on-surface truncate">{name}</span>
              {badge && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">
                  {t(`compare.badges.${badge}`)}
                </span>
              )}
              {unverified && (
                <span
                  title={t('compare.card.unverifiedTitle')}
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-warning/10 text-warning shrink-0 inline-flex items-center gap-1"
                >
                  <WarningCircle size={10} weight="bold" aria-hidden="true" />
                  {t('compare.card.unverifiedBadge')}
                </span>
              )}
            </div>
            <span className="text-[11px] text-secondary truncate">
              {state === 'loading' && t('compare.card.fetching')}
              {state === 'ok' && rateText}
              {state === 'unavailable' && t('compare.card.unavailable')}
            </span>
          </div>
        </div>

        <div className="text-right shrink-0">
          {state === 'loading' && (
            <span className="inline-flex items-center text-secondary">
              <CircleNotch size={16} weight="bold" className="animate-spin" />
            </span>
          )}
          {state === 'ok' && (
            <>
              <div className="text-sm font-bold text-on-surface font-mono">
                {cryptoAmount} {cryptoSymbol}
              </div>
              <div className="text-[11px] text-secondary font-mono">
                {t('compare.card.feeLabel')} {fiatSymbol}{fmtFee(fee)} {fiatCode}
              </div>
            </>
          )}
          {state === 'unavailable' && (
            <span className="text-[11px] text-secondary">—</span>
          )}
        </div>
      </div>
    </motion.button>
  )
}

function fmtFee(fee) {
  if (typeof fee !== 'number') return '0.00'
  return fee.toFixed(2)
}

// helper used by SwapWidget to assign at most one badge per card.
// rules:
//   - cheapest fee → 'lowestFee'
//   - highest crypto received → 'bestRate' (preferred over lowestFee when
//     both could apply, since it's the bigger win for the user)
// only assigned over cards with state === 'ok'. badges are stored as i18n
// keys (rendered via t(`compare.badges.${badge}`)) so they translate.
export function assignBadges(cards) {
  const ok = cards.filter((c) => c.state === 'ok')
  if (ok.length < 2) return cards

  const bestRate = [...ok].sort((a, b) => Number(b.cryptoAmount) - Number(a.cryptoAmount))[0]
  const lowestFee = [...ok].sort((a, b) => Number(a.fee) - Number(b.fee))[0]

  return cards.map((c) => {
    if (c.id === bestRate?.id) return { ...c, badge: 'bestRate' }
    if (c.id === lowestFee?.id && bestRate?.id !== lowestFee?.id) {
      return { ...c, badge: 'lowestFee' }
    }
    return c
  })
}
