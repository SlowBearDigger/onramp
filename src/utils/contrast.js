// pick black or white text for a given hex bg, using sRGB perceptual luminance.
//
// crypto.color values vary widely (some bright like DOGE orange #F7931A, some
// dark like ETH purple #627EEA) — without this, white-on-light combinations
// fail WCAG contrast. used by any UI surface that paints crypto.color as a
// background and overlays text or icons.
//
// luminance constants and threshold are standard WCAG (sRGB → relative luminance,
// then a perceptual midpoint at L≈0.55 picks the right text color in practice).
export function getOnColor(hex) {
  if (typeof hex !== 'string' || !hex.startsWith('#') || hex.length < 7) return '#ffffff'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return lum > 0.55 ? '#0a0a0a' : '#ffffff'
}
