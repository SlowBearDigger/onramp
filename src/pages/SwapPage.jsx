import { useState, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { CircleNotch } from '@phosphor-icons/react'
import ReactiveBlobs from '../components/ReactiveBlobs'
import SwapWidget from '../components/SwapWidget'
import OrderToasts from '../components/OrderToasts'
import { CRYPTOS } from '../config/cryptos'

// HistoryView is the only swap-section view that's heavy enough to warrant
// lazy loading. SwapWidget is the primary view so it stays eager.
const HistoryView = lazy(() => import('../components/HistoryView'))

export default function SwapPage({ view, mode }) {
  const [activeCrypto, setActiveCrypto] = useState(CRYPTOS[0])
  const [warpPhase, setWarpPhase] = useState('idle')
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()
  const transition = reduceMotion ? { duration: 0 } : { duration: 0.2 }
  const initial = reduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }
  const exit = reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 }

  return (
    <>
      <ReactiveBlobs color={activeCrypto.color} className="fixed z-0 hidden md:block" warpPhase={warpPhase} />
      <main className="min-h-screen flex items-center justify-center px-4 py-8 pb-28 sm:py-12 md:pb-12 md:pl-64 relative z-10">
        <div className="w-full max-w-lg">
          {/* AnimatePresence on the VIEW level (ramp form vs history).
              within the ramp form the SwapWidget itself stays mounted
              across mode flips so form state is preserved — only its
              inner labels cross-fade. */}
          <AnimatePresence mode="wait">
            {view === 'ramp' ? (
              <motion.div
                key="ramp"
                initial={initial}
                animate={{ opacity: 1, y: 0 }}
                exit={exit}
                transition={transition}
              >
                <SwapWidget
                  mode={mode}
                  onCryptoChange={setActiveCrypto}
                  onViewHistory={() => navigate('/history')}
                  onWarpChange={setWarpPhase}
                />
              </motion.div>
            ) : (
              <motion.div
                key="history"
                initial={initial}
                animate={{ opacity: 1, y: 0 }}
                exit={exit}
                transition={transition}
              >
                <Suspense fallback={
                  <div role="status" className="flex items-center justify-center py-16 text-secondary">
                    <CircleNotch size={20} weight="bold" className="animate-spin" aria-hidden="true" />
                  </div>
                }>
                  <HistoryView />
                </Suspense>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
      {/* in-app toast layer — listens to useOrders polling output and
          fires a toast whenever an order's status transitions. mounted
          here (not at App level) so it only runs while the user is on
          a swap-section route, where useOrders is already polling. */}
      <OrderToasts />
    </>
  )
}
