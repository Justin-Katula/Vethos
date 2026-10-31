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
  /** La tâche ou l'objectif : l'id d'un bloc peut changer, la référence non. */
  refId: string
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
  /**
   * Les jours suivants, tels que le plan les voit aujourd'hui. Sans eux, qui
   * n'ouvrait pas Vethos un matin n'avait plus aucun rappel ce jour-là. Pour
   * eux : le préavis et l'appel à l'heure, sans la série de relances.
   */
  aVenir?: readonly { minuitMs: number; blocs: readonly PlacedBlock[] }[]
}): Rappel[] {
  // Le rang décide qui garde sa place quand iOS n'en a pas pour tous (60) :
  // l'appel à l'heure de CHAQUE bloc d'abord (sans lui, rien ne dit que c'est
  // l'heure tant que Vethos reste fermé), puis les préavis, puis les relances.
  const out: (Rappel & { rang: number })[] = []
  for (const j of a.aVenir ?? []) {
    for (const b of j.blocs) {
      const cle = `${b.id}-${b.date}`
      const avant = j.minuitMs + (b.startMinute - PREAVIS_MINUTES) * 60_000
      if (b.startMinute >= PREAVIS_MINUTES && avant > a.maintenantMs) {
        out.push({ id: `rappel-${cle}-avant`, blocId: b.id, refId: b.refId, quand: avant, titre: b.label, corps: `Starts in ${PREAVIS_MINUTES} min`, reportable: reportable(b), avant: true, rang: b.kind === 'ancre' ? 0 : 1 })
      }
      if (b.kind === 'ancre') continue
      const quand = j.minuitMs + b.startMinute * 60_000
      if (quand > a.maintenantMs) {
        out.push({ id: `rappel-${cle}-${b.startMinute}`, blocId: b.id, refId: b.refId, quand, titre: b.label, corps: 'It’s time. Not started yet — tap I’m starting.', reportable: reportable(b), rang: 0 })
      }
    }
  }
  for (const b of a.blocsDuJour) {
    if (a.confirmes.has(b.id)) continue
    // 5 min avant : prévenu, pas encore appelé.
    const avant = a.minuitMs + (b.startMinute - PREAVIS_MINUTES) * 60_000
    if (b.startMinute >= PREAVIS_MINUTES && avant > a.maintenantMs) {
      out.push({ id: `rappel-${b.id}-avant`, blocId: b.id, refId: b.refId, quand: avant, titre: b.label, corps: `Starts in ${PREAVIS_MINUTES} min`, reportable: reportable(b), avant: true, rang: b.kind === 'ancre' ? 0 : 1 })
    }
    // Une ancre démarre toute seule : seulement le préavis.
    if (b.kind === 'ancre') continue
    let premierAVenir = true
    for (const m of minutesDeRappel(b)) {
      const quand = a.minuitMs + m * 60_000
      if (quand <= a.maintenantMs) continue
      const retard = m - b.startMinute
      out.push({
        id: `rappel-${b.id}-${m}`,
        blocId: b.id,
        refId: b.refId,
        quand,
        titre: b.label,
        // Sans « I'm starting », rien n'a commencé : le rappel le dit, pour qu'on
        // ne croie jamais être déjà en séance.
        corps: retard === 0 ? 'It’s time. Not started yet — tap I’m starting.' : `${retard} min late. Not started yet — tap I’m starting.`,
        reportable: reportable(b),
        // Le premier rappel encore à venir compte comme l'appel : déjà en retard
        // à l'ouverture, c'est lui qui dit « c'est l'heure ».
        rang: premierAVenir ? 0 : 2,
      })
      premierAVenir = false
    }
  }
  return out
    .sort((x, y) => x.rang - y.rang || x.quand - y.quand)
    .slice(0, RAPPELS_EN_ATTENTE_MAX)
    .sort((x, y) => x.quand - y.quand)
    .map(({ rang: _rang, ...r }) => r)
}

/** Une empreinte stable : on ne reprogramme que si elle change. */
export const empreinteRappels = (r: readonly Rappel[]) => r.map((x) => `${x.id}@${x.quand}`).join('|')

/** Le bouton d'une notification vise-t-il ce bloc ? Par l'id, ou par la tâche (l'id glisse avec l'heure). */
export function memeBloc(enAttente: { id: string; refId: string }, demande: { blocId: string; refId?: string }): boolean {
  return enAttente.id === demande.blocId || (demande.refId !== undefined && demande.refId === enAttente.refId)
}
