import { useLocation, useOutlet } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import OnboardingTour from './OnboardingTour'

export function getAppContentKey(pathname) {
  if (pathname === '/buy' || pathname === '/sell' || pathname === '/history') return '/ramp'
  if (pathname === '/swap') return '/swap'
  if (pathname === '/pay') return '/pay'
  return pathname
}

export default function AppShell() {
  const location = useLocation()
  const outlet = useOutlet()
  const reduceMotion = useReducedMotion()
  const contentKey = getAppContentKey(location.pathname)

  const transition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.2, ease: [0.16, 1, 0.3, 1] }

  return (
    <div className="min-h-screen transition-colors duration-300 relative">
      <Sidebar />
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={contentKey}
          initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
          transition={transition}
        >
          {outlet}
        </motion.div>
      </AnimatePresence>
      <BottomNav />
      <OnboardingTour />
    </div>
  )
}
