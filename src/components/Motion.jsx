import { motion, useReducedMotion } from 'motion/react'

// ─── Shared transition presets ─────────────────────────────────────────────
const spring = { type: 'spring', stiffness: 100, damping: 20 }
const smooth = { duration: 0.7, ease: [0.16, 1, 0.3, 1] }
const instant = { duration: 0 }

// ─── Scroll-triggered fade in ──────────────────────────────────────────────
// Usage: <FadeIn> or <FadeIn delay={0.2} direction="left">
export function FadeIn({
  children,
  delay = 0,
  direction = 'up',
  duration = 0.7,
  className = '',
  ...props
}) {
  const prefersReduced = useReducedMotion()
  const offsets = {
    up: { y: 40 },
    down: { y: -40 },
    left: { x: 60 },
    right: { x: -60 },
    none: {},
  }

  return (
    <motion.div
      initial={prefersReduced ? { opacity: 0 } : { opacity: 0, ...offsets[direction] }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={prefersReduced ? instant : { duration, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  )
}

// ─── Stagger container ─────────────────────────────────────────────────────
// Usage: <Stagger> wrapping multiple <StaggerItem>
const staggerVariants = {
  hidden: {},
  visible: (stagger = 0.1) => ({
    transition: { staggerChildren: stagger },
  }),
}

const staggerItemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: smooth,
  },
}

export function Stagger({ children, stagger = 0.1, className = '', ...props }) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-60px' }}
      custom={stagger}
      variants={staggerVariants}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({ children, className = '', ...props }) {
  return (
    <motion.div variants={staggerItemVariants} className={className} {...props}>
      {children}
    </motion.div>
  )
}

// ─── Premium button wrapper ────────────────────────────────────────────────
// Usage: <MagneticButton className="bg-emerald-700 ...">Buy Now</MagneticButton>
export function MagneticButton({ children, className = '', as = 'button', ...props }) {
  const prefersReduced = useReducedMotion()
  const Component = motion.create(as)
  return (
    <Component
      whileTap={prefersReduced ? {} : { scale: 0.97 }}
      transition={prefersReduced ? instant : { duration: 0.15 }}
      className={className}
      {...props}
    >
      {children}
    </Component>
  )
}

// ─── Card with hover lift ──────────────────────────────────────────────────
// Usage: <HoverCard className="bg-white p-8 ...">content</HoverCard>
export function HoverCard({ children, className = '', ...props }) {
  return (
    <div
      className={`transition-colors duration-150 ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

// ─── Floating decoration ───────────────────────────────────────────────────
// Usage: <Float> for gentle bobbing on decorative elements
export function Float({ children, className = '', duration = 4, y = 10, ...props }) {
  const prefersReduced = useReducedMotion()
  return (
    <motion.div
      animate={prefersReduced ? {} : { y: [0, -y, 0] }}
      transition={prefersReduced ? instant : {
        duration,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  )
}

// ─── Scale in on scroll ────────────────────────────────────────────────────
// Usage: <ScaleIn> for elements that pop in (icons, badges)
export function ScaleIn({ children, delay = 0, className = '', ...props }) {
  const prefersReduced = useReducedMotion()
  return (
    <motion.div
      initial={prefersReduced ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={prefersReduced ? instant : { ...spring, delay }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  )
}

// ─── Blur fade in (composited — opacity + translate only) ──────────────
// Usage: <BlurIn> for hero text or widget entrance
//
// Used to animate `filter: blur(10px) → blur(0px)` for the glass effect,
// but Lighthouse flagged that as "non-composited animation" — `filter`
// requires a paint-stage operation per frame, locking the main thread
// during animation and inflating CLS measurements. Now uses opacity
// + translateY only, which the GPU composites without paint. Visual
// difference is minimal (the blur was subtle); perf gain is real.
export function BlurIn({ children, delay = 0, className = '', ...props }) {
  const prefersReduced = useReducedMotion()
  return (
    <motion.div
      initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={prefersReduced ? instant : { duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  )
}

// ─── Animated number (spring-interpolated) ─────────────────────────────
// Usage: <AnimatedNumber value={1234.56} decimals={2} prefix="$" />
import { useSpring } from 'motion/react'
import { useEffect, useState as useStateR } from 'react'

export function AnimatedNumber({ value, decimals = 2, prefix = '', suffix = '', className = '' }) {
  const spring = useSpring(0, { stiffness: 80, damping: 20 })
  const [display, setDisplay] = useStateR(`${prefix}0${suffix}`)

  useEffect(() => {
    spring.set(value)
  }, [value, spring])

  useEffect(() => {
    const unsubscribe = spring.on('change', (v) => {
      setDisplay(`${prefix}${v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`)
    })
    return unsubscribe
  }, [spring, prefix, suffix, decimals])

  return <motion.span className={className}>{display}</motion.span>
}

// mini sparkline SVG with optional heartbeat animation.
//
// usage:
//   <Sparkline data={[100, 102, 99, 105]} color="#047857" />
//   <Sparkline data={...} color="#047857" live />   ← adds pulsing end-dot
//
// when `live` is true, a soft pulse ring is drawn at the rightmost point
// (last element of `data`). the pulse is purely cosmetic — driven by CSS
// keyframes, not by any data movement — so it can't lie about pricing.
// the sparkline itself only ever reflects real samples passed in via `data`.
//
// when the data array changes (a new poll arrives), the line redraws with
// a quick path-length animation so the user perceives the refresh.
export function Sparkline({ data = [], color = '#047857', width = 60, height = 20, live = false }) {
  const prefersReduced = useReducedMotion()
  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const lastIndex = data.length - 1
  const coords = data.map((v, i) => {
    const x = (i / lastIndex) * width
    const y = height - ((v - min) / range) * (height - 4) - 2
    return [x, y]
  })
  const polylinePoints = coords.map(([x, y]) => `${x},${y}`).join(' ')
  const [endX, endY] = coords[lastIndex]
  // re-key the polyline by data length so framer's pathLength animation
  // re-runs on each poll — gives a subtle "redraw" cue when fresh data lands.
  const drawKey = `${data.length}-${endX.toFixed(1)}-${endY.toFixed(1)}`

  return (
    <svg width={width} height={height} className="inline-block align-middle overflow-visible" aria-hidden="true">
      <motion.polyline
        key={drawKey}
        points={polylinePoints}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={prefersReduced ? false : { pathLength: 0.85, opacity: 0.7 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={prefersReduced ? { duration: 0 } : { duration: 0.5, ease: 'easeOut' }}
      />
      {live && !prefersReduced && (
        <>
          {/* outer pulsing ring — heartbeat. constant-frequency animation
              independent of data, so it can't fake price movement. */}
          <motion.circle
            cx={endX}
            cy={endY}
            r={3}
            fill={color}
            opacity={0.5}
            // explicit initial keeps framer from writing r="undefined" on
            // the first frame (svg attribute keyframes quirk) — was filling
            // the console with <circle> attribute errors on every mount.
            initial={{ r: 3, opacity: 0.5 }}
            animate={{ r: [3, 9, 3], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
          />
          {/* inner solid dot — anchors the eye to the latest real sample.
              white-bordered for contrast against the line stroke. */}
          <circle cx={endX} cy={endY} r={3} fill={color} />
          <circle cx={endX} cy={endY} r={1.4} fill="white" opacity={0.95} />
        </>
      )}
      {live && prefersReduced && (
        // reduced-motion: static dot only, no pulse animation.
        <>
          <circle cx={endX} cy={endY} r={3} fill={color} />
          <circle cx={endX} cy={endY} r={1.4} fill="white" opacity={0.95} />
        </>
      )}
    </svg>
  )
}

// Re-export motion for direct use when needed
export { motion }
