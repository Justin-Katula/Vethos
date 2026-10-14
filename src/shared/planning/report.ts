import type { LearningState, StopReason } from '@shared/schemas'
import type { PlacedBlock, PlanningInput, PlanningResult } from './types'
import { addDays, startOfWeek } from './dates'
import { debutsLibres, placePourReporter, type Preference } from './trust'

// ═══ AVANT DE COMMENCER : BLOCAGE, RAPPELS, REPORTS (décidé le 2026-10-13) ═══
//
// Une séance commence à son heure, que l'utilisateur ouvre Vethos ou non :
// les apps choisies sont écartées dès le début du bloc, et des rappels
// demandent « Je commence ». Sans confirmation, l'écart dure une heure au
// plus, ne compte pas comme du travail, puis s'arrête : la séance est ratée.
//
// Une seule sortie, « Later », qui se demande comme un Stop : la raison
// d'abord (un tap), puis la réaction propre à la raison, puis les heures —
// choisies selon la raison — chacune avec ce que demain devient. Une fois par
// séance. En dernier recours seulement, dans la même liste : « Tomorrow »,
// tout ce qui reste aujourd'hui passe aux jours suivants — si ça tient
// encore, et deux fois par semaine au plus. Jamais un abandon.

/** Sans « Je commence », l'écart dure au plus ça. */
export const BLOCAGE_SANS_CONFIRMATION_MINUTES = 60
/** Un rappel toutes les 3 min… */
export const RAPPEL_INTERVALLE_MINUTES = 3
/** …vingt au plus. */
export const RAPPELS_MAX = 20
/** « Tomorrow » : deux fois par semaine (lundi → dimanche). */
export const REPORTS_JOURNEE_PAR_SEMAINE = 2
/** « Later » propose au plus ce nombre d'heures. */
export const OPTIONS_PLUS_TARD_MAX = 4

/** Ce qui se reporte : les tâches et les objectifs. Une ancre ne s'arrête jamais (elle se décale). */
export const reportable = (bloc: Pick<PlacedBlock, 'kind'>) => bloc.kind === 'task' || bloc.kind === 'objective'

/** La fenêtre d'écart d'un bloc pas encore commencé : son début, une heure au plus. */
export function fenetreSansConfirmation(bloc: Pick<PlacedBlock, 'startMinute' | 'endMinute'>): { debut: number; fin: number } {
  return { debut: bloc.startMinute, fin: Math.min(bloc.endMinute, bloc.startMinute + BLOCAGE_SANS_CONFIRMATION_MINUTES) }
}

/** Les minutes de la journée où rappeler « Je commence » : dès le début, toutes les 3 min, dans la fenêtre. */
export function minutesDeRappel(bloc: Pick<PlacedBlock, 'startMinute' | 'endMinute'>): number[] {
  const { debut, fin } = fenetreSansConfirmation(bloc)
  const out: number[] = []
  for (let k = 0; k < RAPPELS_MAX; k++) {
    const m = debut + k * RAPPEL_INTERVALLE_MINUTES
    if (m >= fin) break
    out.push(m)
  }
  return out
}

const reports = (l: Pick<LearningState, 'postponements'>) => l.postponements ?? []

/** « Later » est-il encore permis pour ce bloc ? Une fois par séance : une séance déjà reportée ne se reporte plus. */
export function plusTardPermis(l: Pick<LearningState, 'postponements'>, bloc: Pick<PlacedBlock, 'id' | 'kind'>): boolean {
  if (!reportable(bloc)) return false
  if (bloc.id.startsWith('promesse-report-')) return false
  return !reports(l).some((r) => r.kind === 'later' && r.blockId === bloc.id)
}

/** Les « Tomorrow » déjà pris cette semaine. */
export function reportsJourneeCetteSemaine(l: Pick<LearningState, 'postponements'>, today: string): number {
  const debut = startOfWeek(today)
  const fin = addDays(debut, 6)
  return reports(l).filter((r) => r.kind === 'day' && r.date >= debut && r.date <= fin).length
}

export const journeeDejaReportee = (l: Pick<LearningState, 'postponements'>, today: string) =>
  reports(l).some((r) => r.kind === 'day' && r.date === today)

/**
 * Ce que les reports retirent d'aujourd'hui : la source d'un « Later » (sa
 * promesse, elle, reste posée), ou tout, après un « Tomorrow ».
 */
