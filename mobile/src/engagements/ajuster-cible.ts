/**
 * L'app obéit : ce qui est demandé est posé. Elle ne baisse JAMAIS une cible
 * d'elle-même — elle PROPOSE, et l'utilisateur décide :
 * - baisser, quand les deux dernières semaines montrent qu'on peine ;
 * - monter, quand tout est tenu, et tenu en entier.
 * Une proposition répondue (oui ou non) ne revient pas avant 7 jours.
 */
import { tenue } from '@shared/planning/habitudes'
import type { SessionEvent } from '@shared/schemas'

/** Sous 60 % du prévu tenu sur 14 jours : on peine. */
export const SEUIL_PEINE = 0.6
/** À 95 % et plus, avec 90 % des blocs tenus en entier : on est vraiment bien. */
export const SEUIL_AISANCE = 0.95
/** Pas de conclusion sur trop peu de séances. */
export const OBSERVATIONS_MIN = 6
/** Une proposition répondue se tait une semaine. */
export const SILENCE_MS = 7 * 86_400_000

export type Proposition = { sens: 'baisser' | 'monter'; minutes: number; tenuPourcent: number }

const quart = (m: number) => Math.ceil(m / 15) * 15

export function propositionCible(a: {
  objectifId: string
  cibleMinutes: number
  events: readonly SessionEvent[]
  today: string
  /** La dernière réponse à une proposition pour cet objectif (ISO), s'il y en a une. */
  derniereReponse?: string
  maintenantMs: number
}): Proposition | null {
  if (a.derniereReponse) {
    const t = new Date(a.derniereReponse).getTime()
    if (Number.isFinite(t) && a.maintenantMs - t < SILENCE_MS) return null
  }
  const t = tenue([...a.events], a.objectifId, a.today)
  if (t.observations < OBSERVATIONS_MIN) return null
  const tenuPourcent = Math.round(t.tauxTenue * 100)

  if (t.tauxTenue < SEUIL_PEINE) {
    // Ce qui a vraiment été tenu par semaine, un peu au-dessus : un objectif atteignable.
    const parSemaine = (t.tauxTenue * a.cibleMinutes) * 1.1
    const minutes = Math.max(60, quart(parSemaine))
    return minutes <= a.cibleMinutes - 15 ? { sens: 'baisser', minutes, tenuPourcent } : null
  }
  if (t.tauxTenue >= SEUIL_AISANCE && t.tauxBlocs >= 0.9) {
    return { sens: 'monter', minutes: quart(a.cibleMinutes * 1.15), tenuPourcent }
  }
  return null
}
