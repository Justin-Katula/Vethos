import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'

/** Le changement de page reste perceptible, sans voler l'attention au contenu. */
export function PageTransition({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion()

  if (reduce) return <div className="h-full">{children}</div>

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.994 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.996 }}
      transition={{
        duration: 0.24,
        ease: [0.22, 1, 0.36, 1],
        opacity: { duration: 0.16 },
      }}
      className="h-full"
    >
      {children}
    </motion.div>
  )
}
