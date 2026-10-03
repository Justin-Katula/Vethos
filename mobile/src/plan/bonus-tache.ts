import { addDays, daysBetween } from '@shared/planning/dates'
import { bonusALiberer, bonusCible } from '@shared/planning/bonus'
import type { SessionEvent } from '@shared/schemas'
import type { PlanningResult } from '@shared/planning/types'
import type { Tache } from '@/donnees/magasin'

/**
 * Le bonus d'une tâche : quelques minutes de plus, libérées quand le plan a du
 * jeu et que la personne tient ses blocs. Une libération par tâche et par jour
 * au plus ; elle devient du travail normal de la tâche (`minutesBonus`) et le
 * plan la place comme n'importe quel autre bloc. Rien ici ne touche au plancher
 * — ce qui a été demandé.
 */
export type Liberation = { id: string; minutes: number; date: string }

export function liberationsDuJour(args: {
  taches: readonly Tache[]
  resultat: PlanningResult
  events: readonly SessionEvent[]
  /** Minutes travaillées par tâche (journal). */
  fait: Readonly<Record<string, number>>
  today: string
  retardAujourdhui: boolean
}): Liberation[] {
  const ouvertes = args.taches.filter((t) => !t.terminee)
  const racines = ouvertes.filter((t) => t.parentId === null)
  const sorties: Liberation[] = []

  for (const racine of racines) {
    const parties = ouvertes.filter((t) => t.parentId === racine.id)
    const membres = parties.length > 0 ? parties : [racine]
    if (membres.every((m) => m.minutesRestantes + m.minutesSupplementaires <= 0)) continue

    const point = args.resultat.feasibility.densities.find((d) => d.deadline === racine.echeance)
    if (!point) continue

    const ids = new Set(membres.map((m) => m.id))
    const journalLibere = membres.flatMap((m) => m.bonusLibere)
    // Une libération par jour au plus : le reste attend demain.
    if (journalLibere.some((l) => l.date === args.today)) continue

    const depuis = addDays(args.today, -6)
    const libere7j = journalLibere.filter((l) => l.date >= depuis).reduce((s, l) => s + l.minutes, 0)
    const dejaLibere = membres.reduce((s, m) => s + m.minutesBonus, 0)
    const minutesPlancher7j = args.events
      .filter((e) => e.kind === 'task' && ids.has(e.refId) && e.date >= depuis && e.date <= args.today)
      .reduce((s, e) => s + (e.heldMinutes ?? 0), 0)

    // Le plancher entièrement placé : chaque membre a son reste à faire sous un bloc.
    // Une échéance au-delà de l'horizon calculé ne peut pas l'être encore : la
    // densité (déjà sous le seuil du bonus) fait alors foi.
    const finHorizon = args.resultat.capacities.at(-1)?.date ?? args.today
    const plancherPlace = racine.echeance > finHorizon || membres.every((m) => {
      const reste = Math.max(0, m.minutesRestantes + m.minutesSupplementaires - (args.fait[m.id] ?? 0))
      if (reste <= 0) return true
      const verdict = args.resultat.verdicts.find((v) => v.taskId === m.id)
      return (verdict?.placedMinutes ?? 0) >= reste
    })

    const cible = bonusCible({
      workKind: racine.nature === 'nouveau' ? 'novel' : 'routine',
      joursRestants: Math.max(1, daysBetween(args.today, racine.echeance) + 1),
      jeuMinutes: point.capacityMinutes - point.loadMinutes,
      densite: point.density,
    })

    const minutes = bonusALiberer({
      cible,
      dejaLibere,
      events: args.events,
      minutesPlancher7j,
      libere7j,
      plancherPlace,
      retardAujourdhui: args.retardAujourdhui,
    })
    if (minutes <= 0) continue

    // Le bonus va à la partie actionnable : la première encore ouverte.
    const cibleId = [...membres].sort((a, b) => (a.rangPartie ?? 0) - (b.rangPartie ?? 0))[0]!.id
    sorties.push({ id: cibleId, minutes, date: args.today })
  }
  return sorties
}
