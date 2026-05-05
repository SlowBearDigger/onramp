import { useEffect, useRef } from 'react'

export default function ConfettiBurst({ color = '#047857', particleCount = 40 }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    // Respect reduced motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    canvas.width = canvas.offsetWidth * dpr
    canvas.height = canvas.offsetHeight * dpr
    ctx.scale(dpr, dpr)

    const cx = canvas.offsetWidth / 2
    const cy = canvas.offsetHeight / 2

    // Parse base color and create variations
    const hexToRgb = (hex) => {
      const r = parseInt(hex.slice(1, 3), 16)
      const g = parseInt(hex.slice(3, 5), 16)
      const b = parseInt(hex.slice(5, 7), 16)
      return [r, g, b]
    }

    const base = hexToRgb(color)
    const particles = Array.from({ length: particleCount }, () => {
      const angle = Math.random() * Math.PI * 2
      const speed = 2 + Math.random() * 6
      const hueShift = (Math.random() - 0.5) * 60
      return {
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        size: 3 + Math.random() * 5,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 15,
        opacity: 1,
        color: [
          Math.max(0, Math.min(255, base[0] + hueShift)),
          Math.max(0, Math.min(255, base[1] + hueShift * 0.5)),
          Math.max(0, Math.min(255, base[2] - hueShift * 0.3)),
        ],
        shape: Math.random() > 0.5 ? 'rect' : 'circle',
      }
    })

    let frame = 0
    const maxFrames = 120

    const animate = () => {
      if (frame >= maxFrames) return
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight)

      particles.forEach((p) => {
        p.x += p.vx
        p.vy += 0.12 // gravity
        p.y += p.vy
        p.vx *= 0.98 // drag
        p.rotation += p.rotationSpeed
        p.opacity = Math.max(0, 1 - frame / maxFrames)

        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate((p.rotation * Math.PI) / 180)
        ctx.globalAlpha = p.opacity
        ctx.fillStyle = `rgb(${p.color[0]}, ${p.color[1]}, ${p.color[2]})`

        if (p.shape === 'rect') {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
        } else {
          ctx.beginPath()
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.restore()
      })

      frame++
      requestAnimationFrame(animate)
    }

    requestAnimationFrame(animate)
  }, [color, particleCount])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ width: '100%', height: '100%' }}
    />
  )
}
