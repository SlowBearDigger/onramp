import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const appSource = readFileSync(
  fileURLToPath(new URL('../app.js', import.meta.url)),
  'utf8',
)
const dbSource = readFileSync(
  fileURLToPath(new URL('../db.js', import.meta.url)),
  'utf8',
)

describe('public order API boundary', () => {
  it('does not expose an order from its provider id alone', () => {
    expect(appSource).not.toContain("app.get('/api/orders/:id'")
  })

  it('uses opaque access ids in a POST body for History', () => {
    expect(appSource).toContain("app.post('/api/orders/history', apiLimiter")
    expect(appSource).not.toContain("app.get('/api/orders'")
    expect(appSource).not.toContain("app.get('/api/profile/orders'")
  })

  it('never returns raw provider payloads from History', () => {
    expect(dbSource).toContain('listOrdersByAccessIds')
    expect(dbSource).not.toContain('SELECT * FROM orders')
    expect(dbSource).not.toMatch(/HISTORY_COLUMNS[\s\S]*raw_payload/)
  })

  it('does not expose wallet-bound push subscription routes', () => {
    expect(appSource).not.toContain('/api/push/subscribe')
    expect(appSource).not.toContain('/api/push/unsubscribe')
  })
})

describe('network listener boundary', () => {
  it('defaults to localhost and allows an explicit host override', () => {
    expect(appSource).toContain("const HOST = process.env.HOST || '127.0.0.1'")
    expect(appSource).toContain('app.listen(PORT, HOST')
    expect(appSource).not.toContain("app.listen(PORT, '0.0.0.0'")
  })
})
