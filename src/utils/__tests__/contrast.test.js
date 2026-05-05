import { describe, it, expect } from 'vitest'
import { getOnColor } from '../contrast.js'

describe('getOnColor', () => {
  it('returns white text on a dark background (BTC orange — yes, orange counts as dark)', () => {
    // BTC #F7931A — luminance ~0.59 (above threshold), so black actually.
    expect(getOnColor('#F7931A')).toBe('#0a0a0a')
  })

  it('returns black on a clearly light background', () => {
    expect(getOnColor('#FFFFFF')).toBe('#0a0a0a')
    expect(getOnColor('#FFEBEE')).toBe('#0a0a0a') // pale pink
  })

  it('returns white on a clearly dark background', () => {
    expect(getOnColor('#000000')).toBe('#ffffff')
    expect(getOnColor('#1a1a1a')).toBe('#ffffff')
    expect(getOnColor('#627EEA')).toBe('#ffffff') // ETH purple
  })

  it('returns white as a safe default for malformed input', () => {
    expect(getOnColor(null)).toBe('#ffffff')
    expect(getOnColor(undefined)).toBe('#ffffff')
    expect(getOnColor('')).toBe('#ffffff')
    expect(getOnColor('blue')).toBe('#ffffff')
    expect(getOnColor('#FFF')).toBe('#ffffff') // 4-char form not supported
  })

  it('handles real crypto.color values without throwing', () => {
    const samples = ['#F7931A', '#627EEA', '#26A17B', '#9945FF', '#E84142', '#C2A633', '#E6007A', '#8247E5']
    for (const hex of samples) {
      const result = getOnColor(hex)
      expect(['#0a0a0a', '#ffffff']).toContain(result)
    }
  })
})
