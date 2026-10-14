import { minutesDeRappel, reportable } from '@shared/planning/report'
import type { PlacedBlock } from '@shared/planning/types'

/**
 * Les rappels de « Je commence » : quoi programmer, et quand. Pur — le module
 * de notifications vit dans `rappels.ts`.
 *
 * Toutes les 3 min dès le début du bloc, vingt au plus, jusqu'à la confirmation
 * (`@shared/planning/report`). iOS garde 64 notifications en attente par
 * application : on en programme 60 au plus, les plus proches d'abord, et on
 * reprogramme à chaque changement du plan.
 */
export const RAPPELS_EN_ATTENTE_MAX = 60

export type Rappel = {
  id: string
  blocId: string
  /** L'instant d'envoi (ms). */
  quand: number
  titre: string
  corps: string
  /** « Later » et « Tomorrow » sur la notification : seulement pour une tâche ou un objectif. */
  reportable: boolean
}

export function rappelsAProgrammer(a: {
  blocsDuJour: readonly PlacedBlock[]
  confirmes: ReadonlySet<string>
  /** Minuit du jour, en ms (heure locale). */
  minuitMs: number
  maintenantMs: number
}): Rappel[] {
  const out: Rappel[] = []
  for (const b of a.blocsDuJour) {
    if (a.confirmes.has(b.id)) continue
    for (const m of minutesDeRappel(b)) {
      const quand = a.minuitMs + m * 60_000
      if (quand <= a.maintenantMs) continue
      const retard = m - b.startMinute
      out.push({
        id: `rappel-${b.id}-${m}`,
        blocId: b.id,
        quand,
        titre: b.label,
        corps: retard === 0 ? 'It’s time' : `${retard} min late`,
        reportable: reportable(b),
      })
    }
  }
  return out.sort((x, y) => x.quand - y.quand).slice(0, RAPPELS_EN_ATTENTE_MAX)
}

/** Une empreinte stable : on ne reprogramme que si elle change. */
export const empreinteRappels = (r: readonly Rappel[]) => r.map((x) => `${x.id}@${x.quand}`).join('|')
