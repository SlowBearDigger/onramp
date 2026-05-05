import { motion, useReducedMotion } from 'motion/react'
import { CheckCircle, Check, Lightning } from '@phosphor-icons/react'

// no signup demo: signup form fields fade out, replaced by a checkmark
export function NoSignupDemo() {
  const prefersReduced = useReducedMotion()
  return (
    <div className="h-24 flex flex-col items-center justify-center gap-2 mb-4 overflow-hidden">
      {['Email', 'Password', 'Account Setup'].map((field, i) => (
        <motion.div
          key={field}
          className="w-32 h-5 rounded bg-error/10 dark:bg-error/20 flex items-center justify-center"
          style={{ willChange: prefersReduced ? 'auto' : 'transform, opacity' }}
          animate={
            prefersReduced
              ? { opacity: 1, x: 0, scale: 1 }
              : {
                  opacity: [1, 1, 0, 0],
                  x: [0, 0, 30, 30],
                  scale: [1, 1, 0.8, 0.8],
                }
          }
          transition={
            prefersReduced
              ? { duration: 0 }
              : { duration: 4, repeat: Infinity, delay: i * 0.4, times: [0, 0.3, 0.5, 1] }
          }
        >
          <span className="text-[9px] font-bold text-error/60 line-through">{field}</span>
        </motion.div>
      ))}
      <motion.div
        className="absolute"
        animate={
          prefersReduced
            ? { opacity: 1, scale: 1 }
            : { opacity: [0, 0, 1, 1, 0], scale: [0.5, 0.5, 1, 1, 0.5] }
        }
        transition={
          prefersReduced
            ? { duration: 0 }
            : { duration: 4, repeat: Infinity, times: [0, 0.5, 0.6, 0.85, 1] }
        }
      >
        <CheckCircle size={28} weight="bold" className="text-primary" />
      </motion.div>
    </div>
  )
}

// ─── Instant Delivery Demo: Countdown timer ─────────────────────────────
export function InstantDemo() {
  const prefersReduced = useReducedMotion()
  return (
    <div className="h-24 flex items-center justify-center mb-4">
      <div className="relative w-16 h-16">
        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
          <circle
            cx="32"
            cy="32"
            r="28"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="text-surface-container-high dark:text-surface-container-high/30"
          />
          <motion.circle
            cx="32"
            cy="32"
            r="28"
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            className="text-primary"
            stroke="currentColor"
            strokeDasharray={175.93}
            animate={
              prefersReduced
                ? { strokeDashoffset: 0 }
                : { strokeDashoffset: [175.93, 0, 0, 175.93] }
            }
            transition={
              prefersReduced
                ? { duration: 0 }
                : { duration: 4, repeat: Infinity, times: [0, 0.6, 0.85, 1], ease: 'linear' }
            }
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.span
            className="text-primary inline-flex"
            animate={prefersReduced ? { opacity: 1 } : { opacity: [1, 1, 0, 0] }}
            transition={
              prefersReduced
                ? { duration: 0 }
                : { duration: 4, repeat: Infinity, times: [0, 0.55, 0.6, 1] }
            }
          >
            <Lightning size={22} weight="fill" />
          </motion.span>
          <motion.span
            className="text-primary absolute inline-flex"
            animate={
              prefersReduced
                ? { opacity: 1, scale: 1 }
                : { opacity: [0, 0, 1, 1, 0], scale: [0.5, 0.5, 1.2, 1, 0.5] }
            }
            transition={
              prefersReduced
                ? { duration: 0 }
                : { duration: 4, repeat: Infinity, times: [0, 0.55, 0.65, 0.85, 1] }
            }
          >
            <Check size={22} weight="bold" />
          </motion.span>
        </div>
      </div>
    </div>
  )
}

// ─── Best Rates Demo: Price comparison bars ─────────────────────────────
export function BestRatesDemo() {
  const prefersReduced = useReducedMotion()
  const competitors = [
    { name: 'Others', target: 0.85, color: 'bg-zinc-300 dark:bg-zinc-600' },
    { name: 'On-Ramp', target: 0.6, color: 'bg-primary' },
  ]

  return (
    <div className="h-24 flex flex-col items-center justify-center gap-3 mb-4 w-full px-4">
      {competitors.map((c, i) => (
        <div key={c.name} className="w-full">
          <div className="flex justify-between mb-1">
            <span className="text-[9px] font-bold text-secondary">{c.name}</span>
            <motion.span
              className="text-[9px] font-bold text-on-surface"
              animate={prefersReduced ? { opacity: 1 } : { opacity: [0, 0, 1, 1] }}
              transition={
                prefersReduced
                  ? { duration: 0 }
                  : { duration: 4, repeat: Infinity, delay: i * 0.2, times: [0, 0.4, 0.5, 1] }
              }
            >
              {i === 0 ? '$68,900' : '$68,432'}
            </motion.span>
          </div>
          <div className="w-full h-3 bg-surface-container-high dark:bg-surface-container-high/30 rounded-full overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${c.color}`}
              style={{
                transformOrigin: 'left center',
                width: '100%',
                willChange: prefersReduced ? 'auto' : 'transform',
              }}
              animate={
                prefersReduced
                  ? { scaleX: c.target }
                  : { scaleX: [0, c.target, c.target, 0] }
              }
              transition={
                prefersReduced
                  ? { duration: 0 }
                  : { duration: 4, repeat: Infinity, times: [0, 0.4, 0.85, 1], ease: 'easeOut' }
              }
            />
          </div>
        </div>
      ))}
      <motion.span
        className="text-[10px] font-extrabold text-primary"
        animate={
          prefersReduced
            ? { opacity: 1, y: 0 }
            : { opacity: [0, 0, 1, 1, 0], y: [5, 5, 0, 0, -5] }
        }
        transition={
          prefersReduced
            ? { duration: 0 }
            : { duration: 4, repeat: Infinity, times: [0, 0.5, 0.6, 0.85, 1] }
        }
      >
        Save ~0.7%
      </motion.span>
    </div>
  )
}
