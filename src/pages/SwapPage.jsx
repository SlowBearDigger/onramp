import { useState, lazy, Suspense } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { CircleNotch } from '@phosphor-icons/react'
import Sidebar from '../components/Sidebar'
import BottomNav from '../components/BottomNav'
import ReactiveBlobs from '../components/ReactiveBlobs'
import SwapWidget from '../components/SwapWidget'
import OrderToasts from '../components/OrderToasts'
import { CRYPTOS } from '../config/cryptos'

// HistoryView is the only swap-section view that's heavy enough to warrant
// lazy loading. SwapWidget is the primary view so it stays eager.
const HistoryView = lazy(() => import('../components/HistoryView'))

// derive `view` and `mode` from the current pathname. keeping this pure
// makes the routing decision testable and predictable — no nested route
// elements to chase, no Outlet context to thread.
function deriveSwapState(pathname) {
  if (pathname.endsWith('/history')) return { view: 'history', mode: 'buy' }
  if (pathname.endsWith('/sell')) return { view: 'swap', mode: 'sell' }
  return { view: 'swap', mode: 'buy' }
}

export default function SwapPage() {
  const [activeCrypto, setActiveCrypto] = useState(CRYPTOS[0])
  const [warpPhase, setWarpPhase] = useState('idle')
  const navigate = useNavigate()
  const location = useLocation()
  const { view, mode } = deriveSwapState(location.pathname)

  return (
    <div className="min-h-screen transition-colors duration-300 relative">
      <ReactiveBlobs color={activeCrypto.color} className="fixed z-0 hidden md:block" warpPhase={warpPhase} />
      <Sidebar />
      <main className="min-h-screen flex items-center justify-center px-4 py-8 pb-28 sm:py-12 md:pb-12 md:pl-64 relative z-10">
        <div className="w-full max-w-lg">
          {/* AnimatePresence on the VIEW level (swap vs history). within the
              swap view the SwapWidget itself stays mounted across mode flips
              so form state is preserved — only its inner labels cross-fade. */}
          <AnimatePresence mode="wait">
            {view === 'swap' ? (
              <motion.div
                key="swap"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <SwapWidget
                  mode={mode}
                  onCryptoChange={setActiveCrypto}
                  onViewHistory={() => navigate('/swap/history')}
                  onWarpChange={setWarpPhase}
                />
              </motion.div>
            ) : (
              <motion.div
                key="history"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
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
      <BottomNav />
      {/* in-app toast layer — listens to useOrders polling output and
          fires a toast whenever an order's status transitions. mounted
          here (not at App level) so it only runs while the user is on
          a swap-section route, where useOrders is already polling. */}
      <OrderToasts />
    </div>
  )
}
