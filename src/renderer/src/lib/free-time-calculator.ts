/**
 * free-time-calculator.ts
 *
 * Calcule le temps libre de l'utilisateur à partir de son emploi du temps
 * (schedule entries), puis distribue ce temps entre les tâches et objectifs
 * selon la formule du prompt :
 *
 *   part = (niveau × multiplicateur_deadline) / somme_scores × temps_libre_total
 *   Arrondi au multiple de 5 minutes.
 *
 * Règles spéciales :
 *   - Si < 1h01 (61 min) entre une activité fixe et école/travail → préparation, pas temps libre
 *   - Si trajet retour → sommeil : max 30 min de transition
 */

import type { ScheduleEntry, TimeRule, Task } from '@shared/schemas'

// ─── Types ──────────────────────────────────────────────────────────────────

export type FreeTimeSlot = {
  dayOfWeek: number
  startMinute: number
  endMinute: number
  durationMinutes: number
  /** true si ce créneau est trop court pour être du vrai temps libre (préparation) */
  isPreparation: boolean
}



// ─── Calcul des créneaux libres ─────────────────────────────────────────────

/** Identifie si une règle est une activité fixe (école, travail, sommeil). */
function isFixedActivity(rule: TimeRule): boolean {
  if (rule.categoryType) {
    return ['sleep', 'school', 'work', 'commitment'].includes(rule.categoryType)
  }
  const n = rule.name.toLowerCase()
  return (
    n.includes('école') ||
    n.includes('ecole') ||
    n.includes('school') ||
    n.includes('travail') ||
    n.includes('work') ||
    n.includes('job') ||
    n.includes('sommeil') ||
    n.includes('sleep') ||
    n.includes('dodo') ||
    n.includes('cours') ||
    n.includes('class')
  )
}

/** Identifie si une règle est du sommeil. */
function isSleepRule(rule: TimeRule): boolean {
  if (rule.categoryType) return rule.categoryType === 'sleep'
  const n = rule.name.toLowerCase()
  return n.includes('sommeil') || n.includes('sleep') || n.includes('dodo')
}

function isSchoolOrWorkRule(rule: TimeRule): boolean {
  if (rule.categoryType) return rule.categoryType === 'school' || rule.categoryType === 'work'
  const n = rule.name.toLowerCase()
  return (
    n.includes('école') ||
    n.includes('ecole') ||
    n.includes('school') ||
    n.includes('travail') ||
    n.includes('work') ||
    n.includes('job') ||
    n.includes('cours') ||
    n.includes('class')
  )
}

function isFreeRule(rule: TimeRule): boolean {
  if (rule.categoryType) return rule.categoryType === 'free'
  const n = rule.name.toLowerCase()
  return n.includes('temps libre') || n.includes('free time')
}

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number) as [number, number, number]
  return new Date(year, month - 1, day)
}

function daysBetweenLocalDates(fromDateStr: string, toDateStr: string): number {
  const from = parseLocalDate(fromDateStr)
  const to = parseLocalDate(toDateStr)
  return Math.ceil((to.getTime() - from.getTime()) / 86_400_000)
}

export function getDeadlineMultiplier(deadlineDateStr: string, todayStr: string): number {
  const diffDays = daysBetweenLocalDates(todayStr, deadlineDateStr)

  if (diffDays < 0) return 1.0
  if (diffDays > 7) return 1.0
  if (diffDays >= 4 && diffDays <= 7) return 1.3
  if (diffDays >= 2 && diffDays <= 3) return 1.6
  return 2.0
}

/**
 * Calcule tous les créneaux de temps libre pour un jour donné.
 * Applique les règles de préparation et de transition.
 */
