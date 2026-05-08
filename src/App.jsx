import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AnimatePresence } from 'motion/react'
import { CircleNotch } from '@phosphor-icons/react'
import { ThemeProvider } from './context/ThemeContext'
import ErrorBoundary from './components/ErrorBoundary'
import Header from './components/Header'
import PageTransition from './components/PageTransition'
import PrivacyDisclosure from './components/PrivacyDisclosure'
import LandingPage from './pages/LandingPage'
import NotFoundPage from './pages/NotFoundPage'

// route-level code splitting. landing stays eager because it's the entry
// point — every other route is lazy. each lazy chunk loads in parallel with
// the user's first interaction, so navigations feel instant on a warm cache.
//
// admin chunks are also fenced behind their own bundle so the landing payload
// never ships scrypt / jose verification code.
const SwapPage = lazy(() => import('./pages/SwapPage'))
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'))
const TermsPage = lazy(() => import('./pages/TermsPage'))
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'))
const AdminLoginPage = lazy(() => import('./pages/admin/LoginPage'))
const AdminDashboardPage = lazy(() => import('./pages/admin/DashboardPage'))

// minimal centered spinner for Suspense fallback. role=status announces
// "Loading…" to screen readers without spamming on every navigation.
function RouteFallback() {
  const { t } = useTranslation()
  return (
    <div
      role="status"
      aria-live="polite"
      className="min-h-[60vh] flex items-center justify-center text-secondary"
    >
      <CircleNotch size={20} weight="bold" className="animate-spin mr-2" aria-hidden="true" />
      <span>{t('common.loading')}</span>
    </div>
  )
}

// the "ramp app" surface (Buy/Sell/History) shares the same SwapPage
// container so form state survives route flips. these three paths group
// under the same pageKey so AnimatePresence treats the whole surface
// as one page (cross-fade only on entering/leaving the ramp app, not on
// /buy ↔ /sell ↔ /history within it).
const RAMP_PATHS = ['/buy', '/sell', '/history']
const isRampPath = (p) => RAMP_PATHS.some((r) => p === r || p.startsWith(r + '/'))

function AnimatedRoutes() {
  const location = useLocation()
  const pageKey = isRampPath(location.pathname)
    ? '/ramp'
    : location.pathname.startsWith('/admin')
      ? '/admin'
      : location.pathname
  const isRamp = isRampPath(location.pathname)
  const isAdmin = location.pathname.startsWith('/admin')

  // admin routes mount their own AdminLayout — no public Header/PageTransition.
  if (isAdmin) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Routes location={location}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboardPage />} />
            <Route path="login" element={<AdminLoginPage />} />
          </Route>
        </Routes>
      </Suspense>
    )
  }

  return (
    <>
      {!isRamp && <Header />}
      <AnimatePresence mode="wait">
        <PageTransition key={pageKey}>
          <Suspense fallback={<RouteFallback />}>
            <Routes location={location}>
              <Route path="/" element={<LandingPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/terms" element={<TermsPage />} />
              {/* ramp app surface (fiat ↔ crypto via Transak/MtPelerin/Topper).
                  three sibling routes share SwapPage as their container so
                  form state and the live ticker survive flips. */}
              <Route path="/buy" element={<SwapPage />} />
              <Route path="/sell" element={<SwapPage />} />
              <Route path="/history" element={<SwapPage />} />
              {/* legacy redirects — old /swap/* paths used to host buy/sell/
                  history. external links (push notifications, customer
                  support) may still target them. drop these once the
                  /swap route is reclaimed by SwapKit and stable for a
                  full notification TTL window (~30 days). */}
              <Route path="/swap" element={<Navigate to="/buy" replace />} />
              <Route path="/swap/sell" element={<Navigate to="/sell" replace />} />
              <Route path="/swap/history" element={<Navigate to="/history" replace />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </PageTransition>
      </AnimatePresence>
      {/* GDPR disclosure — public surface only. admin has its own login
          gate so a banner there would be redundant noise. /privacy is also
          excluded so the banner doesn't appear on top of the policy itself. */}
      {location.pathname !== '/privacy' && <PrivacyDisclosure />}
    </>
  )
}

function SkipToContent() {
  const { t } = useTranslation()
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[60] focus:bg-white focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg focus:text-primary focus:font-bold"
    >
      {t('skipLink.main')}
    </a>
  )
}

// router basename = vite's BASE_URL minus the trailing slash. vite injects
// `import.meta.env.BASE_URL` based on the `base` config (which itself reads
// the BASE_PATH env var at build time). this lets the same code deploy under
// /ramp/, /onramp/, /, or any other prefix without recompiling react-router.
const ROUTER_BASENAME = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '/'

export default function App() {
  return (
    // top-level error boundary catches any uncaught render error and shows
    // a recoverable fallback instead of leaving the user with a blank page.
    <ErrorBoundary>
      <BrowserRouter basename={ROUTER_BASENAME}>
        <ThemeProvider>
          <div className="bg-surface text-on-surface antialiased min-h-screen transition-colors duration-300">
            <SkipToContent />
            {/* skip-to-content target. each page route owns its own <main>
                landmark (LandingPage, SwapPage, AdminLayout, etc.) so we
                don't double up — having two <main>s per page is invalid
                html and breaks screen-reader navigation. */}
            <div id="main-content">
              <AnimatedRoutes />
            </div>
          </div>
        </ThemeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
