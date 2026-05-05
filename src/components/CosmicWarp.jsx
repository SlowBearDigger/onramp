import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'

// ─── Starfield Canvas ───────────────────────────────────────────────────
// Renders a warp-speed starfield that accelerates during processing
function Starfield({ color, phase, intensity = 1 }) {
  const canvasRef = useRef(null)
  const starsRef = useRef([])
  const frameRef = useRef(null)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1

    const resize = () => {
      canvas.width = canvas.offsetWidth * dpr
      canvas.height = canvas.offsetHeight * dpr
      ctx.scale(dpr, dpr)
    }
    resize()

    const w = canvas.offsetWidth
    const h = canvas.offsetHeight
    const cx = w / 2
    const cy = h / 2

    // Parse hex color
    const r = parseInt(color.slice(1, 3), 16)
    const g = parseInt(color.slice(3, 5), 16)
    const b = parseInt(color.slice(5, 7), 16)

    // Initialize stars
    if (starsRef.current.length === 0) {
      starsRef.current = Array.from({ length: 80 }, () => ({
        x: (Math.random() - 0.5) * w * 2,
        y: (Math.random() - 0.5) * h * 2,
        z: Math.random() * 1000,
        size: 0.5 + Math.random() * 1.5,
      }))
    }

    const animate = () => {
      ctx.clearRect(0, 0, w, h)

      // Speed increases with phase: idle→slow, warp→fast, landing→decelerate
      const speed = phase === 'warp' ? 18 * intensity
        : phase === 'landing' ? 4
        : 3

      const trailLength = phase === 'warp' ? 0.6 : phase === 'landing' ? 0.2 : 0.05

      starsRef.current.forEach((star) => {
        star.z -= speed

        if (star.z <= 0) {
          star.x = (Math.random() - 0.5) * w * 2
          star.y = (Math.random() - 0.5) * h * 2
          star.z = 1000
        }

        const sx = (star.x / star.z) * 300 + cx
        const sy = (star.y / star.z) * 300 + cy
        const sz = (1 - star.z / 1000) * star.size * 2.5

        // Previous position for trail
        const pz = star.z + speed * 4
        const px = (star.x / pz) * 300 + cx
        const py = (star.y / pz) * 300 + cy

        if (sx < -10 || sx > w + 10 || sy < -10 || sy > h + 10) return

        const alpha = Math.min(1, (1 - star.z / 1000) * 1.5) * intensity

        // Star trail
        if (trailLength > 0.02) {
          const grad = ctx.createLinearGradient(px, py, sx, sy)
          grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`)
          grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, ${alpha * trailLength})`)
          ctx.beginPath()
          ctx.moveTo(px, py)
          ctx.lineTo(sx, sy)
          ctx.strokeStyle = grad
          ctx.lineWidth = sz * 0.8
          ctx.stroke()
        }

        // Star dot
        ctx.beginPath()
        ctx.arc(sx, sy, sz, 0, Math.PI * 2)
        ctx.fillStyle = phase === 'warp'
          ? `rgba(${r}, ${g}, ${b}, ${alpha})`
          : `rgba(255, 255, 255, ${alpha * 0.7})`
        ctx.fill()
      })

      frameRef.current = requestAnimationFrame(animate)
    }

    frameRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frameRef.current)
  }, [color, phase, intensity])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ width: '100%', height: '100%' }}
    />
  )
}

// ─── Cosmic Warp Overlay ────────────────────────────────────────────────
// Full-widget overlay that creates the space travel effect during processing
export default function CosmicWarp({ color = '#047857', step = 0, totalSteps = 3 }) {
  const progress = step / totalSteps
  const phase = progress < 0.3 ? 'idle' : progress < 0.9 ? 'warp' : 'landing'

  return (
    <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none z-0">
      {/* Deepening background */}
      <motion.div
        className="absolute inset-0"
        animate={{
          background: phase === 'warp'
            ? `radial-gradient(circle at 50% 50%, ${color}08 0%, rgba(0,0,0,0.3) 70%)`
            : phase === 'landing'
            ? `radial-gradient(circle at 50% 50%, ${color}15 0%, rgba(0,0,0,0.1) 60%)`
            : 'transparent',
        }}
        transition={{ duration: 1.5 }}
      />

      {/* Starfield */}
      <Starfield
        color={color}
        phase={phase}
        intensity={phase === 'warp' ? 0.8 + progress * 0.4 : 0.5}
      />

      {/* Center warp glow — grows during travel */}
      <motion.div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        animate={{
          width: phase === 'warp' ? 200 : phase === 'landing' ? 300 : 40,
          height: phase === 'warp' ? 200 : phase === 'landing' ? 300 : 40,
          opacity: phase === 'idle' ? 0 : phase === 'warp' ? 0.15 : 0.25,
        }}
        transition={{ duration: 2, ease: 'easeInOut' }}
        style={{ backgroundColor: color, filter: 'blur(60px)' }}
      />

      {/* Vignette for depth */}
      {phase !== 'idle' && (
        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: phase === 'warp' ? 0.4 : 0.2 }}
          style={{
            background: 'radial-gradient(circle at 50% 50%, transparent 30%, rgba(0,0,0,0.5) 100%)',
          }}
        />
      )}
    </div>
  )
}
