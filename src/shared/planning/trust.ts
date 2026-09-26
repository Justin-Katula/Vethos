import type { EmergencyPause, LearningState, SessionConfirmationsState, SessionEvent, SessionPromise, StopReason } from '@shared/schemas'
import type { PlanningInput, PlanningResult } from './types'
import { GAMMA } from './bayes'
import { RAISONS, raisonConcorde } from './arrets'
import { addDays, daysBetween, startOfWeek } from './dates'
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
 * L'attente entre « Oui, j'arrête » et le déblocage, en minutes : 5, et plus
 * quand la confiance baisse. La séance reste bloquée pendant ce temps, et
 * « Je continue » reste à portée. L'urgence, elle, n'attend pas.
 */
export const ATTENTE_STOP_MINUTES: Record<Niveau, number> = { 1: 5, 2: 5, 3: 10, 4: 15 }

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

// ─── Le Stop : la raison, et ce qu'elle fait faire à l'app ───────────────
//
// Il n'existe pas d'abandon. En créant une tâche, la personne a passé un pacte
// avec l'app : « fais-moi faire ça du début à la fin ». Un Stop déplace le
// travail, il ne le retire jamais. Le moteur ne tranche qu'une chose : y a-t-il
// la place de le repousser ? Sinon, on finit maintenant.

export type Verdict = 'postponed' | 'no-room' | 'urgent'

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
const duree = (m: number) => {
  const v = Math.max(0, Math.round(m))
  return v < 60 ? `${v} min` : `${Math.floor(v / 60)} h${v % 60 ? ` ${String(v % 60).padStart(2, '0')}` : ''}`
}

/** Ce que le comportement ressemble plutôt, quand la raison ne colle pas. */
function plutot(f: FaitsDuStop): string {
  if (f.attemptsBefore > 0) return 'distraction'
  if (f.heldMinutes < 10) return 'avoidance'
  if (f.heldMinutes / Math.max(1, f.plannedMinutes) > 0.5) return 'fatigue'
  return 'a slump'
}

/**
 * La raison comparée aux faits, seulement quand elle ne colle pas. Jamais une
 * accusation : une comparaison.
 */
export function comparaison(raison: StopReason, f: FaitsDuStop): string | null {
  if (raison === 'real-event' || raisonConcorde(f, raison)) return null
  const faits = [`It’s ${heure(f.nowMinute)}`]
  if (f.sleptHours != null) faits.push(`you slept ${Math.round(f.sleptHours)} h`)
  if (f.attemptsBefore > 0)
    faits.push(`you tried to open a blocked app ${f.attemptsBefore} time${f.attemptsBefore > 1 ? 's' : ''} in 10 min`)
  else faits.push(`you held ${f.heldMinutes} of ${f.plannedMinutes} min`)
  const liste = faits.length > 2 ? `${faits.slice(0, -1).join(', ')}, and ${faits.at(-1)}` : faits.join(', and ')
  return `You say ${RAISONS[raison].libelle.toLowerCase()}. ${liste}. That looks more like ${plutot(f)}.`
}

/** Les minutes de plus que « Boring » propose d'abord. */
export const DIX_MINUTES = 10

/** Les blocs courts du rattrapage (« trop dur », « ennuyeux »). */
export const BLOC_COURT = 25

export type Preference = 'tot' | 'profonde' | 'repose'
export type Placement = { morceau?: number; preference: Preference; deep?: boolean }

/** Ce que la raison fait faire à l'app : ce qu'elle montre, et où va le rattrapage. */
export type Reaction = {
  /** Des faits, jamais un sermon. */
  lignes: string[]
  /** « Boring » : 10 minutes de plus, proposées d'abord. */
  dixMinutes: boolean
  placement: Placement
}

/** L'échéance d'une tâche, en chiffres : pour « No rush ». */
export type Echeance = { jours: number; resteMinutes: number; libreMinutes: number }

export function echeanceDe(plan: PlanningResult, today: string, task: { id: string; deadline: string }): Echeance {
  const v = plan.verdicts.find((x) => x.taskId === task.id)
  return {
    jours: Math.max(0, daysBetween(today, task.deadline)),
    resteMinutes: v?.neededMinutes ?? 0,
    libreMinutes: plan.capacities.filter((c) => c.date <= task.deadline).reduce((t, c) => t + c.effectiveCapacityMinutes, 0),
  }
}

