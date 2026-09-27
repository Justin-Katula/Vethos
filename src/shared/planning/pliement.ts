import type { Ancre, LearningState, Objective, SessionConfirmationsState, SessionEvent, Task } from '@shared/schemas'
import type { PlanningResult } from './types'
import { addDays, daysBetween, startOfWeek } from './dates'

// ─── Le pliement ─────────────────────────────────────────────────────────
//
// Un Stop ne déplace pas le travail : il le PLIE. La partie non faite ne
// disparaît pas, elle épaissit les séances à venir de la même tâche (ou du
// même objectif) — le moteur la répartit, jamais le jour même. La version
// idéale de la tâche, l'échéance, le temps libre et la probabilité de
// nouvelles tâches disent jusqu'où. Plier trop souvent met le pliement en
// pause. Une ancre ne se plie jamais.

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

// ─── Jusqu'où plier : la version idéale ──────────────────────────────────
//
// Chaque tâche a une version idéale : le plan tel que le moteur l'a posé la
// première fois, avant tout pli — ce qui devrait être fait, jour après jour.
// Plier fait prendre du retard sur elle ; les séances épaissies le rattrapent.
// Deux mesures, la longueur et le temps :
// - la longueur : jamais plus de 15 % de la tâche entière derrière sa version
//   idéale ;
// - le temps : ces 15 % ne sont pas donnés d'un coup. Le droit de plier se
//   GAGNE jour après jour, de la création à l'échéance (comme des jours de
//   congé : ce qui n'est pas plié s'accumule), et il FOND quand l'échéance
//   approche. Une longue tâche donne plus en tout, jamais tout de suite.
// La version idéale s'allonge jour après jour, sans jamais réécrire un jour
// figé. Un objectif a la sienne par semaine, et sa semaine pour période.

/** La part de la longueur qui peut se plier, et le retard maximal sur l'idéal. */
export const RETARD_MAX = 0.15

/** Le travail entier d'une tâche, corrigé. */
export const travailTotal = (t: Pick<Task, 'estimatedMinutes' | 'correctionFactor' | 'extraMinutes'>) =>
  Math.round(t.estimatedMinutes * t.correctionFactor) + t.extraMinutes

/**
 * Ce qui se plie : une tâche de sa création à son échéance, un objectif du
 * lundi au dimanche. `debut` : le premier jour de la période.
 */
export type ElementPliable = { kind: 'task' | 'objective'; refId: string; total: number; debut: string; fin: string }

export function elementPliable(
  o: { kind: SessionEvent['kind']; refId: string },
  a: { tasks: readonly Task[]; objectives: readonly Objective[]; today: string },
): ElementPliable | null {
  if (o.kind === 'task') {
    const t = a.tasks.find((x) => x.id === o.refId)
    return t ? { kind: 'task', refId: t.id, total: travailTotal(t), debut: t.createdAt.slice(0, 10), fin: t.deadline } : null
  }
  if (o.kind === 'objective') {
    const x = a.objectives.find((y) => y.id === o.refId)
    return x ? { kind: 'objective', refId: x.id, total: x.weeklyTargetMinutes, debut: startOfWeek(a.today), fin: addDays(startOfWeek(a.today), 6) } : null
  }
  return null
}

/** La clé de la version idéale : la tâche, ou l'objectif pour cette semaine. */
export const cleIdeal = (el: Pick<ElementPliable, 'kind' | 'refId'>, today: string) =>
  el.kind === 'objective' ? `objective:${el.refId}:${startOfWeek(today)}` : `task:${el.refId}`

/** Le travail vraiment fait : les séances tenues (un objectif : cette semaine). */
export function faitDe(learning: Pick<LearningState, 'sessionEvents'>, el: Pick<ElementPliable, 'kind' | 'refId'>, today: string): number {
  const depuis = el.kind === 'objective' ? startOfWeek(today) : ''
  return (learning.sessionEvents ?? [])
    .filter((e) => e.refId === el.refId && e.date >= depuis)
    .reduce((t, e) => t + (e.heldMinutes ?? 0), 0)
}

type Ideal = NonNullable<LearningState['ideals']>[string]

/**
 * Fige la version idéale des tâches et objectifs que le plan place et qui
 * n'en ont pas encore. Jamais refigée : c'est la référence, pas le plan du
 * jour. Les versions des tâches disparues et des semaines passées tombent.
 */
