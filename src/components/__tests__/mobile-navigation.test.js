import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  fileURLToPath(new URL('../BottomNav.jsx', import.meta.url)),
  'utf8',
)

describe('mobile primary navigation', () => {
  it('keeps Pay behind its approval flag without removing Swap', () => {
    expect(source).toContain('PAY_ENABLED ?')
    expect(source).toContain("to: '/pay'")
    expect(source).toContain("to: '/swap'")
  })

  it('keeps Settings as an accessible compact control', () => {
    expect(source).toContain('aria-label={t(\'settings.label\')}')
    expect(source).toContain('className="w-12 shrink-0 relative"')
  })
})
