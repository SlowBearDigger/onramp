import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (relativePath) => readFileSync(
  fileURLToPath(new URL(relativePath, import.meta.url)),
  'utf8',
)

describe('admin authentication state boundary', () => {
  it('provides one auth state around every nested admin route', () => {
    const appSource = read('../../App.jsx')
    expect(appSource).toContain("import { AdminAuthProvider } from './hooks/useAdminAuth'")
    expect(appSource).toContain('<AdminAuthProvider>')
    expect(appSource).toContain('</AdminAuthProvider>')
  })

  it('requires consumers to read the shared context', () => {
    const hookSource = read('../useAdminAuth.js')
    expect(hookSource).toContain('createContext')
    expect(hookSource).toContain('useContext(AdminAuthContext)')
  })
})
