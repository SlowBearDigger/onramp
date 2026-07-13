import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  fileURLToPath(new URL('../../sw.js', import.meta.url)),
  'utf8',
)

describe('service worker privacy boundary', () => {
  it('does not retain push notification handlers', () => {
    expect(source).not.toContain("addEventListener('push'")
    expect(source).not.toContain("addEventListener('notificationclick'")
    expect(source).not.toContain('showNotification(')
  })
})
