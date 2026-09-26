import type { EmergencyPause, LearningState, SessionConfirmationsState, SessionEvent, SessionPromise, StopReason } from '@shared/schemas'
import type { PlanningInput, PlanningResult } from './types'
import { GAMMA } from './bayes'
import { RAISONS, raisonConcorde } from './arrets'
import { addDays, startOfWeek } from './dates'
import { mergeIntervals } from './capacity'
import { TOLERANCE_DEPART_MINUTES } from './habitudes'
import { applyStop } from './clock'

// ═══ STOP, PROMESSES ET CONFIANCE (spec moteur 2026-09-25) ═══════════════
//
// L'app ne croit pas l'utilisateur sur parole : elle vérifie par les actes.
// Un Stop repousse le travail, il ne l'efface jamais, et la confiance se
// gagne en tenant ses promesses. La méfiance est dans les règles — les mêmes
// pour tout le monde —, jamais dans les mots : pas de sermon.

// ─── Confiance et niveaux ────────────────────────────────────────────────

export type Niveau = 1 | 2 | 3 | 4

/** Confiance = moyenne de Beta(succès + 2, échecs + 1) : 2/3 au départ, niveau 2. */
export function confiance(t: LearningState['trust'] | undefined): number {
  const s = t?.successes ?? 0
  const f = t?.failures ?? 0
  return (s + 2) / (s + f + 3)
}

export function niveauConfiance(t: LearningState['trust'] | undefined): Niveau {
  const c = confiance(t)
  return c >= 0.85 ? 1 : c >= 0.6 ? 2 : c >= 0.4 ? 3 : 4
}

/**
 * Le délai avant que le Stop ne s'ouvre, en secondes. Un délai avec un bouton
 * pour renoncer a réduit de 57 % les ouvertures ciblées (one sec) ; le message
 * de réflexion, lui, ne servait à rien — donc pas de texte pendant le délai.
 */
export const DELAI_STOP_SECONDES: Record<Niveau, number> = { 1: 0, 2: 60, 3: 120, 4: 300 }

/** Rattrapage au niveau 4 : dans les 24 h. */
export const RATTRAPAGE_MAX_HEURES_NIVEAU_4 = 24

export type EffetConfiance = 'succes' | 'echec' | 'echecGrave'

/** Même oubli progressif que les autres lois Beta ; un échec grave compte double. */
export function ajusterConfiance(learning: LearningState, effet: EffetConfiance): LearningState {
  const t = learning.trust ?? { successes: 0, failures: 0 }
  const s = t.successes * GAMMA + (effet === 'succes' ? 1 : 0)
  const f = t.failures * GAMMA + (effet === 'echec' ? 1 : effet === 'echecGrave' ? 2 : 0)
  return { ...learning, trust: { successes: s, failures: f } }
}

// ─── Le Stop : raison, contre-offre, verdict ─────────────────────────────

export type Verdict = 'postponed' | 'abandoned' | 'no-room'

/** Ce qu'on compare à la raison dite : des faits de la séance, rien d'autre. */
export type FaitsDuStop = {
  heldMinutes: number
  plannedMinutes: number
  /** Tentatives d'apps bloquées dans les 10 dernières minutes. */
  attemptsBefore: number
  kind: SessionEvent['kind']
  nowMinute: number
  /** Heures dormies la nuit dernière, si l'horaire le dit. */
  sleptHours?: number | null
}

