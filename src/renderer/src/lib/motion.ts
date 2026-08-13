import { useReducedMotion } from 'framer-motion'
import type { Transition, Variants } from 'framer-motion'

/**
 * Les réglages de mouvement de l'application, au même endroit.
 *
 * Une règle : chaque animation doit répondre à « qu'est-ce qu'elle dit ? ».
 * Hiérarchie, séquence, retour d'action, changement d'état. Si aucune de ces
 * quatre réponses ne tient, l'animation n'a pas lieu d'être.
 *
 * Et tout se coupe quand le système demande moins de mouvement : une
 * application de concentration ne peut pas imposer ce qu'on lui a refusé.
 */

/** Ressort d'interface : ferme, sans rebond parasite. */
export const SPRING: Transition = { type: 'spring', stiffness: 220, damping: 26, mass: 0.9 }

/** Ressort lent, pour les gestes qui parcourent une distance. */
export const SPRING_SLOW: Transition = { type: 'spring', stiffness: 45, damping: 16 }

/** Courbe de sortie, pour ce qui n'a pas besoin de physique. */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const

export const DURATION = { fast: 0.2, normal: 0.32, slow: 0.5 } as const

/**
 * Variantes d'entrée d'une pile d'éléments : ils arrivent dans l'ordre où on
 * les lit, jamais tous en même temps.
 */
export function useStagger(step = 0.06): { container: Variants; item: Variants } {
  const reduce = useReducedMotion()

  return {
    container: {
      hidden: {},
      show: { transition: { staggerChildren: reduce ? 0 : step } },
    },
    item: reduce
      ? { hidden: { opacity: 1 }, show: { opacity: 1 } }
      : {
          hidden: { opacity: 0, y: 12 },
          show: { opacity: 1, y: 0, transition: { duration: DURATION.slow, ease: EASE_OUT } },
        },
  }
}

/** Entrée simple, neutralisée sous mouvement réduit. */
export function useEnter(delay = 0) {
  const reduce = useReducedMotion()
  if (reduce) return { initial: false as const, animate: { opacity: 1 } }
  return {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { delay, duration: DURATION.slow, ease: EASE_OUT },
  }
}
