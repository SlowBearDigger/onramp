import { describe, expect, it } from 'vitest'
import { resolveApiBase } from '../api'

describe('API base configuration', () => {
  it('uses localhost only in development', () => {
    expect(resolveApiBase('', 'http://localhost:3001')).toBe('http://localhost:3001')
    expect(resolveApiBase('')).toBe('/api')
  })

  it('normalizes an explicitly configured production origin', () => {
    expect(resolveApiBase(' https://api.onoff.finance/ ')).toBe('https://api.onoff.finance')
  })
})
