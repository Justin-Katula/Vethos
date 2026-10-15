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

/** Le préavis : prévenu 5 min avant l'heure. */
export const PREAVIS_MINUTES = 5

export type Rappel = {
  id: string
  blocId: string
  /** L'instant d'envoi (ms). */
  quand: number
  titre: string
  corps: string
  /** « Later » sur la notification : seulement pour une tâche ou un objectif. */
  reportable: boolean
  /** Le préavis : rien à commencer encore. */
  avant?: boolean
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
    // 5 min avant : prévenu, pas encore appelé.
    const avant = a.minuitMs + (b.startMinute - PREAVIS_MINUTES) * 60_000
    if (b.startMinute >= PREAVIS_MINUTES && avant > a.maintenantMs) {
      out.push({ id: `rappel-${b.id}-avant`, blocId: b.id, quand: avant, titre: b.label, corps: `Starts in ${PREAVIS_MINUTES} min`, reportable: reportable(b), avant: true })
    }
    // Une ancre démarre toute seule : seulement le préavis.
    if (b.kind === 'ancre') continue
    for (const m of minutesDeRappel(b)) {
      const quand = a.minuitMs + m * 60_000
      if (quand <= a.maintenantMs) continue
      const retard = m - b.startMinute
      out.push({
        id: `rappel-${b.id}-${m}`,
        blocId: b.id,
        quand,
        titre: b.label,
        // Sans « I'm starting », rien n'a commencé : le rappel le dit, pour qu'on
        // ne croie jamais être déjà en séance.
        corps: retard === 0 ? 'It’s time. Not started yet — tap I’m starting.' : `${retard} min late. Not started yet — tap I’m starting.`,
        reportable: reportable(b),
      })
    }
  }
  return out.sort((x, y) => x.quand - y.quand).slice(0, RAPPELS_EN_ATTENTE_MAX)
}

/** Une empreinte stable : on ne reprogramme que si elle change. */
export const empreinteRappels = (r: readonly Rappel[]) => r.map((x) => `${x.id}@${x.quand}`).join('|')
