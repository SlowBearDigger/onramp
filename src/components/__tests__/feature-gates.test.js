import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const features = readFileSync(
  fileURLToPath(new URL('../../config/features.js', import.meta.url)),
  'utf8',
)
const app = readFileSync(
  fileURLToPath(new URL('../../App.jsx', import.meta.url)),
  'utf8',
)

describe('unapproved production features', () => {
  it('requires an explicit build flag for Pay', () => {
    expect(features).toContain("VITE_ENABLE_PAY === 'true'")
    expect(app).toContain("const PayRecipientPage = import.meta.env.VITE_ENABLE_PAY === 'true'")
    expect(app).toContain('PAY_ENABLED ? <PayRecipientPage />')
  })
})