/**
 * Chaque raison a sa réaction (la cause selon Steel, 2007) :
 * - « Too hard » (confiance en soi) : le rattrapage en blocs de 25 min, dans
 *   la meilleure fenêtre de concentration ;
 * - « Boring » (aversion) : 10 min de plus d'abord ; sinon des blocs courts,
 *   le plus tôt possible ;
 * - « No rush » (échéance lointaine) : les vrais chiffres ; le rattrapage au
 *   plus tôt, jamais glissé vers l'échéance ;
 * - « Distracted » (impulsivité) : les tentatives montrées ; le rattrapage en
 *   mode profond ;
 * - « Tired » (fatigue) : si les faits collent, le rattrapage quand on est
 *   reposé (un matin, pas ce soir) ; sinon, la comparaison, et on traite
 *   comme une distraction.
 * Aux niveaux 3-4, une raison qui ne colle pas montre aussi la comparaison.
 */
export function reactionRaison(raison: StopReason, f: FaitsDuStop, ctx: { niveau: Niveau; echeance?: Echeance | null }): Reaction {
  const compare = comparaison(raison, f)
  const avecComparaison = (r: Reaction): Reaction =>
    ctx.niveau >= 3 && compare && !r.lignes.includes(compare) ? { ...r, lignes: [...r.lignes, compare] } : r
  switch (raison) {
    case 'too-hard':
      return avecComparaison({ lignes: [], dixMinutes: false, placement: { morceau: BLOC_COURT, preference: 'profonde' } })
    case 'boring':
      return avecComparaison({ lignes: [], dixMinutes: true, placement: { morceau: BLOC_COURT, preference: 'tot' } })
    case 'no-rush': {
      const e = ctx.echeance
      const lignes = e
        ? [`Due in ${e.jours} day${e.jours === 1 ? '' : 's'}. ${duree(e.resteMinutes)} left, ${duree(e.libreMinutes)} free until then.`]
        : []
      return avecComparaison({ lignes, dixMinutes: false, placement: { preference: 'tot' } })
    }
    case 'distracted': {
      const n = f.attemptsBefore
      const lignes = n > 0 ? [`${n} blocked-app attempt${n > 1 ? 's' : ''} in the last 10 min.`] : []
      return avecComparaison({ lignes, dixMinutes: false, placement: { preference: 'tot', deep: true } })
    }
    case 'tired':
      return compare
        ? { lignes: [compare], dixMinutes: false, placement: { preference: 'tot', deep: true } }
        : { lignes: [], dixMinutes: false, placement: { preference: 'repose' } }
    case 'real-event':
      return { lignes: [], dixMinutes: false, placement: { preference: 'tot' } }
  }
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

// ─── L'urgence, et quand elle n'en est plus une ──────────────────────────

/**
 * Au-delà d'un arrêt sur trois en urgence (30 derniers jours, au moins 3
 * arrêts), l'urgence n'en est plus une : elle passe par l'attente comme les
 * autres raisons.
 */
export function urgenceTropFrequente(learning: Pick<LearningState, 'sessionEvents' | 'emergencyPauses'>, today: string): boolean {
  const depuis = addDays(today, -30)
  const urgences = (learning.emergencyPauses ?? []).filter((p) => p.date >= depuis).length
  const stops = (learning.sessionEvents ?? []).filter((e) => e.date >= depuis && e.stop && e.stoppedEarly && e.stop.verdict !== 'urgent').length
  const total = urgences + stops
  return total >= 3 && urgences / total > 1 / 3
}

// ─── Les rattrapages : proposer, promettre, tenir ────────────────────────

export type OptionRattrapage = { date: string; startMinute: number }

const arrondi5 = (m: number) => Math.ceil(m / 5) * 5

/** La place que prend un rattrapage : en blocs courts, 5 min entre chaque. */
export function empreinteRattrapage(minutes: number, morceau?: number): number {
  if (!morceau || minutes <= morceau) return minutes
  const n = Math.ceil(minutes / morceau)
  return minutes + (n - 1) * 5
}

/** Les débuts possibles, un jour donné, d'un rattrapage de `span` minutes (pas de 30 min). */
function debutsLibres(
  plan: PlanningResult,
  date: string,
  span: number,
  kind: 'task' | 'objective',
  refId: string,
  plancher: number,
  plafond: number,
  filtre: (s: PlanningResult['capacities'][number]['slots'][number]) => boolean = () => true,
): number[] {
  const c = plan.capacities.find((x) => x.date === date)
  if (!c || c.freeDay) return []
  const pris = mergeIntervals(
    plan.blocks
      .filter((b) => b.date === date && !(b.kind === kind && b.refId === refId))
      .map((b) => ({ start: b.startMinute, end: b.endMinute })),
  )
  const out: number[] = []
  for (const s of c.slots.filter(filtre)) {
    let debut = Math.max(arrondi5(s.startMinute), plancher)
    while (debut + span <= s.endMinute && debut <= plafond) {
      const choc = pris.find((p) => p.start < debut + span && debut < p.end)
      if (choc) {
        debut = arrondi5(choc.end)
        continue
      }
      out.push(debut)
      debut += 30
    }
  }
  return out
}

/**
 * Les créneaux où tenir la promesse : les trous du plan recalculé (les blocs
 * de la même source n'occupent rien — la promesse les remplace), un par jour,
 * trois au plus. Au niveau 4, dans les 24 h. Une tâche, avant son échéance ;
 * un objectif, dans la semaine. La préférence vient de la raison : au plus
 * tôt, dans une fenêtre profonde (« trop dur »), ou un matin reposé
 * (« fatigué »). Rien ne correspond à la préférence : au plus tôt.
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
  morceau?: number
  preference?: Preference
}): OptionRattrapage[] {
  const demain = addDays(a.today, 1)
  const limite =
    a.niveau === 4 ? demain : a.kind === 'task' && a.deadline ? a.deadline : addDays(startOfWeek(a.today), 6)
  const span = empreinteRattrapage(a.minutes, a.morceau)
  const chercher = (pref: Preference): OptionRattrapage[] => {
    const options: OptionRattrapage[] = []
    for (const c of a.plan.capacities) {
      if (options.length >= 3) break
      if (c.date > limite) continue
      if (pref === 'repose' && c.date === a.today) continue
      const plancher = c.date === a.today ? arrondi5(a.nowMinute + 15) : 0
      const plafond = a.niveau === 4 && c.date === demain ? a.nowMinute : pref === 'repose' ? 12 * 60 : 1440
      const filtre =
        pref === 'profonde' ? (s: { cognitiveWindow: string }) => s.cognitiveWindow === 'PROFONDE' : () => true
      const d = debutsLibres(a.plan, c.date, span, a.kind, a.refId, plancher, plafond, filtre)[0]
      if (d !== undefined) options.push({ date: c.date, startMinute: d })
    }
    return options
  }
  const voulu = chercher(a.preference ?? 'tot')
  return voulu.length > 0 || (a.preference ?? 'tot') === 'tot' ? voulu : chercher('tot')
}

export function creerPromesse(
  learning: LearningState,
  p: Omit<SessionPromise, 'status' | 'label'> & { label?: string },
): LearningState {
  const promesse: SessionPromise = { ...p, label: (p.label ?? '').slice(0, 200), status: 'pending' }
  return { ...learning, promises: [...(learning.promises ?? []), promesse].slice(-300) }
}

/** Un rattrapage en blocs courts : une promesse par bloc, 5 min entre chaque. */
export function creerPromesses(
  learning: LearningState,
  p: Omit<SessionPromise, 'status' | 'label'> & { label?: string },
  morceau?: number,
): LearningState {
  if (!morceau || p.minutes <= morceau) return creerPromesse(learning, p)
  let l = learning
  let reste = p.minutes
  let debut = p.startMinute
  for (let k = 0; reste > 0; k++) {
    const m = Math.min(morceau, reste)
    l = creerPromesse(l, { ...p, id: `${p.id}-${k + 1}`, startMinute: Math.min(1439, debut), minutes: m })
    reste -= m
    debut += m + 5
  }
  return l
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
//
// 1. La raison d'abord (un tap, texte optionnel).
// 2. Le moteur regarde s'il y a la place de repousser. Sinon : on finit.
// 3. La réaction propre à la raison, puis « Tu es sûr ? ».
// 4. Oui : la séance reste bloquée pendant l'attente (5 min et plus), puis
//    s'arrête d'elle-même, même app fermée. « Je continue » reste possible.
// 5. Le rattrapage se choisit : c'est une promesse, et il n'y a pas d'autre
//    sortie.
// L'urgence saute l'attente : l'app dit jusqu'à quand on peut repousser, et
// d'ici là tout reste bloqué sauf 3 apps, et elle regarde.

export type PlanApres = (
  learning: LearningState,
  confirmations: SessionConfirmationsState,
) => { plan: PlanningResult; input: Pick<PlanningInput, 'today' | 'weeklyObjectiveServed'> }

export type PreparationStop =
  | { etape: 'pas-de-place'; learning: LearningState; confirmations: SessionConfirmationsState; message: string }
  | { etape: 'reaction'; reaction: Reaction; faits: FaitsDuStop; attenteMinutes: number }

/**
 * Après la raison : y a-t-il la place de repousser ? Non : pause de 15 min,
 * puis on finit (rien n'est arrêté). Oui : la réaction propre à la raison.
 * Rien n'est encore écrit dans ce second cas.
 */
export function preparerStop(a: {
  learning: LearningState
  confirmations: SessionConfirmationsState
  nowMs: number
  minute: number
  reason: StopReason
  attemptsBefore?: number
  sleptHours?: number | null
  /** Coucher du jour, pour la marge de 30 min de la reprise forcée. */
  coucher?: number | null
  /** La tâche en cours, pour les chiffres de « No rush ». */
  tache?: { id: string; deadline: string } | null
  planApres: PlanApres
}): PreparationStop | null {
  const o = a.confirmations.observedPending
  if (!o || !stopPermis(a.learning, a.confirmations) || a.confirmations.stopPending) return null
  const niveau = niveauConfiance(a.learning.trust)
  const essai = applyStop({
    learning: a.learning,
    confirmations: a.confirmations,
    nowMs: a.nowMs,
    minute: a.minute,
    reason: a.reason,
    attemptsBefore: a.attemptsBefore ?? 0,
  })
  if (!essai) return null
  const date = a.confirmations.date
  const e = (essai.learning.sessionEvents ?? []).find((x) => x.blockId === o.blockId && x.date === date)
  const faits: FaitsDuStop = {
    heldMinutes: essai.heldMinutes,
    plannedMinutes: e?.plannedMinutes ?? essai.heldMinutes,
    attemptsBefore: a.attemptsBefore ?? 0,
    kind: o.kind,
    nowMinute: a.minute,
    ...(a.sleptHours !== undefined ? { sleptHours: a.sleptHours } : {}),
  }
  const attenteMinutes = ATTENTE_STOP_MINUTES[niveau]
  // Les 10 minutes ne s'offrent qu'une fois par bloc.
  const dejaOffert = a.confirmations.dixMinutes?.blockId === o.blockId
  const reagir = (ctx: { niveau: Niveau; echeance?: Echeance | null }): Reaction => {
    const r = reactionRaison(a.reason, faits, ctx)
    return dejaOffert ? { ...r, dixMinutes: false } : r
  }
  if (o.kind === 'ancre' || !e?.stoppedEarly) {
    return { etape: 'reaction', reaction: reagir({ niveau }), faits, attenteMinutes }
  }

  const { plan, input } = a.planApres(essai.learning, essai.confirmations)
  if (!placePourReporter({ plan, input, kind: o.kind, refId: o.refId })) {
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
      return { etape: 'pas-de-place', learning: l, confirmations: { ...pause, dixMinutes: dixMinutesRepondu(pause) }, message: MESSAGE_PAS_DE_PLACE }
    }
  }
  const echeance = a.tache && o.kind === 'task' ? echeanceDe(plan, a.confirmations.date, a.tache) : null
  return { etape: 'reaction', reaction: reagir({ niveau, echeance }), faits, attenteMinutes }
}

/**
 * « Oui, j'arrête » : l'attente commence. La séance reste bloquée jusqu'au
 * bout de l'attente (jamais au-delà de la fin du bloc), puis s'arrête d'elle-
 * même. Le placement du rattrapage voyage avec elle.
 */
export function demanderStop(
  confirmations: SessionConfirmationsState,
  a: {
    nowMs: number
    minute: number
    reason: StopReason
    text?: string
    answerMs?: number
    attemptsBefore?: number
    attenteMinutes: number
    placement: Placement
  },
): SessionConfirmationsState | null {
  const o = confirmations.observedPending
  if (!o || !(o.blockId in confirmations.confirmedAt) || confirmations.pause) return null
  if ((confirmations.stoppedBlockIds ?? []).includes(o.blockId)) return null
  const untilMinute = Math.min(a.minute + a.attenteMinutes, o.endMinute - 1)
  if (untilMinute <= a.minute) return null
  const text = a.text?.trim()
  return {
    ...confirmations,
    dixMinutes: dixMinutesRepondu(confirmations),
    stopPending: {
      blockId: o.blockId,
      untilMs: a.nowMs + (untilMinute - a.minute) * 60_000,
      untilMinute,
      reason: a.reason,
      ...(text ? { text: text.slice(0, 500) } : {}),
      ...(a.answerMs !== undefined ? { answerMs: Math.max(0, Math.round(a.answerMs)) } : {}),
      attemptsBefore: a.attemptsBefore ?? 0,
      ...(a.placement.morceau ? { morceau: a.placement.morceau } : {}),
      preference: a.placement.preference,
      ...(a.placement.deep ? { deep: true } : {}),
    },
  }
}

/** La relance des 10 minutes a eu sa réponse (continuer, ou arrêter). */
const dixMinutesRepondu = (c: SessionConfirmationsState): SessionConfirmationsState['dixMinutes'] =>
  c.dixMinutes && c.dixMinutes.blockId === c.observedPending?.blockId ? { ...c.dixMinutes, repondu: true } : (c.dixMinutes ?? null)

/** « Je continue » : l'attente s'annule, un Stop renoncé au journal. */
export function continuer(
  learning: LearningState,
  confirmations: SessionConfirmationsState,
): { learning: LearningState; confirmations: SessionConfirmationsState } {
  const o = confirmations.observedPending
  return {
    learning: o ? renoncerAuStop(learning, confirmations.date, o.blockId) : learning,
    confirmations: { ...confirmations, stopPending: null, dixMinutes: dixMinutesRepondu(confirmations) },
  }
}

/**
 * « 10 more minutes » (Boring) : on continue, et au bout des 10 minutes l'app
 * redemande « Stop ? », sans reproposer les 10 minutes. Une fois par bloc.
 */
export function accorderDixMinutes(
  learning: LearningState,
  confirmations: SessionConfirmationsState,
  a: { nowMs: number; reason: StopReason; text?: string },
): { learning: LearningState; confirmations: SessionConfirmationsState } | null {
  const o = confirmations.observedPending
  if (!o || confirmations.dixMinutes?.blockId === o.blockId) return null
  const text = a.text?.trim()
  return {
    learning: renoncerAuStop(learning, confirmations.date, o.blockId),
    confirmations: {
      ...confirmations,
      stopPending: null,
      dixMinutes: {
        blockId: o.blockId,
        untilMs: a.nowMs + DIX_MINUTES * 60_000,
        reason: a.reason,
        ...(text ? { text: text.slice(0, 500) } : {}),
        repondu: false,
      },
    },
  }
}

/**
 * Les 10 minutes sont passées et la séance tourne encore : il faut
 * redemander « Stop ? ». Rien si le bloc est fini, arrêté, en pause ou déjà
 * dans l'attente d'un arrêt.
 */
export function dixMinutesEchues(c: SessionConfirmationsState, nowMs: number): { reason: StopReason; text?: string } | null {
  const d = c.dixMinutes
  const o = c.observedPending
  if (!d || d.repondu || nowMs < d.untilMs || !o || o.blockId !== d.blockId) return null
  if (c.stopPending || c.pause || (c.stoppedBlockIds ?? []).includes(o.blockId)) return null
  return { reason: d.reason, ...(d.text ? { text: d.text } : {}) }
}

/** L'attente est-elle finie ? */
export const stopEchu = (c: SessionConfirmationsState, nowMs: number) =>
  c.stopPending && nowMs >= c.stopPending.untilMs ? c.stopPending : null

/**
 * L'attente est finie : la séance s'arrête à la fin de l'attente (elle a été
 * tenue jusque-là), et le rattrapage reste à choisir — placé comme la raison
 * le demande. `textReason` : la catégorie lue dans le texte, par l'appelant.
 */
export function executerStop(a: {
  learning: LearningState
  confirmations: SessionConfirmationsState
  nowMs: number
  label: string
  deadline?: string | null
  textReason?: StopReason | null
  planApres: PlanApres
}): { learning: LearningState; confirmations: SessionConfirmationsState } {
  const p = a.confirmations.stopPending
  const o = a.confirmations.observedPending
  const vide = { learning: a.learning, confirmations: { ...a.confirmations, stopPending: null } }
  if (!p || !o || o.blockId !== p.blockId) return vide
  const r = applyStop({
    learning: a.learning,
    confirmations: { ...a.confirmations, stopPending: null },
    nowMs: a.nowMs,
    minute: p.untilMinute,
    reason: p.reason,
    ...(p.text !== undefined ? { text: p.text } : {}),
    ...(p.answerMs !== undefined ? { answerMs: p.answerMs } : {}),
    attemptsBefore: p.attemptsBefore,
    textReason: a.textReason ?? null,
  })
  if (!r) return vide
  const date = a.confirmations.date
  const niveau = niveauConfiance(a.learning.trust)
  const learning = noterVerdict(r.learning, date, o.blockId, niveau, 'postponed')
  const e = (learning.sessionEvents ?? []).find((x) => x.blockId === o.blockId && x.date === date)
  const minutes = Math.max(0, (e?.plannedMinutes ?? 0) - r.heldMinutes)
  if (o.kind === 'ancre' || minutes < 5 || !e?.stoppedEarly) return { learning, confirmations: r.confirmations }
  const { plan } = a.planApres(learning, r.confirmations)
  const options = optionsRattrapage({
    plan,
    today: date,
    nowMinute: p.untilMinute,
    minutes,
    kind: o.kind,
    refId: o.refId,
    niveau,
    deadline: a.deadline ?? null,
    ...(p.morceau ? { morceau: p.morceau } : {}),
    preference: p.preference,
  })
  if (!options.length) return { learning, confirmations: r.confirmations }
  return {
    learning,
    confirmations: {
      ...r.confirmations,
      promiseChoice: {
        options,
        minutes,
        source: { kind: o.kind, refId: o.refId, blockId: o.blockId, label: a.label.slice(0, 200) },
        ...(p.morceau ? { morceau: p.morceau } : {}),
        ...(p.deep ? { deep: true } : {}),
      },
    },
  }
}

/** Le rattrapage choisi parmi ceux proposés : la promesse. */
export function choisirRattrapage(
  learning: LearningState,
  confirmations: SessionConfirmationsState,
  option: OptionRattrapage,
  nowMs: number,
): { learning: LearningState; confirmations: SessionConfirmationsState } | null {
  const c = confirmations.promiseChoice
  if (!c || !c.options.some((x) => x.date === option.date && x.startMinute === option.startMinute)) return null
  return {
    learning: creerPromesses(
      learning,
      {
        id: `${c.source.blockId}-${nowMs.toString(36)}`,
        kind: c.source.kind,
        refId: c.source.refId,
        label: c.source.label,
        fromBlockId: c.source.blockId,
        date: option.date,
        startMinute: option.startMinute,
        minutes: c.minutes,
        createdAt: new Date(nowMs).toISOString(),
        ...(c.deep ? { deep: true } : {}),
      },
      c.morceau,
    ),
    confirmations: { ...confirmations, promiseChoice: null },
  }
}

// ─── L'urgence ───────────────────────────────────────────────────────────

/**
 * « Something real came up » : jusqu'à quand peut-on repousser ? Chaque
 * heure possible est essayée dans le moteur, promesse posée : seules celles
 * qui gardent la semaine faisable restent. Quatre au plus, la dernière
 * comprise. Aucune : il n'y a pas la place de repousser.
 */
export function optionsUrgence(a: {
  learning: LearningState
  confirmations: SessionConfirmationsState
  nowMs: number
  minute: number
  deadline?: string | null
  planApres: PlanApres
}): { options: OptionRattrapage[]; minutes: number } | null {
  const o = a.confirmations.observedPending
  if (!o || !stopPermis(a.learning, a.confirmations)) return null
  const essai = applyStop({ learning: a.learning, confirmations: a.confirmations, nowMs: a.nowMs, minute: a.minute, reason: 'real-event' })
  if (!essai) return null
  const date = a.confirmations.date
  const e = (essai.learning.sessionEvents ?? []).find((x) => x.blockId === o.blockId && x.date === date)
  const minutes = Math.max(0, (e?.plannedMinutes ?? 0) - essai.heldMinutes)
  if (o.kind === 'ancre' || minutes < 5) return { options: [], minutes: 0 }
  const niveau = niveauConfiance(a.learning.trust)
  const { plan } = a.planApres(essai.learning, essai.confirmations)
  const limite = niveau === 4 ? addDays(date, 1) : o.kind === 'task' && a.deadline ? a.deadline : addDays(startOfWeek(date), 6)
  const candidats: OptionRattrapage[] = []
  for (const c of plan.capacities) {
    if (c.date > limite || candidats.length >= 16) break
    const plancher = c.date === date ? arrondi5(a.minute + 15) : 0
    const debuts = debutsLibres(plan, c.date, minutes, o.kind, o.refId, plancher, 1440)
    // Aujourd'hui, heure par heure ; les jours suivants, le premier créneau.
    let dernier = -Infinity
    for (const d of debuts) {
      if (candidats.length >= 16) break
      if (d - dernier < 60) continue
      candidats.push({ date: c.date, startMinute: d })
      dernier = d
      if (c.date !== date) break
    }
  }
  const tenables = candidats.filter((c) => {
    const l = creerPromesse(essai.learning, {
      id: 'essai',
      kind: o.kind as 'task' | 'objective',
      refId: o.refId,
      fromBlockId: o.blockId,
      date: c.date,
      startMinute: c.startMinute,
      minutes,
      createdAt: new Date(a.nowMs).toISOString(),
    })
    const r = a.planApres(l, essai.confirmations)
    return placePourReporter({ plan: r.plan, input: r.input, kind: o.kind, refId: o.refId })
  })
  const n = tenables.length
  const options = n <= 4 ? tenables : [0, Math.round(n / 3), Math.round((2 * n) / 3), n - 1].map((i) => tenables[i]!)
  return { options, minutes }
}

/**
 * L'urgence est prise : la séance s'arrête maintenant (sans attente), la
 * promesse est posée à l'heure choisie, et d'ici là — au plus jusqu'au
 * coucher — tout reste bloqué sauf les apps choisies.
 */
export function reporterEnUrgence(a: {
  learning: LearningState
  confirmations: SessionConfirmationsState
  nowMs: number
  minute: number
  option: OptionRattrapage
  minutes: number
  apps: string[]
  appCount?: number
  label: string
  coucher?: number | null
  text?: string
}): { learning: LearningState; confirmations: SessionConfirmationsState } | null {
  const o = a.confirmations.observedPending
  const count = a.appCount ?? a.apps.length
  if (!o || count > URGENCE_APPS_MAX || !stopPermis(a.learning, a.confirmations)) return null
  if (o.kind === 'ancre') return null
  const r = applyStop({
    learning: a.learning,
    confirmations: a.confirmations,
    nowMs: a.nowMs,
    minute: a.minute,
    reason: 'real-event',
    ...(a.text ? { text: a.text } : {}),
  })
  if (!r) return null
  const date = a.confirmations.date
  let learning = noterVerdict(r.learning, date, o.blockId, niveauConfiance(a.learning.trust), 'urgent')
  learning = creerPromesse(learning, {
    id: `${o.blockId}-${a.nowMs.toString(36)}`,
    kind: o.kind,
    refId: o.refId,
    label: a.label,
    fromBlockId: o.blockId,
    date: a.option.date,
    startMinute: a.option.startMinute,
    minutes: Math.max(1, Math.min(600, a.minutes)),
    createdAt: new Date(a.nowMs).toISOString(),
  })
  const coucher = a.coucher != null ? a.coucher - 30 : 1440
  const untilMinute = Math.max(a.minute + 1, a.option.date === date ? Math.min(a.option.startMinute, coucher) : coucher)
  const untilMs = a.nowMs + (untilMinute - a.minute) * 60_000
  const trace: EmergencyPause = {
    date,
    blockId: o.blockId,
    startMs: a.nowMs,
    endMs: untilMs,
    apps: a.apps.slice(0, URGENCE_APPS_MAX),
    appCount: count,
    attempts: 0,
  }
  learning = { ...learning, emergencyPauses: [...(learning.emergencyPauses ?? []), trace].slice(-300) }
  return {
    learning,
    confirmations: {
      ...r.confirmations,
      urgence: { sourceBlockId: o.blockId, startMs: a.nowMs, untilMs, untilMinute, apps: a.apps.slice(0, URGENCE_APPS_MAX) },
    },
  }
}

export const urgenceActive = (c: SessionConfirmationsState, nowMs: number) =>
  c.urgence && nowMs < c.urgence.untilMs ? c.urgence : null

/**
 * Pendant l'urgence, l'app regarde : chaque tentative d'ouvrir une app non
 * choisie est comptée ; la première est un échec grave.
 */
export function tentativePendantUrgence(learning: LearningState, confirmations: SessionConfirmationsState, nowMs: number): LearningState {
  const u = urgenceActive(confirmations, nowMs)
  if (!u) return learning
  const pauses = [...(learning.emergencyPauses ?? [])]
  const i = pauses.map((x, k) => (x.blockId === u.sourceBlockId && x.startMs === u.startMs ? k : -1)).reduce((m, k) => Math.max(m, k), -1)
  if (i < 0) return learning
  const avant = pauses[i]!.attempts
  pauses[i] = { ...pauses[i]!, attempts: avant + 1 }
  const l = { ...learning, emergencyPauses: pauses }
  return avant === 0 ? ajusterConfiance(l, 'echecGrave') : l
}

/** Fin de la fenêtre d'urgence : elle se referme toute seule. */
function finFenetreUrgence(
  learning: LearningState,
  confirmations: SessionConfirmationsState,
  nowMs: number,
): { learning: LearningState; confirmations: SessionConfirmationsState } {
  const u = confirmations.urgence
  if (!u || nowMs < u.untilMs) return { learning, confirmations }
  const pauses = (learning.emergencyPauses ?? []).map((x) =>
    x.blockId === u.sourceBlockId && x.startMs === u.startMs ? { ...x, end: 'auto' as const, endMs: u.untilMs } : x,
  )
  return { learning: { ...learning, emergencyPauses: pauses }, confirmations: { ...confirmations, urgence: null } }
}


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
  const u = finFenetreUrgence(p.learning, p.confirmations, nowMs)
  const l = suivrePromesses(u.learning, u.confirmations, today, nowMinute)
  return { learning: l, confirmations: u.confirmations, change: p.change || u.confirmations !== p.confirmations || l !== p.learning }
}