export function pliesParReport(l: Pick<LearningState, 'postponements'>, today: string, tousLesRefIds: readonly string[]): string[] {
  if (journeeDejaReportee(l, today)) return [...tousLesRefIds]
  return reports(l).filter((r) => r.kind === 'later' && r.date === today && r.refId).map((r) => r.refId!)
}

export type OptionPlusTard = { date: string; startMinute: number }

/**
 * Les heures proposées pour « Later » : jusqu'à trois aujourd'hui, espacées
 * d'au moins une heure, puis la première demain. Jamais dans le passé (15 min
 * de marge), jamais après l'échéance d'une tâche, jamais par-dessus un autre bloc.
 *
 * La préférence vient de la raison, comme pour un Stop : « fatigué » → demain
 * matin seulement ; « trop dur » → une fenêtre profonde. Rien ne correspond :
 * au plus tôt.
 */
export function optionsPlusTard(a: {
  plan: PlanningResult
  today: string
  nowMinute: number
  bloc: Pick<PlacedBlock, 'kind' | 'refId' | 'workMinutes'>
  deadline?: string | null
  preference?: Preference
}): OptionPlusTard[] {
  if (a.bloc.kind !== 'task' && a.bloc.kind !== 'objective') return []
  const kind = a.bloc.kind
  const span = Math.max(1, a.bloc.workMinutes)
  const chercher = (pref: Preference): OptionPlusTard[] => {
    const filtre = pref === 'profonde' ? (s: { cognitiveWindow: string }) => s.cognitiveWindow === 'PROFONDE' : () => true
    const options: OptionPlusTard[] = []
    if (pref !== 'repose') {
      const plancher = Math.ceil((a.nowMinute + 15) / 5) * 5
      let dernier = -Infinity
      for (const d of debutsLibres(a.plan, a.today, span, kind, a.bloc.refId, plancher, 1440, filtre)) {
        if (options.length >= OPTIONS_PLUS_TARD_MAX - 1) break
        if (d - dernier < 60) continue
        options.push({ date: a.today, startMinute: d })
        dernier = d
      }
    }
    const demain = addDays(a.today, 1)
    if (!a.deadline || a.deadline >= demain) {
      const d = debutsLibres(a.plan, demain, span, kind, a.bloc.refId, 0, pref === 'repose' ? 12 * 60 : 1440, filtre)[0]
      if (d !== undefined) options.push({ date: demain, startMinute: d })
    }
    return options
  }
  const pref = a.preference ?? 'tot'
  const voulu = chercher(pref)
  return voulu.length > 0 || pref === 'tot' ? voulu : chercher('tot')
}

/** Le travail posé un jour donné (tâches et objectifs), en minutes. */
export function travailDuJour(plan: PlanningResult, date: string): number {
  return plan.blocks
    .filter((b) => b.date === date && (b.kind === 'task' || b.kind === 'objective'))
    .reduce((t, b) => t + b.workMinutes, 0)
}

/**
 * « Tomorrow » tient-il ? Le plan recalculé SANS aujourd'hui doit rester
 * faisable partout, chaque tâche placée avant son échéance et chaque objectif
 * servi sur sa semaine. Sinon, on refuse : reporter ce qui ne tient plus
 * serait un abandon déguisé.
 */
export function journeeReportable(a: {
  planApres: PlanningResult
  inputApres: Pick<PlanningInput, 'today' | 'weeklyObjectiveServed' | 'rangeEnd' | 'tasks'>
  refs: readonly { kind: 'task' | 'objective'; refId: string }[]
}): boolean {
  return a.refs.every((r) => placePourReporter({ plan: a.planApres, input: a.inputApres, kind: r.kind, refId: r.refId }))
}

/** Le report « Tomorrow » est-il permis aujourd'hui (hors faisabilité) ? */
export function reportJourneePermis(l: Pick<LearningState, 'postponements'>, today: string): boolean {
  return !journeeDejaReportee(l, today) && reportsJourneeCetteSemaine(l, today) < REPORTS_JOURNEE_PAR_SEMAINE
}

/** Note un report. */
export function noterReport(
  l: LearningState,
  r: { date: string; kind: 'later' | 'day'; blockId?: string; refId?: string; reason?: StopReason },
): LearningState {
  return { ...l, postponements: [...reports(l), r].slice(-300) }
}
