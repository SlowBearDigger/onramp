import { Link, useLocation } from 'react-router-dom'
import { motion } from 'motion/react'
import { CreditCard, ArrowsLeftRight, ClockCounterClockwise, Sun, Moon } from '@phosphor-icons/react'
import { useTheme } from '../context/ThemeContext'

const tabs = [
  { Icon: CreditCard, label: 'Buy', to: '/swap' },
  { Icon: ArrowsLeftRight, label: 'Sell', to: '/swap/sell' },
  { Icon: ClockCounterClockwise, label: 'History', to: '/swap/history' },
]

export default function BottomNav() {
  const location = useLocation()
  const { dark, toggle } = useTheme()
  const isActive = (to) => to === '/swap' ? location.pathname === '/swap' : location.pathname === to

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-surface-container-lowest/90 dark:bg-surface-container-lowest/90 backdrop-blur-md border-t border-outline-variant/10 dark:border-white/5 duration-300"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-center justify-around px-1 py-2">
        {tabs.map((tab) => {
          const active = isActive(tab.to)
          const TabIcon = tab.Icon
          return (
            <Link key={tab.to} to={tab.to} className="flex-1" aria-current={active ? 'page' : undefined}>
              <motion.div
                whileTap={{ scale: 0.9 }}
                className="flex flex-col items-center gap-0.5 py-1.5 rounded-xl relative"
              >
                {active && (
                  <motion.div
                    layoutId="bottom-nav-indicator"
                    className="absolute -top-2 w-8 h-1 rounded-full bg-primary"
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  />
                )}
                <motion.span
                  className={`inline-flex ${active ? 'text-primary' : 'text-secondary'}`}
                  animate={active ? { scale: 1.1 } : { scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300 }}
                >
                  <TabIcon size={22} weight="bold" />
                </motion.span>
                <span className={`text-xs font-semibold ${active ? 'text-primary' : 'text-secondary'}`}>
                  {tab.label}
                </span>
              </motion.div>
            </Link>
          )
        })}

        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="flex flex-col items-center gap-0.5 py-1.5 px-3"
          aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <span className="text-secondary inline-flex">
            {dark ? <Sun size={22} weight="bold" /> : <Moon size={22} weight="bold" />}
          </span>
          <span className="text-xs font-semibold text-secondary">
            Theme
          </span>
        </button>
      </div>
    </nav>
  )
}
