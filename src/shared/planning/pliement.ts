import type { Ancre, LearningState, Objective, SessionConfirmationsState, SessionEvent, Task } from '@shared/schemas'
import type { PlanningResult } from './types'
import { addDays, daysBetween, startOfWeek } from './dates'

// ─── Le pliement ─────────────────────────────────────────────────────────
//
// Un Stop ne déplace pas le travail : il le PLIE. La partie non faite ne
// disparaît pas, elle épaissit les séances à venir de la même tâche (ou du
// même objectif) — le moteur la répartit, jamais le jour même. Plus une tâche
// est longue, plus elle se plie ; l'échéance, le temps libre et la
// probabilité de nouvelles tâches disent jusqu'où. Plier trop souvent met le
// pliement en pause. Une ancre ne se plie jamais.

// ─── La probabilité ──────────────────────────────────────────────────────
//
// Combien de chances que l'utilisateur crée une nouvelle tâche, un objectif
// ou une ancre d'ici une date, et combien de minutes ça prendra. Un rythme de
// Poisson par sorte, appris des dates de création (Gamma-Poisson : un a priori
// prudent, vite effacé par les vraies données).

export type SorteCreation = 'task' | 'objective' | 'ancre'
export type Creation = { kind: SorteCreation; date: string; minutes: number }

/** L'a priori : 1 création par semaine (tâches), par mois (objectifs, ancres). */
const A_PRIORI: Record<SorteCreation, { jours: number; minutes: number }> = {
  task: { jours: 7, minutes: 120 },
  objective: { jours: 30, minutes: 180 },
  ancre: { jours: 30, minutes: 180 },
}

/** La fenêtre d'observation : les 8 dernières semaines. */
const FENETRE_JOURS = 56

const jourDe = (iso: string) => iso.slice(0, 10)

/**
 * Les créations passées, lues de ce qui existe. Tâche : son travail entier ;
 * objectif : sa cible de la semaine ; ancre : ses minutes de la semaine.
 */
export function historiqueCreations(a: { tasks: readonly Task[]; objectives: readonly Objective[]; ancres: readonly Ancre[] }): Creation[] {
  return [
    ...a.tasks
      .filter((t) => t.parentTaskId === null || t.partOrder === 1)
      .map((t) => ({ kind: 'task' as const, date: jourDe(t.createdAt), minutes: travailTotal(t) })),
    ...a.objectives.map((o) => ({ kind: 'objective' as const, date: jourDe(o.createdAt), minutes: o.weeklyTargetMinutes })),
    ...a.ancres.map((x) => ({ kind: 'ancre' as const, date: jourDe(x.createdAt), minutes: x.normalMaxMinutes * x.daysOfWeek.length })),
  ]
}

export type Probabilite = {
  /** Créations attendues par jour. */
  parJour: number
  /** Probabilité d'au moins une création d'ici l'horizon. */
  auMoinsUne: number
  /** Minutes que ces créations prendront AVANT l'horizon. */
  minutesAttendues: number
}

/**
 * La probabilité de créations d'ici `jours` jours. Une tâche nouvelle ne tombe
 * pas toute dans l'horizon : on en compte la moitié. Un objectif ou une ancre
 * créé au milieu de l'horizon en prend la moitié du reste, au rythme de sa
 * semaine.
 */
export function probabiliteCreation(creations: readonly Creation[], today: string, jours: number): Record<SorteCreation, Probabilite> & { minutesAttendues: number } {
  const debut = addDays(today, -FENETRE_JOURS)
  const recentes = creations.filter((c) => c.date > debut && c.date <= today)
  const premiere = creations.reduce<string | null>((m, c) => (m === null || c.date < m ? c.date : m), null)
  const observe = premiere === null ? 0 : Math.min(FENETRE_JOURS, Math.max(0, daysBetween(premiere, today)))
  const D = Math.max(0, jours)
  const une = (kind: SorteCreation): Probabilite => {
    const miennes = recentes.filter((c) => c.kind === kind)
    const parJour = (miennes.length + 1) / (observe + A_PRIORI[kind].jours)
    const taille = miennes.length ? miennes.reduce((t, c) => t + c.minutes, 0) / miennes.length : A_PRIORI[kind].minutes
    const attendues = parJour * D
    const minutes = kind === 'task' ? attendues * taille * 0.5 : attendues * (taille / 7) * (D / 2)
    return { parJour, auMoinsUne: 1 - Math.exp(-attendues), minutesAttendues: Math.round(minutes) }
  }
  const r = { task: une('task'), objective: une('objective'), ancre: une('ancre') }
  return { ...r, minutesAttendues: r.task.minutesAttendues + r.objective.minutesAttendues + r.ancre.minutesAttendues }
}

// ─── Jusqu'où plier ──────────────────────────────────────────────────────

/** La part d'une tâche (ou de la cible de la semaine) qui peut se plier. */
export const PART_PLIABLE = 0.25

/** Le travail entier d'une tâche, corrigé. */
export const travailTotal = (t: Pick<Task, 'estimatedMinutes' | 'correctionFactor' | 'extraMinutes'>) =>
  Math.round(t.estimatedMinutes * t.correctionFactor) + t.extraMinutes

/** Ce qui se plie : une tâche jusqu'à son échéance, un objectif jusqu'à dimanche. */
export type ElementPliable = { kind: 'task' | 'objective'; refId: string; total: number; fin: string }

