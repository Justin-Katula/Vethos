import { useReducedMotion } from 'framer-motion'
import type { Variants } from 'framer-motion'

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
