/**
 * placement-engine.ts
 *
 * Moteur d'auto-placement (« Calendrier vivant », couche 1). Fonctions pures et
 * déterministes : transforment tâches/objectifs en blocs datés.
 * Réf. spec : docs/superpowers/specs/2026-05-18-nexus-auto-placement-engine-design.md
 */
import type { Objective, ScheduleEntry, Task, TimeRule } from '@shared/schemas'
import { computeFreeTimeSlots, getDeadlineMultiplier } from './free-time-calculator'

// ─── Types ──────────────────────────────────────────────────────────────────

/** Un bloc concret posé sur le calendrier. */
export type PlacedBlock = {
  id: string
  date: string // YYYY-MM-DD
  startMinute: number // 0..1439
  endMinute: number // 1..1440
  kind: 'task' | 'objective' | 'free'
  refId: string | null // id de la tâche/objectif ; null si 'free'
  linkedTaskId: string | null // pour un objectif : tâche liée mise en avant
}

/** Un item qui concourt pour le temps libre (interne au moteur). */
export type PlacementItem = {
  kind: 'task' | 'objective' | 'free'
  refId: string | null
  score: number
  /** Échéance de la tâche (contrainte de placement) ; null pour objectif/temps libre. */
  deadline: string | null
  /** Pour un objectif : tâche liée la plus urgente, mise en avant dans le bloc. */
  linkedTaskId: string | null
}

// ─── Utilitaires de date ────────────────────────────────────────────────────

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d)
}

function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Liste des dates YYYY-MM-DD de `startStr` à `endStr` inclus. */
export function enumerateDates(startStr: string, endStr: string): string[] {
  const end = parseLocalDate(endStr)
  const out: string[] = []
  let cursor = parseLocalDate(startStr)
  while (cursor <= end) {
    out.push(toDateStr(cursor))
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1)
  }
  return out
}

/** 0 = lundi … 6 = dimanche (cohérent avec le reste de l'app). */
function dayOfWeekOf(dateStr: string): number {
  return (parseLocalDate(dateStr).getDay() + 6) % 7
}

// ─── Items & score (spec §1) ────────────────────────────────────────────────

/** Clé stable d'un item. */
export function itemKey(item: PlacementItem): string {
  return item.kind === 'free' ? 'free' : `${item.kind}:${item.refId}`
}

/**
 * Construit les items en concurrence pour le temps libre :
 *  - chaque tâche autonome active de niveau > 0 ;
 *  - chaque objectif de niveau > 0 (score combiné des tâches liées / 1,5) ;
 *  - le temps libre (score = son niveau).
 */
export function buildItems(
  tasks: Task[],
  objectives: Objective[],
  freeTimeLevel: number,
  todayStr: string,
): PlacementItem[] {
  const activeTasks = tasks.filter((t) => t.status === 'active' && t.level > 0)
  const items: PlacementItem[] = []

  // Tâches autonomes (non liées à un objectif).
  for (const task of activeTasks) {
    if (task.linkedObjectiveId !== null) continue
    items.push({
      kind: 'task',
      refId: task.id,
      score: task.level * getDeadlineMultiplier(task.deadline, todayStr),
      deadline: task.deadline,
      linkedTaskId: null,
    })
  }

  // Objectifs : score = (niveau_objectif + Σ scores des tâches liées) / 1,5.
  for (const objective of objectives) {
    // Objectif de niveau 0 = désactivé : on le saute. Ses tâches liées — qui ne
    // sont jamais des items autonomes (cf. boucle ci-dessus) — ne reçoivent donc
    // aucun temps tant que l'objectif est à 0. Comportement voulu (spec §1).
    if (objective.level <= 0) continue
    const linked = activeTasks.filter((t) => t.linkedObjectiveId === objective.id)
    const sumLinked = linked.reduce(
      (sum, t) => sum + t.level * getDeadlineMultiplier(t.deadline, todayStr),
      0,
    )
    const mostUrgent = linked.slice().sort((a, b) => a.deadline.localeCompare(b.deadline))[0]
    items.push({
      kind: 'objective',
      refId: objective.id,
      score: (objective.level + sumLinked) / 1.5,
      deadline: null,
      linkedTaskId: mostUrgent ? mostUrgent.id : null,
    })
  }

  // Temps libre : item concurrent, score = son niveau, jamais multiplié.
  items.push({ kind: 'free', refId: null, score: freeTimeLevel, deadline: null, linkedTaskId: null })

  return items.filter((i) => i.score > 0)
}

