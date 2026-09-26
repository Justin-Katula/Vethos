import type { LearningState } from '@shared/schemas'
import type { PlanningInput, PlanningResult } from './types'
import { computePlan } from './engine'
import { addDays, datesBetween, startOfWeek } from './dates'
import { phaseHabitude } from './habitudes'
import { HIGH_UTILIZATION_PERCENT } from './rest'

// ═══ JOURS LIBRES (spec moteur 2026-09-25) ═══════════════════════════════
//
// Du repos permis par l'avance, jamais une récompense. L'app propose, la
// personne prend le jour ou garde sa journée normale. « Sans impacter la
// suite » n'est pas une promesse : c'est le recalcul complet du moteur, avec
// ce jour à zéro, qui le prouve.

/** Les jours libres pris (les seuls que le moteur doit vider). */
export function joursLibresPris(learning: Pick<LearningState, 'freeDays'>): string[] {
  return Object.entries(learning.freeDays ?? {})
    .filter(([, d]) => d === 'taken')
    .map(([date]) => date)
}

const travailDuJour = (plan: PlanningResult, date: string) =>
  plan.blocks.filter((b) => b.date === date && b.kind !== 'ancre').reduce((t, b) => t + b.workMinutes, 0)

/**
 * Le jour libre proposable cette semaine, ou null. Un seul par semaine
 * calendaire ; seulement si toutes les habitudes du jour (objectifs, ancres)
 * sont en phase 3 ou 4 ; et seulement si le plan recalculé avec ce jour vide
 * garde : toutes les tâches aussi bien placées, chaque objectif aussi bien
 * servi sur la semaine, aucun jour au-dessus du seuil de fatigue, jamais plus
 * de 2 séances par objectif et par jour. Parmi les jours qui passent, celui
 * qui demande de déplacer le moins de travail.
 */
export function jourLibrePropose(args: {
  input: PlanningInput
  learning: Pick<LearningState, 'freeDays' | 'sessionEvents'>
  plan: PlanningResult
  now: Date
}): string | null {
  const { input, learning, plan } = args
  const decisions = learning.freeDays ?? {}
  const debut = startOfWeek(input.today)
  const fin = addDays(debut, 6)
  if (datesBetween(debut, fin).some((d) => decisions[d] === 'taken')) return null

  const events = learning.sessionEvents ?? []
  const pris = joursLibresPris(learning)
  const candidats = datesBetween(addDays(input.today, 1), fin)
    .filter((d) => d <= input.rangeEnd && decisions[d] === undefined && travailDuJour(plan, d) > 0)
    .filter((d) =>
      plan.blocks
        .filter((b) => b.date === d && (b.kind === 'objective' || b.kind === 'ancre'))
        .every((b) => phaseHabitude(events, b.refId) >= 3),
    )
    .sort((a, b) => travailDuJour(plan, a) - travailDuJour(plan, b))

  const servi = (p: PlanningResult, id: string) =>
    p.blocks.filter((b) => b.kind === 'objective' && b.refId === id && b.date >= debut && b.date <= fin).reduce((t, b) => t + b.workMinutes, 0)

  for (const jour of candidats) {
    const essai = computePlan({ ...input, freeDays: [...pris, jour] }, args.now)
    const tachesTenues = essai.verdicts.every(
      (v) => v.placedMinutes >= (plan.verdicts.find((x) => x.taskId === v.taskId)?.placedMinutes ?? 0),
    )
    const densiteOk = essai.feasibility.densities.every((d) => d.feasible)
    const objectifsTenus = input.objectives.every((o) => servi(essai, o.id) >= servi(plan, o.id))
    const sousFatigue = essai.capacities
      .filter((c) => !c.freeDay)
      .every((c) => travailDuJour(essai, c.date) <= (c.effectiveCapacityMinutes * HIGH_UTILIZATION_PERCENT) / 100)
    const seances = new Map<string, number>()
    for (const b of essai.blocks)
      if (b.kind === 'objective') seances.set(`${b.date}|${b.refId}`, (seances.get(`${b.date}|${b.refId}`) ?? 0) + 1)
    const deuxAuPlus = [...seances.values()].every((n) => n <= 2)
    if (tachesTenues && densiteOk && objectifsTenus && sousFatigue && deuxAuPlus) return jour
  }
  return null
}

/** « Saturday is free. » — un constat, jamais « tu l'as mérité ». */
export function messageJourLibre(date: string): string {
  const jour = new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long' })
  return `${jour} is free.`
}