export function figerIdeaux(
  learning: LearningState,
  plan: Pick<PlanningResult, 'blocks'>,
  a: { tasks: readonly Task[]; objectives: readonly Objective[]; today: string },
): LearningState {
  const avant = learning.ideals ?? {}
  const semaine = startOfWeek(a.today)
  const garder = (k: string) =>
    k.startsWith('task:') ? a.tasks.some((t) => t.status === 'active' && k === `task:${t.id}`) : k.endsWith(`:${semaine}`)
  const ideals: Record<string, Ideal> = Object.fromEntries(Object.entries(avant).filter(([k]) => garder(k)))
  let change = Object.keys(ideals).length !== Object.keys(avant).length
  const elements: ElementPliable[] = [
    ...a.tasks
      .filter((t) => t.status === 'active')
      .map((t) => ({ kind: 'task' as const, refId: t.id, total: travailTotal(t), debut: t.createdAt.slice(0, 10), fin: t.deadline })),
    ...a.objectives.map((o) => ({ kind: 'objective' as const, refId: o.id, total: o.weeklyTargetMinutes, debut: semaine, fin: addDays(semaine, 6) })),
  ]
  for (const el of elements) {
    const k = cleIdeal(el, a.today)
    const deja = ideals[k]
    // Déjà figée : seuls les jours après son dernier jour s'ajoutent (une
    // longue tâche dépasse l'horizon du premier plan). Jamais au-delà du
    // travail entier.
    const apres = deja ? (deja.points.at(-1)?.[0] ?? deja.since) : null
    const parJour = new Map<string, number>()
    for (const b of plan.blocks) {
      if (b.kind !== el.kind || b.refId !== el.refId || b.date < a.today || b.date > el.fin || b.preview) continue
      if (apres !== null && b.date <= apres) continue
      parJour.set(b.date, (parJour.get(b.date) ?? 0) + b.workMinutes)
    }
    if (parJour.size === 0) continue
    const base = deja ? deja.base : faitDe(learning, el, a.today)
    let cumul = deja ? (deja.points.at(-1)?.[1] ?? deja.base) : base
    if (cumul >= el.total && deja) continue
    const nouveaux: Array<[string, number]> = [...parJour.entries()]
      .sort(([x], [y]) => x.localeCompare(y))
      .map(([d, m]) => {
        cumul = Math.min(Math.max(el.total, base), cumul + m)
        return [d, cumul]
      })
    ideals[k] = deja ? { ...deja, points: [...deja.points, ...nouveaux].slice(-400) } : { since: a.today, base, points: nouveaux }
    change = true
  }
  return change ? { ...learning, ideals } : learning
}

/** Ce que la version idéale dit d'avoir fait à la fin de `date`, en minutes. */
export function idealA(ideal: Ideal, date: string): number {
  return ideal.points.filter(([d]) => d <= date).at(-1)?.[1] ?? ideal.base
}

/** La pause de pliement : 2 des 3 dernières séances commencées de cet élément pliées. */
export function pliageEnPause(learning: Pick<LearningState, 'sessionEvents'>, refId: string, sauf?: { blockId: string; date: string }): boolean {
  const dernieres = (learning.sessionEvents ?? [])
    .filter((e) => e.refId === refId && e.started && !(sauf && e.blockId === sauf.blockId && e.date === sauf.date))
    .sort((a, b) => (a.date === b.date ? a.plannedStartMinute - b.plannedStartMinute : a.date.localeCompare(b.date)))
    .slice(-3)
  return dernieres.filter((e) => e.stop?.verdict === 'folded').length >= 2
}

/** Le temps libre qui reste d'aujourd'hui à `fin`, une fois tout placé. */
export function libreJusqua(plan: PlanningResult, today: string, fin: string): number {
  const dans = (d: string) => d >= today && d <= fin
  const capacite = plan.capacities.filter((c) => dans(c.date)).reduce((t, c) => t + c.effectiveCapacityMinutes, 0)
  const pris = plan.blocks.filter((b) => dans(b.date) && b.kind !== 'ancre').reduce((t, b) => t + b.durationMinutes, 0)
  return Math.max(0, capacite - pris)
}

/** Les minutes déjà pliées : toute la tâche ; pour un objectif, cette semaine. */
export function minutesPliees(learning: Pick<LearningState, 'sessionEvents'>, el: Pick<ElementPliable, 'kind' | 'refId'>, today: string): number {
  const depuis = el.kind === 'objective' ? startOfWeek(today) : ''
  return (learning.sessionEvents ?? [])
    .filter((e) => e.refId === el.refId && e.stop?.verdict === 'folded' && e.date >= depuis)
    .reduce((t, e) => t + (e.stop?.foldedMinutes ?? 0), 0)
}

/**
 * Le droit de plier aujourd'hui, en minutes, avant ce qui est déjà plié :
 * gagné jour après jour (15 % de la longueur × jours écoulés ÷ jours de la
 * période), et fondu à l'approche de l'échéance (15 % × jours restants ÷
 * jours de la période). Le plus petit des deux.
 */