// ─── Distribution du budget (spec §4) ───────────────────────────────────────

/**
 * Répartit `totalFreeMinutes` entre les items : chacun reçoit
 * `score / Σ scores × T`, arrondi à 5 min. Le reliquat d'arrondi va à l'item au
 * score le plus élevé. Clé de map = `itemKey`.
 */
export function distributeBudget(
  items: PlacementItem[],
  totalFreeMinutes: number,
): Map<string, number> {
  const budgets = new Map<string, number>()
  if (totalFreeMinutes <= 0 || items.length === 0) return budgets

  const totalScore = items.reduce((sum, i) => sum + i.score, 0)
  if (totalScore <= 0) return budgets

  for (const item of items) {
    const raw = (item.score / totalScore) * totalFreeMinutes
    budgets.set(itemKey(item), Math.round(raw / 5) * 5)
  }

  // Reliquat d'arrondi → item au score le plus élevé. Si `totalFreeMinutes`
  // n'est pas un multiple de 5, ce budget peut ne pas l'être ; placeBlocks
  // ré-arrondit chaque bloc à 5 min et le reliquat impair reste non placé.
  const allocated = [...budgets.values()].reduce((s, v) => s + v, 0)
  const diff = totalFreeMinutes - allocated
  if (diff !== 0) {
    const top = items.slice().sort((a, b) => b.score - a.score)[0]!
    const key = itemKey(top)
    budgets.set(key, Math.max(0, (budgets.get(key) ?? 0) + diff))
  }

  return budgets
}

// ─── Placement des blocs (spec §5) ──────────────────────────────────────────

const MIN_BLOCK = 30 // durée minimale d'un bloc (min)
const MAX_BLOCK = 120 // durée maximale d'un bloc (min)
const MAX_PER_ITEM_PER_DAY = 240 // plafond « 4 h même item / jour »
const MAX_WORK_PER_DAY = 360 // plafond « 6 h de travail / jour »

type WorkSlot = { cursor: number; endMinute: number }

/**
 * Place les budgets (tâches + objectifs) en blocs concrets. Le temps libre
 * n'est pas placé : ce sont les créneaux qui restent vides. Par item, le budget
 * est étalé sur ses jours éligibles ; les tâches ne dépassent jamais leur
 * échéance ; les plafonds par jour sont respectés.
 */
export function placeBlocks(
  items: PlacementItem[],
  budgets: Map<string, number>,
  dates: string[],
  entries: ScheduleEntry[],
  rules: TimeRule[],
): PlacedBlock[] {
  const placeable = items
    .filter((i) => i.kind !== 'free')
    .sort((a, b) => b.score - a.score)

  // Créneaux de travail libres par date (créneaux non-préparation ≥ MIN_BLOCK).
  const slotsByDate = new Map<string, WorkSlot[]>()
  for (const date of dates) {
    slotsByDate.set(
      date,
      computeFreeTimeSlots(dayOfWeekOf(date), entries, rules)
        .filter((s) => !s.isPreparation && s.durationMinutes >= MIN_BLOCK)
        .map((s) => ({ cursor: s.startMinute, endMinute: s.endMinute })),
    )
  }

  const perDayItem = new Map<string, number>() // clé `${date}|${itemKey}`
  const perDayTotal = new Map<string, number>() // clé `date`
  const blocks: PlacedBlock[] = []

  for (const item of placeable) {
    const key = itemKey(item)
    let budget = budgets.get(key) ?? 0
    const eligible = dates.filter(
      (d) => item.kind !== 'task' || item.deadline === null || d <= item.deadline,
    )
    if (eligible.length === 0) continue

    let guard = 0
    while (budget >= MIN_BLOCK && guard < 1000) {
      guard += 1
      // Cible par jour : étale le budget restant sur les jours éligibles.
      const perPass = Math.min(
        MAX_BLOCK,
        Math.max(MIN_BLOCK, Math.floor(budget / eligible.length / 5) * 5),
      )
      let placedThisPass = false
      for (const date of eligible) {
        if (budget < MIN_BLOCK) break
        const dayItem = perDayItem.get(`${date}|${key}`) ?? 0
        const dayTotal = perDayTotal.get(date) ?? 0
        if (dayItem >= MAX_PER_ITEM_PER_DAY || dayTotal >= MAX_WORK_PER_DAY) continue
        const slot = (slotsByDate.get(date) ?? []).find(
          (s) => s.endMinute - s.cursor >= MIN_BLOCK,
        )
        if (!slot) continue
        const size =
          Math.floor(
            Math.min(
              perPass,
              budget,
              slot.endMinute - slot.cursor,
              MAX_PER_ITEM_PER_DAY - dayItem,
              MAX_WORK_PER_DAY - dayTotal,
            ) / 5,
          ) * 5
        if (size < MIN_BLOCK) continue
        blocks.push({
          id: `${date}:${slot.cursor}:${item.kind}:${item.refId ?? ''}`,
          date,
          startMinute: slot.cursor,
          endMinute: slot.cursor + size,
          kind: item.kind,
          refId: item.refId,
          linkedTaskId: item.linkedTaskId,
        })
        slot.cursor += size
        budget -= size
        perDayItem.set(`${date}|${key}`, dayItem + size)
        perDayTotal.set(date, dayTotal + size)
        placedThisPass = true
      }
      if (!placedThisPass) break
    }
  }

  return blocks
}

