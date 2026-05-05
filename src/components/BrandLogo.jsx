import { Link } from 'react-router-dom'

// brand identity for OnRamp.
//
// design: "convergence" — 3 strokes feeding from the left into a single
// disc on the right. metaphor for the aggregator (3 providers → 1
// destination wallet). single-color via currentColor so it inherits the
// surrounding text color and works on light/dark themes.
//
// usage:
//   <BrandMark size={32} />                  → just the icon, primary on subtle bg
//   <BrandMark size={32} variant="solid" />  → white icon on primary bg
//   <BrandLogo />                            → icon + "OnRamp" wordmark, links to /
//
// the SVG itself is also exported as <BrandGlyph /> for use in raw contexts
// (e.g. inside a button without the surrounding chrome).

export function BrandGlyph({ size = 32, className = '', strokeWidth = 3, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {/* 3 converging strokes — each represents a provider feeding into the destination */}
      <g stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" fill="none">
        <line x1="3" y1="6" x2="14" y2="13" />
        <line x1="3" y1="16" x2="14" y2="16" />
        <line x1="3" y1="26" x2="14" y2="19" />
      </g>
      {/* destination disc */}
      <circle cx="22" cy="16" r="7.5" fill="currentColor" />
    </svg>
  )
}

const SIZE_TO_INNER = {
  28: 16,
  32: 18,
  36: 20,
  40: 24,
  48: 28,
}

export function BrandMark({ size = 32, variant = 'subtle', className = '' }) {
  const innerSize = SIZE_TO_INNER[size] || Math.round(size * 0.6)
  const containerCls = variant === 'solid'
    ? 'bg-primary text-on-primary'
    : 'bg-primary/10 text-primary'
  return (
    <span
      className={`inline-flex items-center justify-center rounded-lg shrink-0 ${containerCls} ${className}`}
      style={{ width: size, height: size }}
    >
      <BrandGlyph size={innerSize} />
    </span>
  )
}

// full lockup: mark + wordmark. used in the public Header. the link wrapper
// is intentional — clicking the brand always returns to /.
export function BrandLogo({ to = '/', size = 32 }) {
  return (
    <Link to={to} className="flex items-center gap-2.5 group" aria-label="OnRamp — home">
      <BrandMark size={size} variant="solid" />
      <span className="text-xl font-bold tracking-tight text-on-surface font-[family-name:var(--font-family-display)] group-hover:text-primary transition-colors">
        OnRamp
      </span>
    </Link>
  )
}