// ─── Ce que l'interface reçoit ───────────────────────────────────────────

/** L'état du Stop, des pauses et de l'urgence, pour l'interface (bureau). */
export type TrustView = {
  level: Niveau
  waitMinutes: number
  stopAllowed: boolean
  pause: { kind: 'emergency' | 'breather' | 'no-room'; endMinute: number } | null
  awaitingReturn: boolean
  /** L'attente d'un Stop confirmé : la séance s'arrête à `untilMs`. */
  stopPending: { untilMs: number } | null
  /** Le rattrapage à choisir, s'il y en a un. */
  promiseChoice: NonNullable<SessionConfirmationsState['promiseChoice']> | null
  /** La fenêtre d'urgence en cours. */
  urgence: { untilMinute: number } | null
  urgentTooOften: boolean
  /** « J'ai besoin de 15 min » : pendant la promesse en cours. */
  breatherNow: boolean
  /** Les apps que la séance bloque, pour en garder 3 pendant une urgence. */
  sessionApps: Array<{ id: string; name: string }>
  /** Les « 10 more minutes » sont passées : redemander « Stop ? ». */
  tenMinutesUp: { reason: StopReason; text?: string } | null
}

/** Ce que la raison a donné (bureau). */
export type StopResult =
  | { ok: false; reason: string }
  | { ok: true; step: 'no-room'; message: string }
  | { ok: true; step: 'reaction'; lines: string[]; tenMinutes: boolean; waitMinutes: number }
  | { ok: true; step: 'help'; message: string }
  | { ok: true; step: 'ended' }

/**
 * Les tentatives vues pendant l'urgence, relues d'un compteur (le bouclier
 * d'iOS les range lui-même) : le total est posé tel quel, et la première est
 * un échec grave.
 */
export function tentativesPendantUrgence(
  learning: LearningState,
  confirmations: SessionConfirmationsState,
  vues: number,
  nowMs: number,
): LearningState {
  const u = urgenceActive(confirmations, nowMs)
  if (!u || vues <= 0) return learning
  const pauses = [...(learning.emergencyPauses ?? [])]
  const i = pauses.map((x, k) => (x.blockId === u.sourceBlockId && x.startMs === u.startMs ? k : -1)).reduce((m, k) => Math.max(m, k), -1)
  if (i < 0 || pauses[i]!.attempts >= vues) return learning
  const avant = pauses[i]!.attempts
  pauses[i] = { ...pauses[i]!, attempts: vues }
  const l = { ...learning, emergencyPauses: pauses }
  return avant === 0 ? ajusterConfiance(l, 'echecGrave') : l
}