// ─── Fonction publique (spec §3, §10) ───────────────────────────────────────

export type ComputePlacementInput = {
  tasks: Task[]
  objectives: Objective[]
  rules: TimeRule[]
  entries: ScheduleEntry[]
  freeTimeLevel: number
  /** Premier jour planifié + ancre du multiplicateur d'échéance. */
  todayStr: string
  /** Dernier jour planifié (todayStr + 6 pour le plan opérationnel ; fin du mois pour l'aperçu). */
  rangeEndStr: string
}

/**
 * Calcule le plan : place tâches et objectifs en blocs datés de `todayStr` à
 * `rangeEndStr`. Pure et déterministe — mêmes entrées ⇒ même sortie.
 */
export function computePlacement(input: ComputePlacementInput): PlacedBlock[] {
  const { tasks, objectives, rules, entries, freeTimeLevel, todayStr, rangeEndStr } = input
  const dates = enumerateDates(todayStr, rangeEndStr)
  if (dates.length === 0) return []

  const items = buildItems(tasks, objectives, freeTimeLevel, todayStr)

  // Temps libre total de la plage (créneaux hors préparation).
  let totalFree = 0
  for (const date of dates) {
    for (const slot of computeFreeTimeSlots(dayOfWeekOf(date), entries, rules)) {
      if (!slot.isPreparation) totalFree += slot.durationMinutes
    }
  }

  const budgets = distributeBudget(items, totalFree)
  return placeBlocks(items, budgets, dates, entries, rules)
}

// ─── Charge quotidienne — vue Mois (spec §8.3) ──────────────────────────────

export type DailyLoad = {
  date: string
  workedMinutes: number
  /** Temps libre restant = temps libre total du jour − temps travaillé placé. */
  freeMinutes: number
}

/**
 * Pour chaque date, calcule le temps travaillé (somme des blocs tâche/objectif)
 * et le temps libre restant. Sert à colorer la vue Mois.
 */
export function summarizeDailyLoad(
  blocks: PlacedBlock[],
  dates: string[],
  entries: ScheduleEntry[],
  rules: TimeRule[],
): DailyLoad[] {
  return dates.map((date) => {
    let totalSlot = 0
    for (const slot of computeFreeTimeSlots(dayOfWeekOf(date), entries, rules)) {
      if (!slot.isPreparation) totalSlot += slot.durationMinutes
    }
    const workedMinutes = blocks
      .filter((b) => b.date === date && b.kind !== 'free')
      .reduce((sum, b) => sum + (b.endMinute - b.startMinute), 0)
    return { date, workedMinutes, freeMinutes: Math.max(0, totalSlot - workedMinutes) }
  })
}

// ─── Cooldown du niveau de temps libre (spec §2) ────────────────────────────

const FREE_TIME_LEVEL_COOLDOWN_DAYS = 14

/** Vrai si le niveau de temps libre peut être changé (cooldown 2 semaines respecté). */
export function canChangeFreeTimeLevel(changedAt: string | undefined, now: Date): boolean {
  if (!changedAt) return true
  const diffDays = (now.getTime() - new Date(changedAt).getTime()) / 86_400_000
  return diffDays >= FREE_TIME_LEVEL_COOLDOWN_DAYS
}

/** Nombre de jours restants avant de pouvoir changer le niveau de temps libre. */
export function daysUntilFreeTimeLevelChange(changedAt: string | undefined, now: Date): number {
  if (!changedAt) return 0
  const diffDays = (now.getTime() - new Date(changedAt).getTime()) / 86_400_000
  return Math.max(0, Math.ceil(FREE_TIME_LEVEL_COOLDOWN_DAYS - diffDays))
}
