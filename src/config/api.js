export function resolveApiBase(configured, fallback = '/api') {
  const value = typeof configured === 'string' ? configured.trim() : ''
  const base = value || fallback
  return base.replace(/\/+$/, '')
}

export const API_BASE = resolveApiBase(
  import.meta.env.VITE_API_BASE_URL,
  import.meta.env.DEV ? 'http://localhost:3001' : '/api',
)
