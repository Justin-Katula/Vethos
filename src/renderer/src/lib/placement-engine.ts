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