export function elementPliable(
  o: { kind: SessionEvent['kind']; refId: string },
  a: { tasks: readonly Task[]; objectives: readonly Objective[]; today: string },
): ElementPliable | null {
  if (o.kind === 'task') {
    const t = a.tasks.find((x) => x.id === o.refId)
    return t ? { kind: 'task', refId: t.id, total: travailTotal(t), fin: t.deadline } : null
  }
  if (o.kind === 'objective') {
    const x = a.objectives.find((y) => y.id === o.refId)
    return x ? { kind: 'objective', refId: x.id, total: x.weeklyTargetMinutes, fin: addDays(startOfWeek(a.today), 6) } : null
  }
  return null
}

const estPlie = (e: SessionEvent) => e.stop?.verdict === 'folded'

/** Les minutes déjà pliées : toute la tâche ; pour un objectif, cette semaine. */
export function minutesPliees(learning: Pick<LearningState, 'sessionEvents'>, el: Pick<ElementPliable, 'kind' | 'refId'>, today: string): number {
  const depuis = el.kind === 'objective' ? startOfWeek(today) : ''
  return (learning.sessionEvents ?? [])
    .filter((e) => e.refId === el.refId && estPlie(e) && e.date >= depuis)
    .reduce((t, e) => t + (e.stop?.foldedMinutes ?? 0), 0)
}

/**
 * La pause de pliement : parmi les 3 dernières séances commencées de cet
 * élément, 2 pliées ou plus — plier est suspendu. Elle se lève d'elle-même
 * quand les séances suivantes sont tenues jusqu'au bout.
 */
export function pliageEnPause(learning: Pick<LearningState, 'sessionEvents'>, refId: string, sauf?: { blockId: string; date: string }): boolean {
  const dernieres = (learning.sessionEvents ?? [])
    .filter((e) => e.refId === refId && e.started && !(sauf && e.blockId === sauf.blockId && e.date === sauf.date))
    .sort((a, b) => (a.date === b.date ? a.plannedStartMinute - b.plannedStartMinute : a.date.localeCompare(b.date)))
    .slice(-3)
  return dernieres.filter(estPlie).length >= 2
}

/** Le temps libre qui reste d'aujourd'hui à `fin`, une fois tout placé. */
export function libreJusqua(plan: PlanningResult, today: string, fin: string): number {
  const dans = (d: string) => d >= today && d <= fin
  const capacite = plan.capacities.filter((c) => dans(c.date)).reduce((t, c) => t + c.effectiveCapacityMinutes, 0)
  const pris = plan.blocks.filter((b) => dans(b.date) && b.kind !== 'ancre').reduce((t, b) => t + b.durationMinutes, 0)
  return Math.max(0, capacite - pris)
}

export type RefusPliage = 'pause' | 'longueur' | 'place'

export type BudgetPliage = {
  /** Ce que la longueur permet de plier en tout. */
  longueur: number
  /** Déjà plié. */
  utilise: number
  /** Le libre avant l'échéance, une fois ce pli réparti. */
  libre: number
  /** Ce que les nouvelles créations prendront probablement d'ici là. */
  attendu: number
}

/**
 * Ce pli de `minutes` passe-t-il ? Dans l'ordre : la pause de pliement, la
 * longueur (déjà plié + ce pli ≤ 25 % du total), puis la place — le temps
 * libre qui reste APRÈS avoir réparti ce pli doit encore couvrir ce que les
 * nouvelles tâches, objectifs et ancres prendront probablement d'ici
 * l'échéance. `planApres` : le plan recalculé comme si le pli était fait.
 */
export function jugerPliage(a: {
  learning: Pick<LearningState, 'sessionEvents'>
  element: ElementPliable
  minutes: number
  today: string
  bloc: { blockId: string; date: string }
  planApres: PlanningResult
  creations: readonly Creation[]
}): { ok: true; budget: BudgetPliage } | { ok: false; refus: RefusPliage; budget: BudgetPliage } {
  const jours = Math.max(1, daysBetween(a.today, a.element.fin) + 1)
  const budget: BudgetPliage = {
    longueur: Math.round(PART_PLIABLE * a.element.total),
    utilise: minutesPliees(a.learning, a.element, a.today),
    libre: libreJusqua(a.planApres, a.today, a.element.fin),
    attendu: probabiliteCreation(a.creations, a.today, jours).minutesAttendues,
  }
  if (pliageEnPause(a.learning, a.element.refId, a.bloc)) return { ok: false, refus: 'pause', budget }
  if (budget.utilise + a.minutes > budget.longueur) return { ok: false, refus: 'longueur', budget }
  if (budget.libre < budget.attendu) return { ok: false, refus: 'place', budget }
  return { ok: true, budget }
}

/** Ce que l'app dit quand le pli ne passe pas. */
export const MESSAGE_REFUS: Record<RefusPliage, string> = {
  pause: 'Too many folds on this one. 15-minute break, then you finish.',
  longueur: 'Folded as far as it goes. 15-minute break, then you finish.',
  place: 'No room to fold. 15-minute break, then you finish.',
}

/**
 * Les éléments pliés aujourd'hui : le moteur ne leur rend AUCUNE séance
 * avant demain — sinon le pli reviendrait une minute plus tard, et ce serait
 * un déplacement.
 */
export function pliesDuJour(learning: Pick<LearningState, 'sessionEvents'>, confirmations: Pick<SessionConfirmationsState, 'date' | 'stoppedBlockIds'>): string[] {
  const arretes = new Set(confirmations.stoppedBlockIds ?? [])
  return [
    ...new Set(
      (learning.sessionEvents ?? [])
        .filter(
          (e) =>
            e.date === confirmations.date &&
            e.kind !== 'ancre' &&
            e.stoppedEarly &&
            arretes.has(e.blockId) &&
            e.stop !== undefined &&
            e.stop.verdict !== 'urgent' &&
            e.stop.verdict !== 'no-room' &&
            e.promiseId === undefined,
        )
        .map((e) => e.refId),
    ),
  ]
}