export function droitDePlier(el: Pick<ElementPliable, 'total' | 'debut' | 'fin'>, today: string): { gagne: number; fondu: number; droit: number } {
  const debut = el.debut < el.fin ? el.debut : el.fin
  const periode = Math.max(1, daysBetween(debut, el.fin) + 1)
  const ecoules = Math.min(periode, Math.max(1, daysBetween(debut, today) + 1))
  const restants = Math.min(periode, Math.max(1, daysBetween(today, el.fin) + 1))
  const part = RETARD_MAX * el.total
  const gagne = Math.round((part * ecoules) / periode)
  const fondu = Math.round((part * restants) / periode)
  return { gagne, fondu, droit: Math.min(gagne, fondu) }
}

export type RefusPliage = 'pause' | 'retard' | 'droit' | 'place'

export type BudgetPliage = {
  /** Le retard permis sur la version idéale : 15 % de la tâche entière. */
  retardMax: number
  /** Le droit de plier aujourd'hui (gagné, fondu), avant ce qui est déjà plié. */
  droit: number
  /** Déjà plié. */
  plie: number
  /** Le retard sur la version idéale si ce pli est fait (fin de journée). */
  retard: number
  /** Le libre avant l'échéance, une fois ce pli réparti. */
  libre: number
  /** Ce que les nouvelles créations prendront probablement d'ici là. */
  attendu: number
}

/**
 * Ce pli passe-t-il ? Dans l'ordre : la pause de pliement (2 des 3 dernières
 * séances pliées), la version idéale (le retard, une fois ce pli fait et la
 * journée finie, reste sous 15 % de la tâche entière), le droit de plier
 * (déjà plié + ce pli ≤ le droit gagné et pas encore fondu), puis la place — le
 * temps libre qui reste APRÈS avoir réparti ce pli doit encore couvrir ce que
 * les nouvelles tâches, objectifs et ancres prendront probablement d'ici
 * l'échéance. `tenu` : les minutes tenues de la séance qu'on arrête ;
 * `planApres` : le plan recalculé comme si le pli était fait.
 */
export function jugerPliage(a: {
  learning: Pick<LearningState, 'sessionEvents' | 'ideals'>
  element: ElementPliable
  /** Les minutes que ce pli ferait passer aux jours suivants. */
  minutes: number
  tenu: number
  today: string
  bloc: { blockId: string; date: string }
  planApres: PlanningResult
  creations: readonly Creation[]
}): { ok: true; budget: BudgetPliage } | { ok: false; refus: RefusPliage; budget: BudgetPliage } {
  // Le libre et le probable se comparent sur la même période : jusqu'à
  // l'échéance, mais pas au-delà des jours que le plan calcule.
  const dernier = a.planApres.capacities.reduce((m, c) => (c.date > m ? c.date : m), a.today)
  const jusqua = a.element.fin < dernier ? a.element.fin : dernier
  const jours = Math.max(1, daysBetween(a.today, jusqua) + 1)
  const ideal = a.learning.ideals?.[cleIdeal(a.element, a.today)]
  // Le pli fait, plus rien de cet élément aujourd'hui : fait = déjà fait + tenu.
  const fait = faitDe(a.learning, a.element, a.today) + a.tenu
  const budget: BudgetPliage = {
    retardMax: Math.round(RETARD_MAX * a.element.total),
    droit: droitDePlier(a.element, a.today).droit,
    plie: minutesPliees(a.learning, a.element, a.today),
    retard: ideal ? Math.max(0, idealA(ideal, a.today) - fait) : 0,
    libre: libreJusqua(a.planApres, a.today, jusqua),
    attendu: probabiliteCreation(a.creations, a.today, jours).minutesAttendues,
  }
  if (pliageEnPause(a.learning, a.element.refId, a.bloc)) return { ok: false, refus: 'pause', budget }
  if (budget.retard > budget.retardMax) return { ok: false, refus: 'retard', budget }
  if (budget.plie + a.minutes > budget.droit) return { ok: false, refus: 'droit', budget }
  if (budget.libre < budget.attendu) return { ok: false, refus: 'place', budget }
  return { ok: true, budget }
}

/** Ce que l'app dit quand le pli ne passe pas. */
export const MESSAGE_REFUS: Record<RefusPliage, string> = {
  pause: 'Too many folds on this one. 15-minute break, then you finish.',
  retard: 'Already 15% behind. 15-minute break, then you finish.',
  droit: 'No fold earned yet. 15-minute break, then you finish.',
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
