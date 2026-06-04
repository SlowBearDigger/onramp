import { Link, useLocation } from 'react-router-dom'
import { motion } from 'motion/react'
import { CreditCard, ArrowsLeftRight, ClockCounterClockwise, Sun, Moon, Swap, PaperPlaneTilt } from '@phosphor-icons/react'
import { useTheme } from '../context/ThemeContext'
import { BrandMark } from './BrandLogo'
import { CRYPTOS } from '../config/cryptos'
import { PROVIDER_IDS } from '../providers'

// asymmetric brand-only sidebar.
//
// design intent: drop the wordmark next to the icon (the convergence mark
// is distinctive enough to stand alone in a product chrome), and replace
// the generic "End-to-end encrypted" trust badge with a real, specific
// fact about the product — provider count + supported crypto count, both
// pulled from the registry so they stay accurate as the product grows.

const sidebarLinks = [
  { Icon: CreditCard, label: 'Buy', to: '/buy' },
  { Icon: ArrowsLeftRight, label: 'Sell', to: '/sell' },
  { Icon: Swap, label: 'Swap', to: '/swap' },
  // "Pay" sits after Swap, before History (per product brief). short label
  // to match its siblings; the page itself is titled "Pay recipient".
  { Icon: PaperPlaneTilt, label: 'Pay', to: '/pay' },
  { Icon: ClockCounterClockwise, label: 'History', to: '/history' },
]

function SidebarThemeToggle() {
  const { dark, toggle } = useTheme()

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-3 px-5 py-3 rounded-xl text-secondary hover:text-on-surface hover:bg-surface-container-high/50 transition-colors w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <span className="inline-flex">
        {dark ? <Sun size={18} weight="bold" /> : <Moon size={18} weight="bold" />}
      </span>
      <span className="text-sm font-medium">{dark ? 'Light Mode' : 'Dark Mode'}</span>
    </button>
  )
}

export default function Sidebar() {
  const location = useLocation()

  const isActive = (to) => location.pathname === to

  return (
    <motion.aside
      initial={{ x: -260 }}
      animate={{ x: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
      aria-label="Main navigation"
      className="fixed left-0 top-0 hidden md:flex flex-col w-64 bg-surface-container-lowest/90 dark:bg-surface-container-lowest/90 backdrop-blur-md border-r border-outline-variant/10 dark:border-white/5 h-screen z-40 transition-colors duration-300"
    >
      <div className="p-6 flex flex-col flex-1">
        {/* brand mark only — no wordmark. the convergence icon is distinctive
            enough to identify the product without the redundant "OnRamp"
            wordmark next to it. mark sized up to 48px so it has presence. */}
        <div className="mb-12 pt-2">
          <Link
            to="/"
            className="inline-flex items-center group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-lg"
            aria-label="OnRamp — home"
          >
            <BrandMark size={48} variant="solid" />
          </Link>
        </div>

        <nav className="space-y-1 flex-grow">
          {sidebarLinks.map((link, i) => {
            const active = isActive(link.to)
            const LinkIcon = link.Icon
            return (
              <motion.div
                key={link.label}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.08, duration: 0.4 }}
              >
                <Link
                  to={link.to}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-4 px-5 py-3.5 rounded-xl relative transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                    active
                      ? 'bg-primary/8 text-primary font-semibold'
                      : 'text-secondary hover:text-on-surface hover:bg-surface-container-high/50'
                  }`}
                >
                  {/* left-edge indicator — animates between active items */}
                  {active && (
                    <motion.div
                      layoutId="sidebar-indicator"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-full bg-primary"
                      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                    />
                  )}
                  <span className="inline-flex">
                    <LinkIcon size={18} weight="bold" />
                  </span>
                  <span className="text-sm font-medium">{link.label}</span>
                </Link>
              </motion.div>
            )
          })}
        </nav>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.5 }}
          className="pt-4 border-t border-outline-variant/10 dark:border-white/5 space-y-1"
        >
          <SidebarThemeToggle />
          {/* concrete product stats — replaces the generic "end-to-end
              encrypted" claim. specific numbers pulled from the provider
              registry + crypto config, so they stay accurate without manual
              edits when the product grows. mono font matches the trader-
              terminal vibe of the rest of the data UI. */}
          <div
            className="flex items-center justify-between px-5 py-2 text-secondary"
            title={`${PROVIDER_IDS.length} on-ramp providers · ${CRYPTOS.length} supported cryptocurrencies`}
          >
            <span className="text-[10px] uppercase tracking-[0.18em] font-mono">
              {PROVIDER_IDS.length} providers
            </span>
            <span aria-hidden="true" className="text-secondary/40">·</span>
            <span className="text-[10px] uppercase tracking-[0.18em] font-mono">
              {CRYPTOS.length} cryptos
            </span>
          </div>
        </motion.div>
      </div>
    </motion.aside>
  )
}
