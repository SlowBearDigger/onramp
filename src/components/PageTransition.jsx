import { motion, useReducedMotion } from 'motion/react'

export default function PageTransition({ children, className = '' }) {
  const reduceMotion = useReducedMotion()
  const transition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.3, ease: [0.16, 1, 0.3, 1] }

  return (
    <motion.div
      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -16 }}
      transition={transition}
      className={className}
    >
      {children}
    </motion.div>
  )
}
