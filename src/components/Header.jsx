import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'motion/react'
import { Sun, Moon, ArrowUpRight } from '@phosphor-icons/react'
import { useTheme } from '../context/ThemeContext'
import LanguageSwitcher from './LanguageSwitcher'
import { BrandLogo } from './BrandLogo'

// asymmetric header.
//
// design intent: drop the standard "logo / nav center / cta right" layout.
// the marketing nav (Features / Rates / Support) was anchor-link padding —
// the page is short enough to scroll, those links were duplicating their
// targets. removing them tightens the brand and stops the AI-template feel.
//
// composition now: brand left + small "aggregator" subtitle, utilities
// flush right (lang switcher, theme toggle, CTA with arrow). no centered
// nav, no hamburger menu, no mobile drawer — the public surface only has
// landing + legal, and the swap product has its own BottomNav for navigation.
function ThemeToggle() {
  const { dark, toggle } = useTheme()
  const { t } = useTranslation()

  return (
    <button
      onClick={toggle}
      className="relative w-9 h-9 rounded-full flex items-center justify-center hover:bg-surface-container-high dark:hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      aria-label={dark ? t('common.switchToLight') : t('common.switchToDark')}
    >
      <AnimatePresence mode="wait">
        {dark ? (
          <motion.span
            key="light"
            className="text-tertiary inline-flex"
            initial={{ rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: 90, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Sun size={20} weight="bold" />
          </motion.span>
        ) : (
          <motion.span
            key="dark"
            className="text-secondary inline-flex"
            initial={{ rotate: 90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: -90, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Moon size={20} weight="bold" />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  )
}

export default function Header() {
  const { t } = useTranslation()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className={`fixed top-0 w-full z-50 antialiased tracking-tight duration-300 ${
        scrolled
          ? 'bg-surface-container-lowest/90 dark:bg-surface-container-lowest/90 backdrop-blur-md shadow-sm dark:shadow-none dark:border-b dark:border-outline-variant/10'
          : 'bg-surface-container-lowest/80 dark:bg-surface-container-lowest/80 backdrop-blur-md shadow-sm dark:shadow-none'
      }`}
    >
      <div className="flex justify-between items-center px-4 sm:px-6 py-3.5 max-w-7xl mx-auto gap-3">
        <div className="flex items-baseline gap-2 sm:gap-3 min-w-0">
          <BrandLogo />
          {/* subtitle that defines the product. small mono = tool feel. hidden
              on the smallest screens so the brand stays compact on phones. */}
          <span
            aria-hidden="true"
            className="hidden sm:inline-block text-[10px] uppercase tracking-[0.18em] text-secondary font-mono pl-3 border-l border-outline-variant/40 dark:border-white/10"
          >
            {t('header.subtitle')}
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <LanguageSwitcher />
          <ThemeToggle />

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, type: 'spring', stiffness: 200 }}
          >
            <Link
              to="/swap"
              className="inline-flex items-center gap-1 bg-primary text-on-primary pl-4 pr-3 py-2 sm:py-2.5 rounded-lg font-semibold text-xs sm:text-sm transition-all hover:bg-primary/90 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 group"
            >
              <span>{t('header.openApp')}</span>
              <ArrowUpRight
                size={14}
                weight="bold"
                aria-hidden="true"
                className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              />
            </Link>
          </motion.div>
        </div>
      </div>
    </motion.nav>
  )
}