export function computeFreeTimeSlots(
  dayOfWeek: number,
  entries: ScheduleEntry[],
  rules: TimeRule[],
): FreeTimeSlot[] {
  const ruleById = new Map(rules.map((r) => [r.id, r]))
  const dayEntries = entries
    .filter((e) => {
      if (e.dayOfWeek !== dayOfWeek) return false
      const rule = ruleById.get(e.ruleId)
      if (!rule || isFreeRule(rule)) return false
      return isFixedActivity(rule)
    })
    .sort((a, b) => a.startMinute - b.startMinute)

  if (dayEntries.length === 0) {
    return [
      { dayOfWeek, startMinute: 0, endMinute: 1440, durationMinutes: 1440, isPreparation: false },
    ]
  }

  const slots: FreeTimeSlot[] = []

  // Créneaux entre les activités
  let cursor = 0
  for (const entry of dayEntries) {
    if (entry.startMinute > cursor) {
      const gap = entry.startMinute - cursor
      slots.push({
        dayOfWeek,
        startMinute: cursor,
        endMinute: entry.startMinute,
        durationMinutes: gap,
        isPreparation: false,
      })
    }
    cursor = Math.max(cursor, entry.endMinute)
  }
  // Créneau après la dernière activité
  if (cursor < 1440) {
    slots.push({
      dayOfWeek,
      startMinute: cursor,
      endMinute: 1440,
      durationMinutes: 1440 - cursor,
      isPreparation: false,
    })
  }

  // Appliquer les règles de préparation
  for (const slot of slots) {
    // Trouver l'activité qui suit ce créneau
    const nextEntry = dayEntries.find((e) => e.startMinute >= slot.endMinute)
    const nextRule = nextEntry ? ruleById.get(nextEntry.ruleId) : null

    // Trouver l'activité qui précède ce créneau
    const prevEntry = [...dayEntries].reverse().find((e) => e.endMinute <= slot.startMinute)
    const prevRule = prevEntry ? ruleById.get(prevEntry.ruleId) : null

    // Règle : si < 1h01 avant école/travail → préparation, pas temps libre.
    if (nextRule && isSchoolOrWorkRule(nextRule)) {
      if (slot.durationMinutes < 61) {
        slot.isPreparation = true
      }
    }

    // Règle : transition vers sommeil → soustraire au maximum 30 min juste avant le sommeil.
    if (nextRule && isSleepRule(nextRule)) {
      const transition = Math.min(30, slot.durationMinutes)
      slot.endMinute -= transition
      slot.durationMinutes -= transition
      if (slot.durationMinutes <= 0) {
        slot.isPreparation = true
      }
    }

    if (prevRule && isFixedActivity(prevRule) && slot.durationMinutes <= 0) {
      slot.isPreparation = true
    }
  }

  return slots
}

/**
 * Calcule le temps libre total pour un jour donné (en excluant les créneaux de préparation).
 */
export function computeDayFreeMinutes(
  dayOfWeek: number,
  entries: ScheduleEntry[],
  rules: TimeRule[],
): number {
  const slots = computeFreeTimeSlots(dayOfWeek, entries, rules)
  return slots.filter((s) => !s.isPreparation).reduce((sum, s) => sum + s.durationMinutes, 0)
}



// ─── Niveaux : dégradation et cooldown ──────────────────────────────────────

/** Niveau minimum autorisé selon le niveau actuel */
export function getMinimumLevel(currentLevel: number): number {
  if (currentLevel >= 10) return 3
  if (currentLevel === 9) return 2
  if (currentLevel === 8) return 1
  return 0
}

/** Dégradation automatique (-0.5 par jour bien travaillé) */
export function applyAutomaticDegradation(currentLevel: number): number {
  const newLevel = currentLevel - 0.5
  return Math.max(getMinimumLevel(currentLevel), newLevel)
}

