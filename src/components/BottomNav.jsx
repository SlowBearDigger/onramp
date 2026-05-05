import { useState, useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'motion/react'
import { CreditCard, ArrowsLeftRight, ClockCounterClockwise, Sun, Moon, Globe } from '@phosphor-icons/react'
import { useTheme } from '../context/ThemeContext'
import { SUPPORTED_LANGUAGES } from '../i18n'

// mobile bottom nav. three primary tabs (Buy/Sell/History) get icon+label
// like before; theme + language are compact icon-only utilities on the
// right so the bar stays balanced. all labels are i18n'd.
//
// perf notes for ios:
//   - dropped backdrop-blur-md → backdrop-blur (4px) — md is 12px which
//     hits a known safari rasterizer bottleneck on iphone 11/12 minis.
//   - removed the layoutId animation in favor of a static positioned
//     indicator. layout animations recalculate paint geometry every
//     frame which compounds with the blur cost.
export default function BottomNav() {
  const location = useLocation()
  const { t, i18n } = useTranslation()
  const { dark, toggle } = useTheme()
  const [langOpen, setLangOpen] = useState(false)
  const langWrapRef = useRef(null)

  const tabs = [
    { Icon: CreditCard, label: t('swap.tabs.buy'), to: '/swap' },
    { Icon: ArrowsLeftRight, label: t('swap.tabs.sell'), to: '/swap/sell' },
    { Icon: ClockCounterClockwise, label: t('history.title'), to: '/swap/history', shortLabel: 'History' },
  ]

  const isActive = (to) => to === '/swap' ? location.pathname === '/swap' : location.pathname === to
  const currentLang = SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language?.slice(0, 2)) || SUPPORTED_LANGUAGES[0]

  useEffect(() => {
    if (!langOpen) return
    const onClick = (e) => {
      if (langWrapRef.current && !langWrapRef.current.contains(e.target)) setLangOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setLangOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [langOpen])

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-surface-container-lowest/95 dark:bg-surface-container-lowest/95 backdrop-blur border-t border-outline-variant/10 dark:border-white/5"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/* layout: 3 primary tabs (icon + label) on the left, then a thin
          divider, then 2 utility buttons (icon-only) on the right. tabs
          flex-1 to fill available width; utilities are fixed-width so the
          bar stays balanced even when a label like "History" wraps in
          another locale. */}
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

        {/* divider — visually separates primary nav from utility actions.
            very subtle; just a 1px line with opacity. */}
        <div aria-hidden="true" className="self-center mx-1 h-7 w-px bg-outline-variant/20 dark:bg-white/10" />

        {/* utilities — icon-only. compact (40px each) so the 3 tabs keep
            most of the bar real estate. tap target is still 44px+ thanks
            to the py-3 padding. */}
        <div ref={langWrapRef} className="relative shrink-0">
          <button
            onClick={() => setLangOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={langOpen}
            aria-label={`${t('language.label')} (${currentLang.code.toUpperCase()})`}
            className="relative flex items-center justify-center w-10 h-12 rounded-xl"
          >
            <Globe size={22} weight="bold" className="text-secondary" />
            {/* iso code as a tiny chip on the icon corner — much more
                compact than a stacked label, and identifies the active
                language at a glance. */}
            <span
              aria-hidden="true"
              className="absolute -bottom-0.5 -right-0.5 text-[9px] font-bold uppercase tracking-wider font-mono text-primary bg-surface-container-lowest dark:bg-surface-container px-1 rounded leading-tight"
            >
              {currentLang.code}
            </span>
          </button>
          <AnimatePresence>
            {langOpen && (
              <motion.ul
                initial={{ opacity: 0, y: 6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.97 }}
                transition={{ duration: 0.15 }}
                role="listbox"
                aria-label={t('language.label')}
                className="absolute right-0 bottom-full mb-2 bg-surface-container-lowest dark:bg-surface-container rounded-xl shadow-lg shadow-black/20 dark:shadow-black/50 border border-outline-variant/20 dark:border-white/10 py-1.5 z-50 min-w-[150px] list-none m-0"
              >
                {SUPPORTED_LANGUAGES.map((l) => {
                  const active = l.code === currentLang.code
                  return (
                    <li key={l.code}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => { i18n.changeLanguage(l.code); setLangOpen(false) }}
                        className={`w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-surface-container-low dark:hover:bg-surface-container-high/50 transition-colors ${active ? 'bg-primary/5' : ''}`}
                      >
                        <span className={`text-[10px] font-bold uppercase tracking-wider font-mono w-6 ${active ? 'text-primary' : 'text-secondary'}`}>{l.code}</span>
                        <span className={`text-sm font-medium ${active ? 'text-primary' : 'text-on-surface'}`}>{l.label}</span>
                      </button>
                    </li>
                  )
                })}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>

        <button
          onClick={toggle}
          className="flex items-center justify-center w-10 h-12 rounded-xl shrink-0"
          aria-label={dark ? t('common.switchToLight') : t('common.switchToDark')}
        >
          {dark
            ? <Sun size={22} weight="bold" className="text-secondary" />
            : <Moon size={22} weight="bold" className="text-secondary" />}
        </button>
      </div>
    </nav>
  )
}
