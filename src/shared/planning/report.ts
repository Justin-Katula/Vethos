import type { LearningState, SessionEvent, StopReason } from '@shared/schemas'
import type { PlacedBlock, PlanningInput, PlanningResult } from './types'
import { addDays, startOfWeek } from './dates'
import { debutsLibres, placePourReporter, type Preference } from './trust'
import type { Proposition } from '../coach/arbitre'

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
export function plusTardPermis(l: Pick<LearningState, 'postponements' | 'justifications'>, bloc: Pick<PlacedBlock, 'id' | 'kind'>): boolean {
  if (!reportable(bloc)) return false
  if (bloc.id.startsWith('promesse-report-')) return false
  // Refusé une fois : c'est réglé pour cette séance — pas de seconde chance à tirer au sort.
  if ((l.justifications ?? []).some((j) => j.blockId === bloc.id && j.verdict === 'refuse')) return false
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

const hh = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/**
 * Une proposition du juge (`@shared/coach/arbitre`) traduite en heure réelle —
 * ou la raison, en une phrase, pour laquelle elle ne tient pas. Cette phrase
 * part à l'IA (le message de l'app, jamais compté comme une réponse).
 */
export function optionPourProposition(a: {
  plan: PlanningResult
  today: string
  nowMinute: number
  bloc: Pick<PlacedBlock, 'kind' | 'refId'>
  /** L'empreinte du rattrapage, en minutes. */
  span: number
  deadline?: string | null
  proposition: Proposition
  journeePossible: boolean
}): { ok: true; option: OptionPlusTard | 'journee' } | { ok: false; raison: string } {
  if (a.bloc.kind !== 'task' && a.bloc.kind !== 'objective') return { ok: false, raison: 'This session cannot be moved.' }
  const kind = a.bloc.kind
  const demain = addDays(a.today, 1)
  const p = a.proposition
  if (p.type === 'all_tomorrow') {
    return a.journeePossible ? { ok: true, option: 'journee' } : { ok: false, raison: 'Moving all of today to tomorrow is not possible: already used this week, or tomorrow cannot hold it.' }
  }
  if (p.type === 'tomorrow') {
    if (a.deadline && a.deadline < demain) return { ok: false, raison: 'Tomorrow is past the deadline.' }
    const d = debutsLibres(a.plan, demain, a.span, kind, a.bloc.refId, 0, 1440)[0]
    return d === undefined ? { ok: false, raison: 'Tomorrow has no free time for it.' } : { ok: true, option: { date: demain, startMinute: d } }
  }
  const cible = Math.ceil((a.nowMinute + p.minutes) / 5) * 5
  const d = debutsLibres(a.plan, a.today, a.span, kind, a.bloc.refId, cible, 1440)[0]
  if (d !== undefined && d - cible <= 30) return { ok: true, option: { date: a.today, startMinute: d } }
  const libres = debutsLibres(a.plan, a.today, a.span, kind, a.bloc.refId, Math.ceil((a.nowMinute + 15) / 5) * 5, 1440).slice(0, 3)
  return {
    ok: false,
    raison: `Nothing free in ${p.minutes} min (around ${hh(cible)}).${libres.length ? ` Free starts today: ${libres.map(hh).join(', ')}.` : ' Nothing else free today.'}`,
  }
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

/**
 * Le mot qui explique le report est OBLIGATOIRE : sans lui, Vethos considère
 * qu'on n'a pas vraiment besoin de repousser — seul « Je commence » reste.
 * Quelques mots au moins, pas une lettre au hasard.
 */
export const TEXTE_MIN_CARACTERES = 10
export const texteSuffisant = (texte: string | undefined | null) => (texte ?? '').trim().length >= TEXTE_MIN_CARACTERES

/**
 * La trace d'un report dans le journal des séances : un arrêt à 0 minute,
 * jamais commencé, verdict « postponed ». C'est elle qui fait compter la raison
 * dans l'apprentissage (fiabilité, raisons anormales, « imprévu » trop
 * fréquent = évitement), comme celle d'un Stop. Sans `promiseId` : une trace
 * liée à une promesse n'est pas apprenable (`apprenable`).
 */
export function evenementDuReport(a: {
  bloc: Pick<PlacedBlock, 'id' | 'kind' | 'refId' | 'startMinute' | 'workMinutes'> & { category?: string }
  date: string
  raison: StopReason
  texte?: string
  raisonTexte?: StopReason | null
  answerMs?: number
  attemptsBefore: number
  niveau?: number
  nowIso: string
}): SessionEvent {
  return {
    blockId: a.bloc.id,
    date: a.date,
    kind: a.bloc.kind as SessionEvent['kind'],
    refId: a.bloc.refId,
    category: (a.bloc.category ?? 'général').slice(0, 60),
    plannedStartMinute: a.bloc.startMinute,
    plannedMinutes: Math.max(1, Math.min(1440, a.bloc.workMinutes)),
    started: false,
    delayMinutes: null,
    spontaneous: false,
    heldMinutes: 0,
    stoppedEarly: true,
    stop: {
      reason: a.raison,
      ...(a.texte ? { text: a.texte.slice(0, 500) } : {}),
      ...(a.raisonTexte ? { textReason: a.raisonTexte } : {}),
      ...(a.answerMs !== undefined ? { answerMs: Math.max(0, Math.round(a.answerMs)) } : {}),
      attemptsBefore: a.attemptsBefore,
      ...(a.niveau ? { level: a.niveau } : {}),
      verdict: 'postponed',
    },
    blockedAttempts: 0,
    load48hMinutes: 0,
    createdAt: a.nowIso,
  }
}

/** Un report vient-il d'avant le début (Later / Tomorrow) ? */
export const reportAvantDebut = (e: Pick<SessionEvent, 'started' | 'stop'>) => !e.started && e.stop?.verdict === 'postponed'
