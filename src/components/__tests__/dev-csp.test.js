import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const indexSource = readFileSync(
  fileURLToPath(new URL('../../../index.html', import.meta.url)),
  'utf8',
)
const viteConfigSource = readFileSync(
  fileURLToPath(new URL('../../../vite.config.js', import.meta.url)),
  'utf8',
)

describe('development CSP', () => {
  it('keeps HTTPS upgrades in production and strips them only for Vite serve', () => {
    expect(indexSource).toContain('upgrade-insecure-requests;')
    expect(viteConfigSource).toContain("apply: 'serve'")
    expect(viteConfigSource).toContain("replace(/\\s*upgrade-insecure-requests;/, '')")
  })
})
