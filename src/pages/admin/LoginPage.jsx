import { useState, useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Lock, WarningCircle, CircleNotch } from '@phosphor-icons/react'
import { useAdminAuth } from '../../hooks/useAdminAuth'

export default function LoginPage() {
  const { isAuthenticated, login, loading, error } = useAdminAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const location = useLocation()
  const from = location.state?.from || '/admin'

  // already signed in → bounce to dashboard / requested page.
  useEffect(() => { /* effect-friendly placeholder for future side-effects */ }, [isAuthenticated])
  if (isAuthenticated) return <Navigate to={from} replace />

  const onSubmit = async (e) => {
    e.preventDefault()
    if (!username.trim() || !password) return
    await login(username.trim(), password)
  }

  const errorId = 'admin-login-error'

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form
        onSubmit={onSubmit}
        aria-labelledby="admin-login-heading"
        className="w-full max-w-sm bg-surface-container-lowest dark:bg-surface-container border border-outline-variant/15 dark:border-white/5 rounded-2xl p-6 sm:p-8 shadow-md shadow-black/5 dark:shadow-black/40"
      >
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mb-4" aria-hidden="true">
            <Lock size={20} weight="bold" className="text-primary" />
          </div>
          <h1 id="admin-login-heading" className="text-xl font-bold text-on-surface">Admin sign in</h1>
          <p className="text-xs text-secondary mt-1">Analytics access for verified operators only</p>
        </div>

        <label htmlFor="admin-username" className="block text-xs font-bold uppercase tracking-widest text-secondary mb-1.5">
          Username
        </label>
        <input
          id="admin-username"
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className="w-full bg-surface-container-low/80 dark:bg-surface-container-high/40 border border-outline-variant/10 dark:border-white/5 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          required
        />

        <label htmlFor="admin-password" className="block text-xs font-bold uppercase tracking-widest text-secondary mt-4 mb-1.5">
          Password
        </label>
        <input
          id="admin-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className="w-full bg-surface-container-low/80 dark:bg-surface-container-high/40 border border-outline-variant/10 dark:border-white/5 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          required
        />

        {/* live region: announces errors to screen-reader users when they appear */}
        <div
          id={errorId}
          role="alert"
          aria-live="polite"
          className={error ? 'mt-4 flex items-start gap-2 text-xs text-error bg-error/5 border border-error/20 rounded-lg p-2.5' : 'sr-only'}
        >
          {error && (
            <>
              <WarningCircle size={14} weight="bold" className="shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || !username.trim() || !password}
          aria-busy={loading ? 'true' : undefined}
          className="w-full mt-5 bg-primary text-on-primary py-3 rounded-lg font-bold text-sm transition-opacity disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 inline-flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {loading && <CircleNotch size={14} weight="bold" className="animate-spin" aria-hidden="true" />}
          {loading ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="text-[11px] text-secondary mt-4 text-center leading-relaxed">
          Sessions auto-expire after 30 minutes of inactivity.
        </p>
      </form>
    </div>
  )
}