const heure = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`

/** Ce que le comportement ressemble plutôt, quand la raison ne colle pas. */
function plutot(f: FaitsDuStop): string {
  if (f.attemptsBefore > 0) return 'distraction'
  if (f.heldMinutes < 10) return 'avoidance'
  if (f.heldMinutes / Math.max(1, f.plannedMinutes) > 0.5) return 'fatigue'
  return 'a slump'
}

/** Les minutes de plus que propose la contre-offre. */
export const CONTRE_OFFRE_MINUTES = 10

/**
 * La contre-offre (niveaux 3 et 4), seulement quand la raison ne colle pas au
 * comportement : la raison, puis les chiffres, puis 10 minutes de plus. À
 * refuser explicitement. Jamais une accusation — une comparaison.
 */
export function contreOffre(raison: StopReason, f: FaitsDuStop): string | null {
  if (raison === 'real-event' || raisonConcorde(f, raison)) return null
  const faits = [`It’s ${heure(f.nowMinute)}`]
  if (f.sleptHours != null) faits.push(`you slept ${Math.round(f.sleptHours)} h`)
  if (f.attemptsBefore > 0)
    faits.push(`you tried to open a blocked app ${f.attemptsBefore} time${f.attemptsBefore > 1 ? 's' : ''} in 10 min`)
  else faits.push(`you held ${f.heldMinutes} of ${f.plannedMinutes} min`)
  const liste = faits.length > 2 ? `${faits.slice(0, -1).join(', ')}, and ${faits.at(-1)}` : faits.join(', and ')
  return `You say ${RAISONS[raison].libelle.toLowerCase()}. ${liste}. That looks more like ${plutot(f)}. ${CONTRE_OFFRE_MINUTES} more minutes.`
}

/**
 * C'est le moteur qui tranche, jamais l'IA.
 * - pas de place : le recalcul ne garde pas la semaine faisable ;
 * - report : il y a la place, et la raison colle (ou niveau 1) ;
 * - abandon : il y a la place, mais la raison ne colle pas, ou la
 *   contre-offre a été refusée. Le travail reste dû dans les deux cas.
 */
export function verdictStop(a: {
  niveau: Niveau
  place: boolean
  raison: StopReason | null
  faits: FaitsDuStop
  contreOffreRefusee?: boolean
}): Verdict {
  if (!a.place) return 'no-room'
  if (a.niveau === 1) return 'postponed'
  if (a.contreOffreRefusee) return 'abandoned'
  if (a.raison === null) return 'abandoned'
  return raisonConcorde(a.faits, a.raison) ? 'postponed' : 'abandoned'
}

/**
 * Un report n'est accepté que si le plan recalculé APRÈS l'arrêt garde la
 * densité ≤ 1 partout, place toute la tâche avant son échéance, et sert la
 * dose de la semaine de l'objectif. La fatigue ne crée pas de temps.
 */
export function placePourReporter(a: {
  plan: PlanningResult
  input: Pick<PlanningInput, 'today' | 'weeklyObjectiveServed'>
  kind: SessionEvent['kind']
  refId: string
}): boolean {
  if (!a.plan.feasibility.densities.every((d) => d.feasible)) return false
  if (a.kind === 'task') {
    const v = a.plan.verdicts.find((x) => x.taskId === a.refId)
    return v === undefined || v.status === 'placed'
  }
  if (a.kind === 'objective') {
    const dose = a.plan.objectiveDoses[a.refId]?.dose
    if (dose === undefined) return true
    const debut = startOfWeek(a.input.today)
    const fin = addDays(debut, 6)
    const prevu = a.plan.blocks
      .filter((b) => b.kind === 'objective' && b.refId === a.refId && b.date >= debut && b.date <= fin)
      .reduce((t, b) => t + b.workMinutes, 0)
    return (a.input.weeklyObjectiveServed[a.refId] ?? 0) + prevu >= dose
  }
  return true
}

/** Pas de place : « Pause de 15 min, puis tu finis. » */
export const MESSAGE_PAS_DE_PLACE = 'No room to postpone. 15-minute break, then you finish.'

// ─── L'urgence, et quand elle compte comme un abandon ────────────────────

/**
 * Au-delà d'un arrêt sur trois en urgence (30 derniers jours, au moins 3
 * arrêts), l'urgence n'est plus une pause : elle compte comme un abandon.
 */
export function urgenceCommeAbandon(learning: Pick<LearningState, 'sessionEvents' | 'emergencyPauses'>, today: string): boolean {
  const depuis = addDays(today, -30)
  const urgences = (learning.emergencyPauses ?? []).filter((p) => p.date >= depuis).length
  const stops = (learning.sessionEvents ?? []).filter((e) => e.date >= depuis && e.stop && e.stoppedEarly).length
  const total = urgences + stops
  return total >= 3 && urgences / total > 1 / 3
}

// ─── Les rattrapages : proposer, promettre, tenir ────────────────────────

export type OptionRattrapage = { date: string; startMinute: number }

const arrondi5 = (m: number) => Math.ceil(m / 5) * 5

/**
 * Les créneaux où tenir la promesse : les trous du plan recalculé (les blocs
 * de la même source n'occupent rien — la promesse les remplace), un par jour,
 * trois au plus. Au niveau 4, dans les 24 h. Une tâche, avant son échéance ;
 * un objectif, dans la semaine.
 */
export function optionsRattrapage(a: {
  plan: PlanningResult
  today: string
  nowMinute: number
  minutes: number
  kind: 'task' | 'objective'
  refId: string
  niveau: Niveau
  deadline?: string | null
}): OptionRattrapage[] {
  const demain = addDays(a.today, 1)
  const limite =
    a.niveau === 4 ? demain : a.kind === 'task' && a.deadline ? a.deadline : addDays(startOfWeek(a.today), 6)
  const options: OptionRattrapage[] = []
  for (const c of a.plan.capacities) {
    if (options.length >= 3) break
    if (c.date > limite || c.freeDay) continue
    const occupe = a.plan.blocks
      .filter((b) => b.date === c.date && !(b.kind === a.kind && b.refId === a.refId))
      .map((b) => ({ start: b.startMinute, end: b.endMinute }))
    const pris = mergeIntervals(occupe)
    const plancher = c.date === a.today ? arrondi5(a.nowMinute + 15) : 0
    const plafond = a.niveau === 4 && c.date === demain ? a.nowMinute : 1440
    let trouve: number | null = null
    for (const s of c.slots) {
      let debut = Math.max(arrondi5(s.startMinute), plancher)
      const fin = Math.min(s.endMinute, plafond + a.minutes)
      for (const p of pris) {
        if (p.end <= debut || p.start >= debut + a.minutes) continue
        debut = arrondi5(p.end)
      }
      if (debut + a.minutes <= fin && debut <= plafond) {
        trouve = debut
        break
      }
    }
    if (trouve !== null) options.push({ date: c.date, startMinute: trouve })
  }
  return options
}

export function creerPromesse(
  learning: LearningState,
  p: Omit<SessionPromise, 'status' | 'label'> & { label?: string },
): LearningState {
  const promesse: SessionPromise = { ...p, label: (p.label ?? '').slice(0, 200), status: 'pending' }
  return { ...learning, promises: [...(learning.promises ?? []), promesse].slice(-300) }
}

export const idBlocPromesse = (id: string) => `promesse-${id}`

/** Les promesses encore à tenir, telles que le moteur les pose. */
export function promessesAPoser(learning: Pick<LearningState, 'promises'>): NonNullable<PlanningInput['promises']> {
  return (learning.promises ?? [])
    .filter((p) => p.status === 'pending')
    .map((p) => ({ id: p.id, kind: p.kind, refId: p.refId, date: p.date, startMinute: p.startMinute, minutes: p.minutes }))
}

function majPromesse(learning: LearningState, id: string, f: (p: SessionPromise) => SessionPromise): LearningState {
  return { ...learning, promises: (learning.promises ?? []).map((p) => (p.id === id ? f(p) : p)) }
}

/**
 * Le suivi des promesses, à chaque tic. Tenue : la séance s'est refermée
 * d'elle-même (il n'y a pas de Stop). Rompue : jamais démarrée avant la fin
 * de sa fenêtre, ou pas revenu du souffle avant la fin. Tenue = +1 succès ;
 * rompue = échec grave.
 */
export function suivrePromesses(
  learning: LearningState,
  confirmations: SessionConfirmationsState,
  today: string,
  nowMinute: number,
): LearningState {
  let l = learning
  for (const p of learning.promises ?? []) {
    if (p.status !== 'pending') continue
    const blockId = idBlocPromesse(p.id)
    if (p.date < today) {
      l = ajusterConfiance(majPromesse(l, p.id, (x) => ({ ...x, status: 'broken' })), 'echecGrave')
      continue
    }
    if (p.date > today || confirmations.date !== today) continue
    const confirmee = blockId in confirmations.confirmedAt
    const e = (l.sessionEvents ?? []).find((x) => x.blockId === blockId && x.date === today)
    if (confirmee && e && p.startedMinute === undefined) {
      const debut = e.plannedStartMinute + (e.delayMinutes ?? 0)
      l = majPromesse(l, p.id, (x) => ({ ...x, startedMinute: debut }))
    }
    if (confirmee && e && e.heldMinutes !== null) {
      const tenue = confirmations.awaitingReturn?.blockId !== blockId
      l = ajusterConfiance(majPromesse(l, p.id, (x) => ({ ...x, status: tenue ? 'kept' : 'broken' })), tenue ? 'succes' : 'echecGrave')
      continue
    }
    const souffleAvant = p.breather?.phase === 'before' ? p.breather.minutes : 0
    if (!confirmee && nowMinute >= p.startMinute + p.minutes + souffleAvant) {
      l = ajusterConfiance(majPromesse(l, p.id, (x) => ({ ...x, status: 'broken' })), 'echecGrave')
    }
  }
  return l
}

/** Le souffle est pris : avant la séance, elle glisse de 15 min ; pendant, c'est une pause. */
export const SOUFFLE_MINUTES = 15

/**
 * « J'ai besoin de 15 min » AVANT la promesse : une fois, et la séance
 * commence 15 min plus tard. Rend null si le souffle est déjà pris.
 */
export function souffleAvant(learning: LearningState, promiseId: string): LearningState | null {
  const p = (learning.promises ?? []).find((x) => x.id === promiseId)
  if (!p || p.status !== 'pending' || p.breather) return null
  return majPromesse(learning, promiseId, (x) => ({
    ...x,
    startMinute: Math.min(1439 - x.minutes, x.startMinute + SOUFFLE_MINUTES),
    breather: { phase: 'before', minutes: SOUFFLE_MINUTES },
  }))
}

/**
 * Le retour du souffle « avant » : la confirmation dit l'heure réelle. Dans
 * la tolérance, aucun effet ; en retard, +1 échec.
 */
export function retourDuSouffleAvant(learning: LearningState, promiseId: string, confirmationMinute: number): LearningState {
  const p = (learning.promises ?? []).find((x) => x.id === promiseId)
  if (!p || p.breather?.phase !== 'before' || p.breather.lateMinutes !== undefined) return learning
  const retard = Math.max(0, confirmationMinute - p.startMinute)
  const l = majPromesse(learning, promiseId, (x) => ({ ...x, breather: { ...x.breather!, lateMinutes: retard } }))
  return retard > TOLERANCE_DEPART_MINUTES ? ajusterConfiance(l, 'echec') : l
}

export const promesseDuBloc = (learning: Pick<LearningState, 'promises'>, blockId: string): SessionPromise | undefined =>
  (learning.promises ?? []).find((p) => idBlocPromesse(p.id) === blockId)

// ─── Les pauses : urgence, souffle, pas de place ─────────────────────────

/** 15 min au plus, pour les trois. */
export const PAUSE_MINUTES = 15
/** Jusqu'à 3 apps débloquées pendant une urgence ; une 4e est refusée. */
export const URGENCE_APPS_MAX = 3

type Pause = NonNullable<SessionConfirmationsState['pause']>

function soustraire(ranges: SessionConfirmationsState['workCreditedRanges'], start: number, end: number) {
  const out: SessionConfirmationsState['workCreditedRanges'] = []
  for (const r of ranges) {
    if (r.end <= start || r.start >= end) out.push(r)
    else {
      if (r.start < start) out.push({ start: r.start, end: start })
      if (r.end > end) out.push({ start: end, end: r.end })
    }
  }
  return out
}

/**
 * Met la séance en pause, sans jamais l'arrêter : la fenêtre s'allonge de la
 * pause, et ses minutes sont réservées pour ne jamais compter comme du
 * travail. `limiteMinute` : la marge avant le sommeil — on ne la franchit
 * jamais ; ce qui ne tient plus devient un déficit chiffré.
 */
export function ouvrirPause(
  confirmations: SessionConfirmationsState,
  a: { kind: Pause['kind']; nowMinute: number; nowMs: number; apps?: string[]; limiteMinute?: number | null },
): SessionConfirmationsState | null {
  const o = confirmations.observedPending
  if (!o || !(o.blockId in confirmations.confirmedAt)) return null
  if ((confirmations.stoppedBlockIds ?? []).includes(o.blockId)) return null
  if (confirmations.pause || a.nowMinute >= o.endMinute) return null
  if ((a.apps?.length ?? 0) > URGENCE_APPS_MAX) return null
  const fin = Math.min(1440, a.nowMinute + PAUSE_MINUTES)
  const duree = fin - a.nowMinute
  const plafond = a.limiteMinute ?? 1440
  const finFenetre = Math.min(plafond, o.endMinute + duree)
  const perdu = o.endMinute + duree - finFenetre
  const travail = Math.max(0, (o.workMinutes ?? o.endMinute - o.startMinute) + duree - perdu)
  return {
    ...confirmations,
    pause: { kind: a.kind, blockId: o.blockId, startMinute: a.nowMinute, endMinute: fin, startMs: a.nowMs, apps: a.apps ?? [] },
    workCreditedRanges: mergeIntervals([...confirmations.workCreditedRanges, { start: a.nowMinute, end: fin }]),
    observedPending: {
      ...o,
      endMinute: Math.max(fin, finFenetre),
      workMinutes: travail,
      pausedMinutes: (o.pausedMinutes ?? 0) + duree,
    },
  }
}

/**
 * Fin de pause. Plus tôt que prévu (« Je reprends », ou une tentative d'app
 * non choisie) : la part non prise est rendue à la fenêtre. Après un souffle
 * pendant une promesse, la reprise attend une confirmation.
 */
export function fermerPause(confirmations: SessionConfirmationsState, nowMinute: number): SessionConfirmationsState {
  const p = confirmations.pause
  if (!p) return confirmations
  const o = confirmations.observedPending
  const rendu = Math.max(0, p.endMinute - Math.max(p.startMinute, nowMinute))
  const base = { ...confirmations, pause: null }
  const attendre = p.kind === 'breather' && rendu === 0
  const suite = attendre ? { ...base, awaitingReturn: { blockId: p.blockId, sinceMinute: p.endMinute } } : base
  if (!o || o.blockId !== p.blockId || rendu === 0) return suite
  return {
    ...suite,
    workCreditedRanges: soustraire(confirmations.workCreditedRanges, nowMinute, p.endMinute),
    observedPending: {
      ...o,
      endMinute: Math.max(o.startMinute + 1, o.endMinute - rendu),
      workMinutes: Math.max(0, (o.workMinutes ?? o.endMinute - o.startMinute) - rendu),
      pausedMinutes: Math.max(0, (o.pausedMinutes ?? 0) - rendu),
    },
  }
}

/**
 * Pendant qu'on attend le retour d'un souffle, les minutes ne comptent pas
 * comme du travail. Au retour, la fenêtre s'allonge du retard : la promesse
 * est toujours due en entier.
 */
export function attenteDuRetour(confirmations: SessionConfirmationsState, nowMinute: number): SessionConfirmationsState {
  const w = confirmations.awaitingReturn
  if (!w || nowMinute <= w.sinceMinute) return confirmations
  return {
    ...confirmations,
    workCreditedRanges: mergeIntervals([...confirmations.workCreditedRanges, { start: w.sinceMinute, end: nowMinute }]),
  }
}

export function retourDuSouffle(
  learning: LearningState,
  confirmations: SessionConfirmationsState,
  nowMinute: number,
  limiteMinute?: number | null,
): { learning: LearningState; confirmations: SessionConfirmationsState } {
  const w = confirmations.awaitingReturn
  const o = confirmations.observedPending
  if (!w || !o || o.blockId !== w.blockId) return { learning, confirmations: { ...confirmations, awaitingReturn: null } }
  const retard = Math.max(0, nowMinute - w.sinceMinute)
  const reserve = attenteDuRetour(confirmations, nowMinute)
  const fin = Math.min(limiteMinute ?? 1440, o.endMinute + retard)
  const ajoute = fin - o.endMinute
  const p = promesseDuBloc(learning, w.blockId)
  let l = learning
  if (p) l = majPromesse(l, p.id, (x) => ({ ...x, breather: { phase: 'during', minutes: SOUFFLE_MINUTES, lateMinutes: retard } }))
  if (retard > TOLERANCE_DEPART_MINUTES) l = ajusterConfiance(l, 'echec')
  return {
    learning: l,
    confirmations: {
      ...reserve,
      awaitingReturn: null,
      observedPending: {
        ...o,
        endMinute: fin,
        workMinutes: Math.max(0, (o.workMinutes ?? o.endMinute - o.startMinute) + ajoute),
        pausedMinutes: (o.pausedMinutes ?? 0) + retard,
      },
    },
  }
}

/** Le souffle PENDANT est-il encore disponible pour ce bloc ? Une fois par rattrapage. */
export function souffleDisponible(learning: Pick<LearningState, 'promises'>, blockId: string): boolean {
  const p = promesseDuBloc(learning, blockId)
  return p !== undefined && p.status === 'pending' && p.breather === undefined
}

/** Le souffle PENDANT : marqué sur la promesse, puis la pause. */
export function prendreSouffle(
  learning: LearningState,
  confirmations: SessionConfirmationsState,
  nowMinute: number,
  nowMs: number,
  limiteMinute?: number | null,
): { learning: LearningState; confirmations: SessionConfirmationsState } | null {
  const o = confirmations.observedPending
  if (!o || !souffleDisponible(learning, o.blockId)) return null
  const c = ouvrirPause(confirmations, { kind: 'breather', nowMinute, nowMs, limiteMinute: limiteMinute ?? null })
  if (!c) return null
  const p = promesseDuBloc(learning, o.blockId)!
  return { learning: majPromesse(learning, p.id, (x) => ({ ...x, breather: { phase: 'during', minutes: SOUFFLE_MINUTES } })), confirmations: c }
}

// ─── La pause d'urgence ──────────────────────────────────────────────────

/**
 * « Something real came up » : la séance se met en pause, elle ne s'arrête
 * jamais. Jusqu'à 3 apps débloquées, choisies au début.
 */
export function ouvrirUrgence(
  learning: LearningState,
  confirmations: SessionConfirmationsState,
  a: { nowMinute: number; nowMs: number; apps: string[]; appCount?: number; limiteMinute?: number | null },
): { learning: LearningState; confirmations: SessionConfirmationsState } | null {
  const count = a.appCount ?? a.apps.length
  if (count > URGENCE_APPS_MAX) return null
  const c = ouvrirPause(confirmations, { kind: 'emergency', nowMinute: a.nowMinute, nowMs: a.nowMs, apps: a.apps, limiteMinute: a.limiteMinute ?? null })
  if (!c) return null
  const trace: EmergencyPause = {
    date: confirmations.date,
    blockId: c.pause!.blockId,
    startMs: a.nowMs,
    apps: a.apps.slice(0, URGENCE_APPS_MAX),
    appCount: count,
    attempts: 0,
  }
  return {
    learning: { ...learning, emergencyPauses: [...(learning.emergencyPauses ?? []), trace].slice(-300) },
    confirmations: c,
  }
}

/**
 * Fin de l'urgence. Retour volontaire avant 15 min sans tentative : +1
 * succès. 15 min écoulées sans tentative : aucun effet. Tentative d'ouvrir
 * une app non choisie : échec grave, reprise immédiate.
 */
export function finUrgence(
  learning: LearningState,
  confirmations: SessionConfirmationsState,
  a: { nowMinute: number; nowMs: number; end: 'voluntary' | 'auto' | 'attempt' },
): { learning: LearningState; confirmations: SessionConfirmationsState } {
  const p = confirmations.pause
  if (!p || p.kind !== 'emergency') return { learning, confirmations }
  const pauses = [...(learning.emergencyPauses ?? [])]
  const i = pauses.map((x, k) => (x.blockId === p.blockId && x.startMs === p.startMs ? k : -1)).reduce((m, k) => Math.max(m, k), -1)
  const tentatives = (i >= 0 ? pauses[i]!.attempts : 0) + (a.end === 'attempt' ? 1 : 0)
  if (i >= 0) pauses[i] = { ...pauses[i]!, endMs: a.nowMs, end: a.end, attempts: tentatives }
  let l: LearningState = { ...learning, emergencyPauses: pauses }
  if (a.end === 'attempt') l = ajusterConfiance(l, 'echecGrave')
  else if (a.end === 'voluntary' && a.nowMinute < p.endMinute && tentatives === 0) l = ajusterConfiance(l, 'succes')
  return { learning: l, confirmations: fermerPause(confirmations, a.nowMinute) }
}

/**
 * Le tic des pauses : une pause échue se ferme toute seule (le blocage
 * revient, sans confirmation), et l'attente d'un retour réserve ses minutes.
 */
export function ticPauses(
  learning: LearningState,
  confirmations: SessionConfirmationsState,
  nowMinute: number,
  nowMs: number,
): { learning: LearningState; confirmations: SessionConfirmationsState; change: boolean } {
  let l = learning
  let c = confirmations
  const p = c.pause
  if (p && nowMinute >= p.endMinute) {
    if (p.kind === 'emergency') ({ learning: l, confirmations: c } = finUrgence(l, c, { nowMinute, nowMs, end: 'auto' }))
    else c = fermerPause(c, nowMinute)
  }
  c = attenteDuRetour(c, nowMinute)
  return { learning: l, confirmations: c, change: l !== learning || c !== confirmations }
}

/** Pas de Stop dans un rattrapage, ni dans une reprise forcée. */
export function stopPermis(learning: Pick<LearningState, 'sessionEvents' | 'promises'>, confirmations: SessionConfirmationsState): boolean {
  const o = confirmations.observedPending
  if (!o) return false
  if (promesseDuBloc(learning, o.blockId)) return false
  const e = (learning.sessionEvents ?? []).find((x) => x.blockId === o.blockId && x.date === confirmations.date)
  return !e?.forced && !e?.promiseId
}

/** La séance reprend de force après un « pas de place » : elle sort de l'apprentissage. */
export function marquerForcee(learning: LearningState, date: string, blockId: string): LearningState {
  return {
    ...learning,
    sessionEvents: (learning.sessionEvents ?? []).map((e) => (e.blockId === blockId && e.date === date ? { ...e, forced: true } : e)),
  }
}

/** « Je continue » pendant le délai : un Stop renoncé, gardé au journal. */
export function renoncerAuStop(learning: LearningState, date: string, blockId: string): LearningState {
  return {
    ...learning,
    sessionEvents: (learning.sessionEvents ?? []).map((e) =>
      e.blockId === blockId && e.date === date ? { ...e, stopsWaived: (e.stopsWaived ?? 0) + 1 } : e,
    ),
  }
}

/** Le verdict et le niveau, écrits sur l'arrêt au journal. */
export function noterVerdict(learning: LearningState, date: string, blockId: string, niveau: Niveau, verdict: Verdict): LearningState {
  return {
    ...learning,
    sessionEvents: (learning.sessionEvents ?? []).map((e) =>
      e.blockId === blockId && e.date === date && e.stop ? { ...e, stop: { ...e.stop, level: niveau, verdict } } : e,
    ),
  }
}

// ─── Le Stop, de bout en bout ────────────────────────────────────────────

export type EtapeStop =
  /** Niveaux 3-4 : la contre-offre, à refuser explicitement (rien n'est arrêté). */
  | { etape: 'contre-offre'; message: string }
  /** Pas de place : pause de 15 min, puis on finit (rien n'est arrêté). */
  | { etape: 'pas-de-place'; learning: LearningState; confirmations: SessionConfirmationsState; message: string }
  /** Arrêté : le verdict, et les créneaux où promettre le reste. */
  | {
      etape: 'arrete'
      learning: LearningState
      confirmations: SessionConfirmationsState
      verdict: Verdict | null
      options: OptionRattrapage[]
      /** Minutes à rattraper ; 0 = rien à promettre. */
      minutes: number
    }

/**
 * Tout ce que « Stop » décide, dans l'ordre de la spec. `planApres` recalcule
 * la semaine comme si l'arrêt était accepté (même logique que E.5) : c'est le
 * seul juge de la place.
 */
export function deciderStop(a: {
  learning: LearningState
  confirmations: SessionConfirmationsState
  nowMs: number
  /** La minute où le Stop a vraiment eu lieu (après le délai). */
  minute: number
  reason: StopReason | null
  text?: string
  answerMs?: number
  attemptsBefore?: number
  textReason?: StopReason | null
  contreOffreRefusee?: boolean
  sleptHours?: number | null
  /** Coucher du jour, pour la marge de 30 min de la reprise forcée. */
  coucher?: number | null
  deadline?: string | null
  planApres: (learning: LearningState, confirmations: SessionConfirmationsState) => {
    plan: PlanningResult
    input: Pick<PlanningInput, 'today' | 'weeklyObjectiveServed'>
  }
}): EtapeStop | null {
  const o = a.confirmations.observedPending
  if (!o || !stopPermis(a.learning, a.confirmations)) return null
  const niveau = niveauConfiance(a.learning.trust)
  const essai = applyStop({
    learning: a.learning,
    confirmations: a.confirmations,
    nowMs: a.nowMs,
    minute: a.minute,
    reason: a.reason,
    ...(a.text !== undefined ? { text: a.text } : {}),
    ...(a.answerMs !== undefined ? { answerMs: a.answerMs } : {}),
    attemptsBefore: a.attemptsBefore ?? 0,
    textReason: a.textReason ?? null,
  })
  if (!essai) return null
  const date = a.confirmations.date
  const e = (essai.learning.sessionEvents ?? []).find((x) => x.blockId === o.blockId && x.date === date)
  // Dans une prolongation, ou sur une ancre : la fin, sans verdict ni promesse.
  if (o.kind === 'ancre' || !e?.stoppedEarly) {
    return { etape: 'arrete', learning: essai.learning, confirmations: essai.confirmations, verdict: null, options: [], minutes: 0 }
  }

  const { plan, input } = a.planApres(essai.learning, essai.confirmations)
  const place = placePourReporter({ plan, input, kind: o.kind, refId: o.refId })
  const faits: FaitsDuStop = {
    heldMinutes: essai.heldMinutes,
    plannedMinutes: e.plannedMinutes,
    attemptsBefore: a.attemptsBefore ?? 0,
    kind: o.kind,
    nowMinute: a.minute,
    ...(a.sleptHours !== undefined ? { sleptHours: a.sleptHours } : {}),
  }

  if (!place) {
    const limite = a.coucher != null ? a.coucher - 30 : null
    const pause = ouvrirPause(a.confirmations, { kind: 'no-room', nowMinute: a.minute, nowMs: a.nowMs, limiteMinute: limite })
    if (pause) {
      let l = marquerForcee(a.learning, date, o.blockId)
      l = {
        ...l,
        sessionEvents: (l.sessionEvents ?? []).map((x) =>
          x.blockId === o.blockId && x.date === date
            ? { ...x, stop: { reason: a.reason, attemptsBefore: a.attemptsBefore ?? 0, level: niveau, verdict: 'no-room' as const } }
            : x,
        ),
      }
      return { etape: 'pas-de-place', learning: l, confirmations: pause, message: MESSAGE_PAS_DE_PLACE }
    }
  }

  if (niveau >= 3 && a.contreOffreRefusee === undefined && a.reason !== null) {
    const message = contreOffre(a.reason, faits)
    if (message) return { etape: 'contre-offre', message }
  }

  const verdict = verdictStop({ niveau, place: true, raison: a.reason, faits, ...(a.contreOffreRefusee ? { contreOffreRefusee: true } : {}) })
  const learning = noterVerdict(essai.learning, date, o.blockId, niveau, verdict)
  const minutes = Math.max(0, e.plannedMinutes - essai.heldMinutes)
  const options =
    minutes >= 5 && (o.kind === 'task' || o.kind === 'objective')
      ? optionsRattrapage({ plan, today: date, nowMinute: a.minute, minutes, kind: o.kind, refId: o.refId, niveau, deadline: a.deadline ?? null })
      : []
  return { etape: 'arrete', learning, confirmations: essai.confirmations, verdict, options, minutes }
}

/** La contre-offre acceptée : 10 minutes de plus, et un Stop renoncé au journal. */
export const accepterContreOffre = renoncerAuStop

/**
 * Le tic de la confiance, après celui de la pendule : les pauses échues se
 * ferment, l'attente d'un retour réserve ses minutes, les promesses se jugent.
 */
export function ticConfiance(
  learning: LearningState,
  confirmations: SessionConfirmationsState,
  today: string,
  nowMinute: number,
  nowMs: number,
): { learning: LearningState; confirmations: SessionConfirmationsState; change: boolean } {
  const p = ticPauses(learning, confirmations, nowMinute, nowMs)
  const l = suivrePromesses(p.learning, p.confirmations, today, nowMinute)
  return { learning: l, confirmations: p.confirmations, change: p.change || l !== p.learning }
}

// ─── Ce que l'interface reçoit ───────────────────────────────────────────

/** Ce que « Stop » a décidé (spec « Stop, promesses et confiance »). */
export type StopResult =
  | { ok: false; reason: string }
  | { ok: true; step: 'counter-offer'; message: string }
  | { ok: true; step: 'no-room'; message: string }
  | {
      ok: true
      step: 'stopped'
      help?: string
      options: OptionRattrapage[]
      minutes: number
      source: { kind: 'task' | 'objective' | 'ancre'; refId: string; blockId: string }
    }

/** L'état du Stop et des pauses, pour l'interface. */
export type TrustView = {
  level: Niveau
  delaySeconds: number
  stopAllowed: boolean
  pause: { kind: 'emergency' | 'breather' | 'no-room'; endMinute: number } | null
  awaitingReturn: boolean
  emergencyAsAbandon: boolean
  /** « J'ai besoin de 15 min » : pendant la promesse en cours. */
  breatherNow: boolean
  /** Les apps que la séance bloque, pour en débloquer 3 pendant une urgence. */
  sessionApps: Array<{ id: string; name: string }>
}
