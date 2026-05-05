import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { useAdminAuth } from '../../hooks/useAdminAuth'
import { BrandMark } from '../../components/BrandLogo'

// admin shell. renders OUTSIDE the public Header/Sidebar so the
// dashboard has its own minimal chrome.
//
// auth gating: if no session, redirect to /admin/login while preserving
// the requested path so we can bounce back after a successful login.
export default function AdminLayout() {
  const { isAuthenticated, session, logout } = useAdminAuth()
  const location = useLocation()

  if (!isAuthenticated && location.pathname !== '/admin/login') {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />
  }

  return (
    <div className="min-h-screen bg-surface text-on-surface flex flex-col">
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[60] focus:bg-white focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg focus:text-primary focus:font-bold"
      >
        Skip to dashboard
      </a>
      {isAuthenticated && (
        <header className="border-b border-outline-variant/15 dark:border-white/5 px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandMark size={32} variant="subtle" />
            <div className="flex flex-col">
              <span className="text-sm font-bold">Admin</span>
              <span className="text-[10px] text-secondary uppercase tracking-wider">On-Ramp Analytics</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-secondary hidden sm:inline">
              Signed in as <span className="font-bold text-on-surface">{session?.username}</span>
            </span>
            <button
              onClick={logout}
              className="text-xs font-bold px-3 py-1.5 rounded-lg bg-surface-container-low dark:bg-surface-container-high/40 hover:bg-surface-container-high dark:hover:bg-surface-container-high transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              Sign out
            </button>
          </div>
        </header>
      )}
      <main id="admin-main" className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