/** Valide une modification manuelle de niveau (±2 max) */
export function clampManualLevelChange(currentLevel: number, desiredLevel: number): number {
  const diff = desiredLevel - currentLevel
  if (diff > 2) return currentLevel + 2
  if (diff < -2) {
    const candidate = currentLevel - 2
    return Math.max(candidate, getMinimumLevel(currentLevel))
  }
  if (desiredLevel < currentLevel) {
    return Math.max(desiredLevel, getMinimumLevel(currentLevel))
  }
  return desiredLevel
}

/** Vérifie si le cooldown de 2 jours est respecté */
export function canChangeLevel(lastLevelChangeAt: string | undefined): boolean {
  if (!lastLevelChangeAt) return true
  const last = new Date(lastLevelChangeAt)
  const now = new Date()
  const diffMs = now.getTime() - last.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  return diffDays >= 2
}

/** Nombre de jours restants avant de pouvoir changer le niveau */
export function daysUntilLevelChange(lastLevelChangeAt: string | undefined): number {
  if (!lastLevelChangeAt) return 0
  const last = new Date(lastLevelChangeAt)
  const now = new Date()
  const diffMs = now.getTime() - last.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  return Math.max(0, Math.ceil(2 - diffDays))
}

/** Format du temps : heures si ≥60 min, sinon minutes */
export function formatAllocatedTime(minutes: number): string {
  const safeMinutes = Math.max(0, Math.round(minutes))
  if (safeMinutes >= 60) {
    const h = Math.floor(safeMinutes / 60)
    const m = safeMinutes % 60
    return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
  }
  return `${safeMinutes}min`
}

// ─── Réconciliation niveau 0 ────────────────────────────────────────────────

/**
 * Évent généré par la réconciliation niveau 0 (V2 P9). Permet à
 * `tasks.store` de fire la notification native correspondante.
 */
export type LevelZeroEvent =
  | { type: 'task-forced-three'; taskId: string; taskTitle: string }
  | { type: 'task-auto-rescued'; taskId: string; taskTitle: string; daysLeft: number }
  | { type: 'task-accomplished'; taskId: string; taskTitle: string }
  | { type: 'task-still-zero'; taskId: string; taskTitle: string }

export type LevelZeroReconciliation = {
  updated: Task[]
  events: LevelZeroEvent[]
}

/**
 * Pour chaque tâche au niveau 0 active, applique la règle V2 P9 :
 *
 * - Deadline passée → marquée `'history'` (accomplie même à 0).
 * - Deadline < 1 jour → niveau forcé à 3 (urgent).
 * - 2-6 jours avant deadline → niveau remonté à 1 automatiquement.
 * - ≥ 7 jours → reste à 0 (visible sur l'accueil, hors distribution).
 *
 * Pure : prend la liste de tâches + une date locale, renvoie la liste
 * modifiée + les évents pour le caller (tasks.store) qui s'occupe du
 * persist et des notifs.
 */
export function reconcileLevelZeroTasks(tasks: Task[], todayStr: string): LevelZeroReconciliation {
  const events: LevelZeroEvent[] = []
  const updated = tasks.map((task) => {
    if (task.status !== 'active' || task.level !== 0) return task
    const daysLeft = daysBetweenLocalDates(todayStr, task.deadline)

    if (daysLeft < 0) {
      events.push({ type: 'task-accomplished', taskId: task.id, taskTitle: task.title })
      return { ...task, status: 'history' as const }
    }
    if (daysLeft < 1) {
      events.push({ type: 'task-forced-three', taskId: task.id, taskTitle: task.title })
      return {
        ...task,
        level: 3,
        lastLevelChangeAt: new Date().toISOString(),
      }
    }
    if (daysLeft >= 2 && daysLeft <= 6) {
      events.push({
        type: 'task-auto-rescued',
        taskId: task.id,
        taskTitle: task.title,
        daysLeft,
      })
      return {
        ...task,
        level: 1,
        lastLevelChangeAt: new Date().toISOString(),
      }
    }
    events.push({ type: 'task-still-zero', taskId: task.id, taskTitle: task.title })
    return task
  })
  return { updated, events }
}
