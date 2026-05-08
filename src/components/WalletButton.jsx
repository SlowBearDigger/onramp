import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'motion/react'
import { Wallet, CaretDown, Copy, SignOut, CheckCircle } from '@phosphor-icons/react'
import { useWallet, shortAddress } from '../hooks/useWallet'
// importing WalletProvider triggers createAppKit() exactly once. importing
// it FROM HERE means the heavy wallet bundle only loads when this lazy
// component first renders — never on the initial page load.
import '../wallet/WalletProvider'

// Connect Wallet button + connected-state dropdown.
//
// states:
//   - not configured (REOWN_PROJECT_ID env var empty): disabled button
//     with tooltip pointing at the env var. happens in dev before the
//     ID is registered.
//   - disconnected: primary-colored "Connect Wallet" button. click →
//     Reown modal opens with MetaMask, WalletConnect QR, Phantom, etc.
//   - connecting: loading spinner inside button. Reown manages this
//     state internally; we just show the button as pressed.
//   - connected: shows shortAddress (0x1234…abcd) + caret. click →
//     dropdown with copy address / disconnect.
//
// renders the same component on desktop + mobile. responsive sizing
// inside the button itself (md:px-4 vs px-3, etc.).

export default function WalletButton() {
  const { t } = useTranslation()
  const { isConfigured, isConnected, address, open, disconnect } = useWallet()
  const [menuOpen, setMenuOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const wrapRef = useRef(null)

  // close dropdown on outside click + ESC.
  useEffect(() => {
    if (!menuOpen) return
    const onClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setMenuOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  // copy address with a 2s "copied" confirmation.
  const handleCopy = async () => {
    if (!address) return
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked (insecure context, permissions) — silent fail */
    }
  }

  // not configured: render a disabled button so the slot in the header
  // doesn't shift when REOWN_PROJECT_ID is added later.
  if (!isConfigured) {
    return (
      <button
        type="button"
        disabled
        className="inline-flex items-center gap-1.5 px-3 py-2 sm:py-2.5 rounded-lg font-semibold text-xs sm:text-sm text-secondary bg-surface-container-low/50 dark:bg-surface-container-high/30 cursor-not-allowed opacity-60"
        title="Set VITE_REOWN_PROJECT_ID to enable wallet connect"
        aria-label={t('wallet.disabled', { defaultValue: 'Wallet disabled — config missing' })}
      >
        <Wallet size={14} weight="bold" aria-hidden="true" />
        <span className="hidden sm:inline">{t('wallet.connect', { defaultValue: 'Connect Wallet' })}</span>
      </button>
    )
  }

  if (!isConnected) {
    return (
      <button
        type="button"
        onClick={open}
        className="inline-flex items-center gap-1.5 bg-primary text-on-primary px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg font-semibold text-xs sm:text-sm transition-colors hover:bg-primary/90 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <Wallet size={14} weight="bold" aria-hidden="true" />
        <span>{t('wallet.connect', { defaultValue: 'Connect' })}</span>
      </button>
    )
  }

  // connected
  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={t('wallet.menuLabel', { defaultValue: 'Wallet menu', address })}
        className="inline-flex items-center gap-1.5 sm:gap-2 bg-surface-container-low dark:bg-surface-container-high/40 text-on-surface px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg font-mono text-xs sm:text-sm hover:bg-surface-container-high dark:hover:bg-surface-container-high/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <span className="w-2 h-2 rounded-full bg-success" aria-hidden="true" />
        <span>{shortAddress(address)}</span>
        <CaretDown size={11} weight="bold" className="text-secondary" aria-hidden="true" />
      </button>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-1 bg-surface-container-lowest dark:bg-surface-container rounded-xl shadow-lg shadow-black/10 dark:shadow-black/40 border border-outline-variant/20 dark:border-white/10 py-1.5 z-50 min-w-[200px]"
          >
            <div className="px-3 py-2 border-b border-outline-variant/15 dark:border-white/5">
              <div className="text-[10px] uppercase tracking-wider font-bold text-secondary">
                {t('wallet.connectedAs', { defaultValue: 'Connected wallet' })}
              </div>
              <div className="text-xs font-mono text-on-surface mt-0.5 break-all">
                {address}
              </div>
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={handleCopy}
              className="w-full text-left px-3 py-2 flex items-center gap-2 text-sm hover:bg-surface-container-low dark:hover:bg-surface-container-high/50 transition-colors"
            >
              {copied
                ? <CheckCircle size={14} weight="bold" className="text-success" aria-hidden="true" />
                : <Copy size={14} weight="bold" className="text-secondary" aria-hidden="true" />}
              <span>{copied ? t('wallet.copied', { defaultValue: 'Copied!' }) : t('wallet.copyAddress', { defaultValue: 'Copy address' })}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => { disconnect(); setMenuOpen(false) }}
              className="w-full text-left px-3 py-2 flex items-center gap-2 text-sm text-error hover:bg-error/5 dark:hover:bg-error/10 transition-colors"
            >
              <SignOut size={14} weight="bold" aria-hidden="true" />
              <span>{t('wallet.disconnect', { defaultValue: 'Disconnect' })}</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
