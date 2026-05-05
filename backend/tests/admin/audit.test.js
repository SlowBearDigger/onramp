import { describe, it, expect, beforeEach, beforeAll } from 'vitest'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

// give db.js a fresh sqlite file per test run so we don't pollute the dev
// database. set BEFORE importing db.js / audit.js — they read DB_PATH at
// module load time.
beforeAll(() => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-test-'))
  process.env.DB_PATH = path.join(tmpDir, 'test.db')
})

let logAuditEvent, listAuditEvents, countAuditEvents, ipFromRequest, userAgentFromRequest, vacuumAudit, db

beforeAll(async () => {
  const auditMod = await import('../../admin/audit.js')
  logAuditEvent = auditMod.logAuditEvent
  listAuditEvents = auditMod.listAuditEvents
  countAuditEvents = auditMod.countAuditEvents
  ipFromRequest = auditMod.ipFromRequest
  userAgentFromRequest = auditMod.userAgentFromRequest
  vacuumAudit = auditMod.vacuumAudit
  const dbMod = await import('../../db.js')
  db = dbMod.db
})

beforeEach(() => {
  // clear the table between tests for deterministic ordering / counts.
  db.exec('DELETE FROM admin_audit')
})

describe('logAuditEvent', () => {
  it('inserts a known action and reads it back', () => {
    logAuditEvent('login.success', { username: 'admin', ip: '127.0.0.1', userAgent: 'curl/8' })
    const events = listAuditEvents({ limit: 10 })
    expect(events.length).toBe(1)
    expect(events[0].action).toBe('login.success')
    expect(events[0].username).toBe('admin')
    expect(events[0].ip).toBe('127.0.0.1')
    expect(events[0].user_agent).toBe('curl/8')
  })

  it('refuses to insert unknown action names (defense against typos)', () => {
    logAuditEvent('login.maybesuccess', { username: 'x' })
    expect(countAuditEvents()).toBe(0)
  })

  it('serializes detail to JSON', () => {
    logAuditEvent('csv.export', {
      username: 'admin',
      detail: { from: '2026-01-01', to: '2026-02-01', rows: 42 },
    })
    const [row] = listAuditEvents()
    expect(row.detail).toBe(JSON.stringify({ from: '2026-01-01', to: '2026-02-01', rows: 42 }))
  })

  it('clips oversized fields so a malicious user-agent cannot fill the table', () => {
    logAuditEvent('login.failure', {
      username: 'a'.repeat(500),
      userAgent: 'b'.repeat(5000),
      ip: 'c'.repeat(500),
    })
    const [row] = listAuditEvents()
    expect(row.username.length).toBe(96)
    expect(row.user_agent.length).toBe(256)
    expect(row.ip.length).toBe(64)
  })

  it('clips oversized JSON detail', () => {
    logAuditEvent('csv.export', {
      detail: { junk: 'x'.repeat(5000) },
    })
    const [row] = listAuditEvents()
    expect(row.detail.length).toBe(2048)
  })

  it('accepts every documented action name', () => {
    const actions = ['login.success', 'login.failure', 'logout', 'logout.idle', 'csv.export']
    for (const a of actions) logAuditEvent(a, {})
    expect(countAuditEvents()).toBe(actions.length)
  })

  it('does NOT throw if storage fails — auditing must never block a real action', () => {
    // simulate a broken statement by deliberately mis-using the API: passing
    // a value we KNOW will trip a constraint. there's no NOT NULL on action
    // (it's allowed to be missing? no — NOT NULL is set). use action=null.
    expect(() => logAuditEvent(null, { username: 'x' })).not.toThrow()
    expect(countAuditEvents()).toBe(0)
  })
})

describe('listAuditEvents', () => {
  beforeEach(() => {
    // seed in chronological order so we can assert sort.
    for (let i = 0; i < 5; i++) {
      logAuditEvent('login.success', { username: `u${i}` })
    }
  })

  it('returns newest first', () => {
    const events = listAuditEvents({ limit: 5 })
    expect(events[0].username).toBe('u4')
    expect(events[4].username).toBe('u0')
  })

  it('respects limit', () => {
    expect(listAuditEvents({ limit: 2 }).length).toBe(2)
  })

  it('respects offset', () => {
    const all = listAuditEvents({ limit: 5 })
    const offset = listAuditEvents({ limit: 2, offset: 2 })
    expect(offset).toEqual(all.slice(2, 4))
  })

  it('clamps insane limits', () => {
    expect(listAuditEvents({ limit: 100_000 }).length).toBeLessThanOrEqual(200)
    expect(listAuditEvents({ limit: -5 }).length).toBeGreaterThanOrEqual(0)
  })
})

describe('vacuumAudit', () => {
  it('trims older rows beyond the keep limit', () => {
    for (let i = 0; i < 25; i++) logAuditEvent('login.success', { username: `u${i}` })
    expect(countAuditEvents()).toBe(25)
    const removed = vacuumAudit({ keep: 15 })
    expect(removed).toBe(10)
    expect(countAuditEvents()).toBe(15)
    // newest 15 retained, oldest 10 dropped
    const remaining = listAuditEvents()
    expect(remaining[0].username).toBe('u24')
    expect(remaining[14].username).toBe('u10')
  })

  it('refuses to keep fewer than the floor (10), preventing accidental wipes from keep:0', () => {
    for (let i = 0; i < 25; i++) logAuditEvent('login.success', {})
    vacuumAudit({ keep: 0 })
    expect(countAuditEvents()).toBe(10)
  })
})

describe('ipFromRequest / userAgentFromRequest', () => {
  it('reads req.ip when set', () => {
    expect(ipFromRequest({ ip: '203.0.113.7' })).toBe('203.0.113.7')
  })

  it('falls back to socket.remoteAddress', () => {
    expect(ipFromRequest({ socket: { remoteAddress: '::1' } })).toBe('::1')
  })

  it('returns null when both are missing', () => {
    expect(ipFromRequest({})).toBeNull()
    expect(ipFromRequest(null)).toBeNull()
  })

  it('reads user-agent header (lowercased key)', () => {
    expect(userAgentFromRequest({ headers: { 'user-agent': 'Mozilla/5.0' } })).toBe('Mozilla/5.0')
  })

  it('clips long IPs and user-agents', () => {
    expect(ipFromRequest({ ip: 'x'.repeat(500) }).length).toBe(64)
    expect(userAgentFromRequest({ headers: { 'user-agent': 'y'.repeat(2000) } }).length).toBe(256)
  })
})
