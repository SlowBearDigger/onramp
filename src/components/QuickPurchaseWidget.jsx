import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AnimatePresence } from 'motion/react'
import { ArrowSquareOut, ArrowsDownUp, CaretDown } from '@phosphor-icons/react'
import { BlurIn, MagneticButton, motion } from './Motion'
import { CRYPTOS, CryptoIcon } from '../config/cryptos'
import { getOnColor } from '../utils/contrast'

export default function QuickPurchaseWidget({ onCryptoChange }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [crypto, setCrypto] = useState(CRYPTOS[0])
  const [showMenu, setShowMenu] = useState(false)

  const handleSelect = (c) => {
    setCrypto(c)
    setShowMenu(false)
    onCryptoChange?.(c)
  }

  const receiveAmount = (1000 / crypto.rate).toFixed(crypto.rate >= 100 ? 6 : 2)

  return (
    <BlurIn delay={0.3} className="relative z-10 lg:pl-12">
      {/* overflow-visible so the crypto dropdown menu can extend past the
          card bottom; rounded-xl alone clips child borders inside the radius. */}
      <div
        className="bg-surface-container-lowest border border-outline-variant/10 dark:border-white/5 rounded-xl p-5 sm:p-8 max-w-md mx-auto relative duration-300 shadow-md shadow-black/5 dark:shadow-black/30"
      >

        <div className="flex justify-between items-center mb-6 sm:mb-8">
          <h2 className="text-lg sm:text-xl font-bold text-on-surface font-[family-name:var(--font-family-display)] m-0">{t('quickPurchase.title')}</h2>
          <button
            onClick={() => navigate('/swap')}
            className="text-secondary cursor-pointer flex items-center gap-1 hover:text-primary transition-colors"
            aria-label={t('quickPurchase.openFull')}
            title={t('quickPurchase.openFull')}
          >
            <ArrowSquareOut size={18} weight="bold" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-5 sm:space-y-6">
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-bold uppercase tracking-widest text-secondary">{t('quickPurchase.youPay')}</label>
              <span className="text-[10px] uppercase tracking-wider font-bold text-secondary">{t('quickPurchase.exampleHint')}</span>
            </div>
            <motion.div className="bg-surface-container-low dark:bg-surface-container-high/40 p-3 sm:p-4 rounded-lg flex items-center justify-between border border-transparent hover:border-primary/20 transition-colors">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-7 h-7 sm:w-8 sm:h-8 bg-surface-container-lowest dark:bg-surface-container rounded-full flex items-center justify-center">
                  <span aria-hidden="true" className="text-sm font-bold text-secondary font-mono">$</span>
                </div>
                <span className="font-bold text-sm sm:text-base">USD</span>
              </div>
              {/* read-only example value — make it visually distinct from an
                  editable input so users don't try to type. text-secondary +
                  no border treatment signals "this is illustrative". */}
              <span className="text-xl sm:text-2xl font-semibold tracking-tight font-mono text-secondary" aria-hidden="true">1,000.00</span>
            </motion.div>
          </div>

          {/* swap-direction button. quick purchase is buy-only; clicking
              navigates straight to the sell flow so the visual cue (the
              up/down arrow) maps to a real action. */}
          <div className="flex justify-center -my-3 relative z-20">
            <motion.button
              type="button"
              onClick={() => navigate('/swap/sell')}
              aria-label={t('quickPurchase.swapToSell')}
              title={t('quickPurchase.swapToSell')}
              className="w-10 h-10 text-white rounded-full flex items-center justify-center shadow-lg cursor-pointer duration-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              style={{ backgroundColor: crypto.color }}
              whileHover={{ rotate: 180, scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            >
              <ArrowsDownUp size={18} weight="bold" aria-hidden="true" />
            </motion.button>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-secondary block mb-2">{t('quickPurchase.youReceive')}</label>
            <motion.div className="bg-surface-container-low dark:bg-surface-container-high/40 p-3 sm:p-4 rounded-lg flex items-center justify-between border border-transparent hover:border-primary/20 transition-colors">
              <div className="flex items-center gap-2 sm:gap-3 relative">
                <motion.button
                  onClick={() => setShowMenu((v) => !v)}
                  className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                  whileTap={{ scale: 0.95 }}
                >
                  <CryptoIcon symbol={crypto.symbol} size={28} />
                  <span className="font-bold text-sm sm:text-base">{crypto.symbol}</span>
                  <CaretDown size={14} weight="bold" className="text-secondary" />
                </motion.button>

                <AnimatePresence>
                  {showMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className="absolute left-0 top-10 bg-surface-container-lowest dark:bg-surface-container rounded-xl shadow-lg shadow-black/10 dark:shadow-black/40 border border-outline-variant/20 dark:border-white/10 py-2 z-50 min-w-[170px] max-h-[240px] overflow-y-auto"
                    >
                      {CRYPTOS.slice(0, 6).map((c) => (
                        <motion.button
                          key={c.symbol}
                          onClick={() => handleSelect(c)}
                          className={`w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-on-surface/[0.04] dark:hover:bg-on-surface/[0.06] transition-colors ${crypto.symbol === c.symbol ? 'bg-primary/5' : ''}`}
                        >
                          <CryptoIcon symbol={c.symbol} size={22} />
                          <div>
                            <span className={`text-sm font-bold ${crypto.symbol === c.symbol ? 'text-primary' : 'text-on-surface'}`}>{c.symbol}</span>
                            <span className="text-xs text-secondary ml-1.5">{c.label}</span>
                          </div>
                        </motion.button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <motion.span
                key={receiveAmount}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xl sm:text-2xl font-semibold tracking-tight font-mono"
              >
                {receiveAmount}
              </motion.span>
            </motion.div>
          </div>

          <div className="pt-3 sm:pt-4 space-y-3">
            <div className="flex justify-between text-xs sm:text-sm">
              <span className="text-secondary">{t('quickPurchase.rate')}</span>
              <span className="font-medium font-mono">1 {crypto.symbol} = {crypto.rate.toLocaleString()} USD</span>
            </div>
            <div className="flex justify-between text-xs sm:text-sm">
              <span className="text-secondary">{t('quickPurchase.fee')}</span>
              {/* fee text uses the brand primary color (always dark green) for
                  guaranteed contrast on the light card bg, regardless of which
                  crypto is selected. */}
              <span className="font-bold text-primary">{t('quickPurchase.feeValue', { value: '0.00 USD' })}</span>
            </div>
          </div>

          <MagneticButton
            onClick={() => navigate('/swap')}
            className="w-full py-3.5 sm:py-4 rounded-xl font-bold text-base sm:text-lg duration-500 hover:shadow-lg"
            style={{ backgroundColor: crypto.color, color: getOnColor(crypto.color) }}
          >
            {t('quickPurchase.continue')}
          </MagneticButton>
        </div>
      </div>

    </BlurIn>
  )
}
