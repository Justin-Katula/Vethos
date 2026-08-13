import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'

/**
 * Le passage d'une page à l'autre.
 *
 * La page sortante recule et s'efface, l'entrante arrive de l'avant. Ce n'est
 * pas de la décoration : c'est ce qui dit qu'on a changé d'endroit, à
 * l'instant où on l'a fait. Un contenu qui se remplace sans transition ne se
 * lit pas comme une navigation, il se lit comme un rafraîchissement.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion()

  if (reduce) return <div className="h-full">{children}</div>

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.994 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.996 }}
      transition={{
        duration: 0.36,
        ease: [0.22, 1, 0.36, 1],
        opacity: { duration: 0.22 },
      }}
      className="h-full"
    >
      {children}
    </motion.div>
  )
}
