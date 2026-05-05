import { useState, useEffect, useCallback, useRef } from 'react'

// admin auth state. holds the JWT in memory + localStorage. enforces a
// 30-minute idle auto-logout (the backend JWT itself is valid 60 minutes
// — the idle-timer is the stricter bound and matches the PDF's
// "auto-logout after inactivity" requirement).

const TOKEN_KEY = 'offramp:admin:token'
const EXPIRES_KEY = 'offramp:admin:expiresAt'
const USERNAME_KEY = 'offramp:admin:username'
const IDLE_TIMEOUT_MS = 30 * 60 * 1000

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

function readStored() {
  try {
    const token = localStorage.getItem(TOKEN_KEY)
    const expiresAt = Number(localStorage.getItem(EXPIRES_KEY))
    const username = localStorage.getItem(USERNAME_KEY) || ''
    if (!token || !Number.isFinite(expiresAt)) return null
    if (Date.now() / 1000 >= expiresAt) return null
    return { token, expiresAt, username }
  } catch {
    return null
  }
}

function writeStored(session) {
  try {
    localStorage.setItem(TOKEN_KEY, session.token)
    localStorage.setItem(EXPIRES_KEY, String(session.expiresAt))
    if (session.username) localStorage.setItem(USERNAME_KEY, session.username)
  } catch { /* storage disabled */ }
}

function clearStored() {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(EXPIRES_KEY)
    localStorage.removeItem(USERNAME_KEY)
  } catch { /* ignore */ }
}

export function useAdminAuth() {
  const [session, setSession] = useState(() => readStored())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const idleTimerRef = useRef(null)

  // best-effort POST so the audit log gets a logout entry. fire-and-forget —
  // if the network is dead, the client still discards its token. reason
  // distinguishes explicit logouts from idle-timer logouts in the audit log.
  const notifyLogout = useCallback((token, reason) => {
    if (!token) return
    try {
      fetch(`${API_BASE}/api/admin/logout`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ reason }),
        keepalive: true,
      }).catch(() => { /* swallow — best effort */ })
    } catch { /* network or fetch unavailable */ }
  }, [])

  const logout = useCallback((reason = 'explicit') => {
    setSession((current) => {
      if (current?.token) notifyLogout(current.token, reason)
      return null
    })
    clearStored()
    setError(null)
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }
  }, [notifyLogout])

  // idle auto-logout. resets on any user activity while logged in.
  useEffect(() => {
    if (!session) return
    const reset = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
      idleTimerRef.current = setTimeout(() => {
        // eslint-disable-next-line no-console
        console.info('[admin] idle timeout — logging out')
        logout('idle')
      }, IDLE_TIMEOUT_MS)
    }
    reset()
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }))
    return () => {
      events.forEach((e) => window.removeEventListener(e, reset))
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    }
  }, [session, logout])

  // hard auto-logout when JWT expires.
  useEffect(() => {
    if (!session) return
    const msUntilExpiry = session.expiresAt * 1000 - Date.now()
    if (msUntilExpiry <= 0) {
      logout()
      return
    }
    const t = setTimeout(logout, msUntilExpiry)
    return () => clearTimeout(t)
  }, [session, logout])

  const login = useCallback(async (username, password) => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`${API_BASE}/api/admin/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (r.status === 401) {
        setError('Invalid username or password')
        return false
      }
      if (r.status === 503) {
        setError('Admin dashboard is not configured on the server')
        return false
      }
      if (r.status === 429) {
        setError('Too many attempts. Please wait a minute and try again.')
        return false
      }
      if (!r.ok) {
        setError(`Login failed (HTTP ${r.status})`)
        return false
      }
      const body = await r.json()
      const next = { token: body.token, expiresAt: body.expiresAt, username }
      writeStored(next)
      setSession(next)
      return true
    } catch (err) {
      setError(`Network error: ${err?.message || 'unknown'}`)
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  // authenticated fetch helper. attaches the Bearer token; logs out if the
  // server reports an invalid/expired token.
  const authFetch = useCallback(async (path, opts = {}) => {
    if (!session) throw new Error('not authenticated')
    const r = await fetch(`${API_BASE}${path}`, {
      ...opts,
      headers: {
        ...(opts.headers || {}),
        authorization: `Bearer ${session.token}`,
      },
    })
    if (r.status === 401) {
      logout()
    }
    return r
  }, [session, logout])

  return {
    session,
    isAuthenticated: Boolean(session),
    loading,
    error,
    login,
    logout,
    authFetch,
  }
}
