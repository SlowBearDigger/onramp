import { useState, useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'motion/react'
import { CreditCard, ArrowsLeftRight, ClockCounterClockwise, Sun, Moon, Gear, Swap } from '@phosphor-icons/react'
import { useTheme } from '../context/ThemeContext'
import { SUPPORTED_LANGUAGES } from '../i18n'

// mobile bottom nav.
//
// layout: five equal-width columns. four primary tabs
// (Buy/Sell/Swap/History) + one Settings button. settings opens a
// popover with theme + language inside, keeping the bar focused on
// navigation. five flex columns means the bar stays symmetrical even
// when the labels' translated lengths vary across locales.
//
// perf notes for ios:
//   - backdrop-blur-sm (4px) instead of md (12px). md hits a known
//     safari rasterizer bottleneck on iphone 11/12 minis.
//   - static positioned active indicator (no layoutId) — layout
//     animations re-measure paint geometry every frame.
export default function BottomNav() {
  const location = useLocation()
  const { t, i18n } = useTranslation()
  const { dark, toggle } = useTheme()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsWrapRef = useRef(null)

  const tabs = [
    { Icon: CreditCard, label: t('swap.tabs.buy'), to: '/buy' },
    { Icon: ArrowsLeftRight, label: t('swap.tabs.sell'), to: '/sell' },
    { Icon: Swap, label: t('swap.tabs.swap', { defaultValue: 'Swap' }), to: '/swap' },
    { Icon: ClockCounterClockwise, label: t('history.title'), to: '/history', shortLabel: 'History' },
  ]

  const isActive = (to) => location.pathname === to
  const currentLang = SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language?.slice(0, 2)) || SUPPORTED_LANGUAGES[0]

  useEffect(() => {
    if (!settingsOpen) return
    const onClick = (e) => {
      if (settingsWrapRef.current && !settingsWrapRef.current.contains(e.target)) setSettingsOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setSettingsOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [settingsOpen])

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-surface-container-lowest/95 dark:bg-surface-container-lowest/95 backdrop-blur border-t border-outline-variant/10 dark:border-white/5"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-stretch px-2 py-1.5">
        {tabs.map((tab) => {
          const active = isActive(tab.to)
          const TabIcon = tab.Icon
          const label = tab.shortLabel || tab.label
          return (
            <Link key={tab.to} to={tab.to} className="flex-1 min-w-0" aria-current={active ? 'page' : undefined}>
              <div className="flex flex-col items-center gap-0.5 py-1.5 rounded-xl relative">
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-1.5 w-7 h-0.5 rounded-full bg-primary"
                  />
                )}
                <span className={`inline-flex ${active ? 'text-primary' : 'text-secondary'}`}>
                  <TabIcon size={22} weight="bold" />
                </span>
                <span className={`text-[11px] font-semibold truncate max-w-full px-1 ${active ? 'text-primary' : 'text-secondary'}`}>
                  {label}
                </span>
              </div>
            </Link>
          )
        })}

        {/* settings — fourth equal-width column. opens a popover with
            theme + language. stays as a tab visually (icon + label) so
            the bar reads as a uniform 4-column grid. */}
        <div ref={settingsWrapRef} className="flex-1 min-w-0 relative">
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            aria-haspopup="dialog"
            aria-expanded={settingsOpen}
            aria-label={t('settings.label')}
            className="w-full"
          >
            <div className="flex flex-col items-center gap-0.5 py-1.5 rounded-xl">
              <span className={`inline-flex ${settingsOpen ? 'text-primary' : 'text-secondary'}`}>
                <Gear size={22} weight="bold" />
              </span>
              <span className={`text-[11px] font-semibold truncate max-w-full px-1 ${settingsOpen ? 'text-primary' : 'text-secondary'}`}>
                {t('settings.label')}
              </span>
            </div>
          </button>

          <AnimatePresence>
            {settingsOpen && (
              <motion.div
                role="dialog"
                aria-label={t('settings.label')}
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.16 }}
                className="absolute right-0 bottom-full mb-2 bg-surface-container-lowest dark:bg-surface-container rounded-2xl shadow-xl shadow-black/20 dark:shadow-black/50 border border-outline-variant/20 dark:border-white/10 z-50 w-[min(calc(100vw-1.5rem),18rem)] overflow-hidden"
              >
                {/* theme row — segmented toggle */}
                <div className="px-4 py-3.5">
                  <div className="flex items-baseline justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-secondary">{t('settings.theme')}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 bg-surface-container-low dark:bg-surface-container-high/40 rounded-xl p-1">
                    <button
                      type="button"
                      onClick={() => { if (dark) toggle() }}
                      aria-pressed={!dark}
                      className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-colors ${!dark ? 'bg-surface-container-lowest text-primary shadow-sm' : 'text-secondary hover:text-on-surface'}`}
                    >
                      <Sun size={14} weight="bold" aria-hidden="true" />
                      {t('settings.light')}
                    </button>
                    <button
                      type="button"
                      onClick={() => { if (!dark) toggle() }}
                      aria-pressed={dark}
                      className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-colors ${dark ? 'bg-surface-container text-primary shadow-sm' : 'text-secondary hover:text-on-surface'}`}
                    >
                      <Moon size={14} weight="bold" aria-hidden="true" />
                      {t('settings.dark')}
                    </button>
                  </div>
                </div>

                {/* divider */}
                <div className="h-px bg-outline-variant/15 dark:bg-white/5" aria-hidden="true" />

                {/* language row */}
                <div className="px-4 py-3.5">
                  <div className="flex items-baseline justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-secondary">{t('settings.language')}</span>
                  </div>
                  <ul role="listbox" aria-label={t('language.label')} className="space-y-0.5 list-none m-0 p-0">
                    {SUPPORTED_LANGUAGES.map((l) => {
                      const active = l.code === currentLang.code
                      return (
                        <li key={l.code}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={active}
                            onClick={() => { i18n.changeLanguage(l.code); setSettingsOpen(false) }}
                            className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 transition-colors ${active ? 'bg-primary/8 text-primary' : 'text-on-surface hover:bg-surface-container-low dark:hover:bg-surface-container-high/30'}`}
                          >
                            <span className={`text-[10px] font-bold uppercase tracking-wider font-mono w-6 ${active ? 'text-primary' : 'text-secondary'}`}>{l.code}</span>
                            <span className="text-sm font-medium">{l.label}</span>
                            {active && <span aria-hidden="true" className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </nav>
  )
}
