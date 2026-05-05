import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'

// ─── Starfield Canvas (renders behind blobs during warp) ────────────────
function Starfield({ color, active }) {
  const canvasRef = useRef(null)
  const starsRef = useRef([])
  const frameRef = useRef(null)

  useEffect(() => {
    if (!active) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const isMobile = window.matchMedia('(max-width: 768px)').matches
    const lowCPU = (navigator.hardwareConcurrency || 8) <= 4
    const starCount = isMobile || lowCPU ? 60 : 200

    const resize = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = w + 'px'
      canvas.style.height = h + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize, { passive: true })

    const w = window.innerWidth
    const h = window.innerHeight

    const cr = parseInt(color.slice(1, 3), 16)
    const cg = parseInt(color.slice(3, 5), 16)
    const cb = parseInt(color.slice(5, 7), 16)

    if (starsRef.current.length === 0) {
      starsRef.current = Array.from({ length: starCount }, () => ({
        x: (Math.random() - 0.5) * w * 4,
        y: (Math.random() - 0.5) * h * 4,
        z: Math.random() * 2000,
        size: 0.5 + Math.random() * 2.5,
      }))
    }

    let running = true
    const onVisibility = () => {
      if (document.hidden) {
        if (frameRef.current) cancelAnimationFrame(frameRef.current)
        running = false
      } else if (!running) {
        running = true
        frameRef.current = requestAnimationFrame(animate)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    const animate = () => {
      const cw = window.innerWidth
      const ch = window.innerHeight
      ctx.clearRect(0, 0, cw, ch)

      starsRef.current.forEach((star) => {
        star.z -= 20
        if (star.z <= 0) {
          star.x = (Math.random() - 0.5) * cw * 4
          star.y = (Math.random() - 0.5) * ch * 4
          star.z = 2000
        }

        const focalLength = 500
        const sx = (star.x / star.z) * focalLength + cw / 2
        const sy = (star.y / star.z) * focalLength + ch / 2
        const depth = 1 - star.z / 2000
        const sz = depth * star.size * 3

        const pz = star.z + 80
        const px = (star.x / pz) * focalLength + cw / 2
        const py = (star.y / pz) * focalLength + ch / 2

        if (sx < -50 || sx > cw + 50 || sy < -50 || sy > ch + 50) return

        const alpha = Math.min(1, depth * 2) * 0.8

        const grad = ctx.createLinearGradient(px, py, sx, sy)
        grad.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 0)`)
        grad.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, ${alpha * 0.6})`)
        ctx.beginPath()
        ctx.moveTo(px, py)
        ctx.lineTo(sx, sy)
        ctx.strokeStyle = grad
        ctx.lineWidth = sz * 0.7
        ctx.stroke()

        ctx.beginPath()
        ctx.arc(sx, sy, sz * 0.6, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.6})`
        ctx.fill()
      })

      if (running) frameRef.current = requestAnimationFrame(animate)
    }

    frameRef.current = requestAnimationFrame(animate)
    return () => {
      running = false
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibility)
      starsRef.current = []
    }
  }, [color, active])

  if (!active) return null

  return (
    <motion.canvas
      ref={canvasRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
      className="fixed inset-0 pointer-events-none z-[1]"
    />
  )
}

// ─── Reactive Blobs with Warp Mode ──────────────────────────────────────
// Transform-only animation: position, size, blur, and background are static.
// Phase transitions and idle drift use x, y, scale, opacity — GPU-composited,
// no layout or paint per frame.
export default function ReactiveBlobs({ color = '#047857', className = '', warpPhase = 'idle' }) {
  const prefersReduced = useReducedMotion()
  const containerRef = useRef(null)
  const [inView, setInView] = useState(true)

  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const isWarping = warpPhase === 'warp'
  const isLanding = warpPhase === 'landing'
  const isSuccess = warpPhase === 'success'
  const isIdle = warpPhase === 'idle'

  const loopActive = inView && !prefersReduced
  const needsLayer = !isIdle || loopActive

  const blobBase = (sx, sy) => ({
    willChange: needsLayer ? 'transform, opacity' : 'auto',
    backfaceVisibility: 'hidden',
    transform: 'translateZ(0)',
    // contain: paint — tells the browser the blob's painting (including
    // the blur filter that extends past the box) is contained within the
    // element's bounds. with this, Lighthouse's layout-shift observer
    // doesn't measure the blur-extended rect changing as a CLS event.
    // safe because blobs are decorative, position:absolute inside a
    // fixed parent — they don't affect surrounding layout regardless.
    contain: 'paint',
  })

  return (
    <div
      ref={containerRef}
      className={`fixed inset-0 overflow-hidden pointer-events-none ${className}`}
      aria-hidden
    >
      <Starfield color={color} active={isWarping} />

      {/* Vignette during warp */}
      <motion.div
        className="fixed inset-0 z-[2] pointer-events-none"
        animate={{ opacity: isWarping ? 0.6 : isLanding ? 0.3 : 0 }}
        transition={{ duration: 1.2, ease: 'easeInOut' }}
        style={{
          background:
            'radial-gradient(circle at 50% 50%, transparent 15%, rgba(0,0,0,0.7) 100%)',
        }}
      />

      {/* Blob 1 — largest, top-left */}
      <motion.div
        className="absolute rounded-full"
        style={{
          ...blobBase(),
          left: '5%',
          top: '15%',
          width: 500,
          height: 500,
          backgroundColor: color,
          filter: 'blur(80px)',
          borderRadius: '50% 45% 55% 50% / 50% 55% 45% 50%',
        }}
        // CLS note: previous versions animated x/y drift through keyframe
        // arrays even on idle (the constant background motion). Lighthouse
        // 12+ "Layout Shifts" measures keyframe-driven transforms as
        // shifts even though they're position:absolute inside a fixed
        // parent. dropping idle x/y/scale animation entirely → CLS 0
        // and the blobs still look great as static color washes.
        // animations come back during user-triggered transitions
        // (warp/landing/success), which fall outside the CLS window.
        initial={{ x: 0, y: 0, scale: 1, opacity: 0.15 }}
        animate={
          loopActive
            ? {
                x: isWarping ? -160 : 0,
                y: isWarping ? -160 : 0,
                scale: isWarping
                  ? 0.4
                  : isLanding
                  ? 1.3
                  : isSuccess
                  ? [1.1, 1.15, 1.1]
                  : 1,
                opacity: isWarping ? 0.06 : isSuccess ? 0.19 : isLanding ? 0.22 : 0.15,
              }
            : {
                x: 0,
                y: 0,
                scale: isWarping ? 0.4 : isLanding ? 1.3 : isSuccess ? 1.12 : 1,
                opacity: isWarping ? 0.06 : isSuccess ? 0.19 : isLanding ? 0.22 : 0.15,
              }
        }
        transition={{
          x: isWarping
            ? { duration: 1.5, ease: 'easeInOut' }
            : isLanding
            ? { duration: 1, ease: 'easeInOut' }
            : { duration: 24, repeat: Infinity, ease: 'easeInOut' },
          y: isWarping
            ? { duration: 1.5, ease: 'easeInOut' }
            : isLanding
            ? { duration: 1, ease: 'easeInOut' }
            : { duration: 24, repeat: Infinity, ease: 'easeInOut' },
          scale: isWarping
            ? { duration: 1.5, ease: 'easeInOut' }
            : isLanding
            ? { duration: 1, ease: 'easeInOut' }
            : isSuccess
            ? { duration: 4, repeat: Infinity, ease: 'easeInOut' }
            : { duration: 24, repeat: Infinity, ease: 'easeInOut' },
          opacity: { duration: 1.2, ease: 'easeInOut' },
        }}
      />

      {/* Blob 2 — mid, bottom-right */}
      <motion.div
        className="absolute rounded-full"
        style={{
          ...blobBase(),
          right: '5%',
          bottom: '20%',
          width: 380,
          height: 380,
          backgroundColor: color,
          filter: 'blur(70px)',
          borderRadius: '55% 45% 50% 50% / 50% 55% 45% 50%',
        }}
        initial={{ x: 0, y: 0, scale: 1, opacity: 0.09 }}
        animate={
          loopActive
            ? {
                x: isWarping ? 140 : 0,
                y: isWarping ? 140 : 0,
                scale: isWarping ? 0.4 : isLanding ? 1.2 : 1,
                opacity: isWarping ? 0.03 : isLanding ? 0.12 : 0.09,
              }
            : {
                x: 0,
                y: 0,
                scale: isWarping ? 0.4 : isLanding ? 1.2 : 1,
                opacity: isWarping ? 0.03 : isLanding ? 0.12 : 0.09,
              }
        }
        transition={{
          x: isWarping
            ? { duration: 1.5, ease: 'easeInOut' }
            : { duration: 28, repeat: Infinity, ease: 'easeInOut', delay: 2 },
          y: isWarping
            ? { duration: 1.5, ease: 'easeInOut' }
            : { duration: 28, repeat: Infinity, ease: 'easeInOut', delay: 2 },
          scale: isWarping
            ? { duration: 1.5, ease: 'easeInOut' }
            : isLanding
            ? { duration: 1, ease: 'easeInOut' }
            : { duration: 28, repeat: Infinity, ease: 'easeInOut' },
          opacity: { duration: 1.2, ease: 'easeInOut' },
        }}
      />

      {/* Blob 3 — smallest, bottom-center */}
      <motion.div
        className="absolute rounded-full"
        style={{
          ...blobBase(),
          left: '40%',
          bottom: '5%',
          width: 280,
          height: 280,
          backgroundColor: color,
          filter: 'blur(60px)',
          borderRadius: '50% 50% 45% 55% / 55% 45% 50% 50%',
        }}
        initial={{ x: 0, y: 0, scale: 1, opacity: 0.12 }}
        animate={
          loopActive
            ? {
                x: isWarping ? 40 : 0,
                y: isWarping ? 180 : 0,
                scale: isWarping ? 0.35 : isLanding ? 1.25 : 1,
                opacity: isWarping ? 0.02 : isLanding ? 0.14 : 0.12,
              }
            : {
                x: 0,
                y: 0,
                scale: isWarping ? 0.35 : isLanding ? 1.25 : 1,
                opacity: isWarping ? 0.02 : isLanding ? 0.14 : 0.12,
              }
        }
        transition={{
          x: isWarping
            ? { duration: 1.5, ease: 'easeInOut' }
            : { duration: 20, repeat: Infinity, ease: 'easeInOut', delay: 4 },
          y: isWarping
            ? { duration: 1.5, ease: 'easeInOut' }
            : { duration: 20, repeat: Infinity, ease: 'easeInOut', delay: 4 },
          scale: isWarping
            ? { duration: 1.5, ease: 'easeInOut' }
            : isLanding
            ? { duration: 1, ease: 'easeInOut' }
            : { duration: 20, repeat: Infinity, ease: 'easeInOut' },
          opacity: { duration: 1.2, ease: 'easeInOut' },
        }}
      />

      {/* Center destination glow — landing/success only */}
      {(isLanding || isSuccess) && (
        <motion.div
          className="fixed left-1/2 top-1/2 rounded-full z-[3] pointer-events-none"
          initial={{ scale: 0, opacity: 0 }}
          animate={{
            scale: isSuccess ? 1.6 : 1,
            opacity: isSuccess ? 0.25 : 0.2,
          }}
          transition={{ duration: 1.5, ease: 'easeOut' }}
          style={{
            width: 500,
            height: 500,
            marginLeft: -250,
            marginTop: -250,
            backgroundColor: color,
            filter: 'blur(120px)',
            willChange: 'transform, opacity',
          }}
        />
      )}
    </div>
  )
}
