import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'motion/react'
import { CaretDown, Globe } from '@phosphor-icons/react'
import { SUPPORTED_LANGUAGES } from '../i18n'

// language picker. dropdown with the 4 supported locales.
//
// the active language is read from i18n (which detects from localStorage
// then browser navigator). selecting a new one persists via i18next's
// LanguageDetector cache and updates <html lang> via the listener in
// src/i18n/index.js.
//
// no flag emojis: they render inconsistently across platforms (apple
// glossy vs google flat vs windows blocky) and the polychrome look
// clashes with the rest of the monochrome trader-terminal chrome. we
// use the iso code in jetbrains mono instead — flat, consistent, and
// matches the data-ui aesthetic.

export default function LanguageSwitcher({ compact = false }) {
  const { i18n, t } = useTranslation()
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef(null)

  const current = SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language?.slice(0, 2)) ||
                  SUPPORTED_LANGUAGES[0]

  // close on outside click and on ESC.
  useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const select = (code) => {
    i18n.changeLanguage(code)
    setOpen(false)
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${t('language.label')} (${current.code.toUpperCase()})`}
        className={`flex items-center gap-1.5 rounded-lg hover:bg-surface-container-high dark:hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
          compact ? 'w-9 h-9 justify-center' : 'px-2.5 py-1.5'
        }`}
      >
        {compact ? (
          <Globe size={18} weight="bold" className="text-secondary" aria-hidden="true" />
        ) : (
          <>
            <Globe size={14} weight="bold" className="text-secondary" aria-hidden="true" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] font-mono">{current.code}</span>
            <CaretDown size={12} weight="bold" className="text-secondary" aria-hidden="true" />
          </>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            role="listbox"
            aria-label={t('language.label')}
            className="absolute right-0 top-full mt-1 bg-surface-container-lowest dark:bg-surface-container rounded-xl shadow-lg shadow-black/10 dark:shadow-black/40 border border-outline-variant/20 dark:border-white/10 py-1.5 z-50 min-w-[160px] list-none m-0"
          >
            {SUPPORTED_LANGUAGES.map((l) => {
              const active = l.code === current.code
              return (
                <li key={l.code}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => select(l.code)}
                    className={`w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-surface-container-low dark:hover:bg-surface-container-high/50 transition-colors ${
                      active ? 'bg-primary/5 text-primary' : 'text-on-surface'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`text-[10px] font-semibold uppercase tracking-[0.14em] font-mono w-6 ${
                        active ? 'text-primary' : 'text-secondary'
                      }`}
                    >
                      {l.code}
                    </span>
                    <span className="text-sm font-medium">{l.label}</span>
                    {active && (
                      <span aria-hidden="true" className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
                    )}
                  </button>
                </li>
              )
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}
