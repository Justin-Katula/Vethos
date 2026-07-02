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

export type FreeTimeOptions = {
  /** Minute locale du réveil déclaré. Ex: 07:00 => 420. */
  wakeMinute?: number | null
  /** Sas obligatoire après réveil. Défaut Vethos: 30 min. */
  morningBufferMinutes?: number
  /** Repos obligatoire après travail/école avant tâches/objectifs. Défaut: 30 min. */
  postWorkSchoolRestMinutes?: number
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

export function parseClockTimeToMinute(value: string | null | undefined): number | null {
  if (!value) return null
  const [hours, minutes] = value.split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return Math.max(0, Math.min(1439, hours! * 60 + minutes!))
}

function applyMorningBuffer(slots: FreeTimeSlot[], options: FreeTimeOptions = {}): FreeTimeSlot[] {
  const wakeMinute = options.wakeMinute
  if (wakeMinute === null || wakeMinute === undefined) return slots
  const bufferEnd = Math.max(
    0,
    Math.min(1440, wakeMinute + (options.morningBufferMinutes ?? 30)),
  )

  return slots.map((slot) => {
    if (slot.endMinute <= bufferEnd) {
      return {
        ...slot,
        startMinute: slot.endMinute,
        durationMinutes: 0,
        isPreparation: true,
      }
    }
    if (slot.startMinute >= bufferEnd) return slot
    const startMinute = bufferEnd
    const durationMinutes = slot.endMinute - startMinute
    return {
      ...slot,
      startMinute,
      durationMinutes,
      isPreparation: slot.isPreparation || durationMinutes < 15,
    }
  })
}

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number) as [number, number, number]
  return new Date(year, month - 1, day)
}

function daysBetweenLocalDates(fromDateStr: string, toDateStr: string): number {
  const from = parseLocalDate(fromDateStr)
  const to = parseLocalDate(toDateStr)
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

export type DeadlineImpact = 'recoverable' | 'hard'

export const TASK_ESTIMATED_MINUTES_BY_LEVEL: Record<number, number> = {
  1: 30,
  2: 50,
  3: 80,
  4: 120,
  5: 180,
  6: 260,
  7: 360,
  8: 480,
  9: 640,
  10: 840,
}

export function estimateMinutesForLevel(level: number): number {
  const safeLevel = Math.max(1, Math.min(10, Math.round(level)))
  return TASK_ESTIMATED_MINUTES_BY_LEVEL[safeLevel] ?? TASK_ESTIMATED_MINUTES_BY_LEVEL[5]!
}

export function getDeadlineMultiplier(
  deadlineDateStr: string,
  todayStr: string,
  impact: DeadlineImpact = 'recoverable',
): number {
  void impact
  const diffDays = daysBetweenLocalDates(todayStr, deadlineDateStr)
  if (diffDays <= 0) return 0
  if (diffDays === 1) return 2
  if (diffDays <= 3) return 1.6
  if (diffDays <= 7) return 1.3
  return 1
}

/**
 * Calcule tous les créneaux de temps libre pour un jour donné.
 * Applique les règles de préparation et de transition.
 */
export function computeFreeTimeSlots(
  dayOfWeek: number,
  entries: ScheduleEntry[],
  rules: TimeRule[],
  options: FreeTimeOptions = {},
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
    return applyMorningBuffer([
      { dayOfWeek, startMinute: 0, endMinute: 1440, durationMinutes: 1440, isPreparation: false },
    ], options)
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

    // Règle : après travail/école, protéger 30 minutes avant tout travail Vethos.
    if (prevRule && isSchoolOrWorkRule(prevRule)) {
      const rest = Math.min(options.postWorkSchoolRestMinutes ?? 30, slot.durationMinutes)
      slot.startMinute += rest
      slot.durationMinutes -= rest
      if (slot.durationMinutes <= 0) {
        slot.isPreparation = true
      }
    }

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

    if (slot.durationMinutes < 15) {
      slot.isPreparation = true
    }
  }

  return applyMorningBuffer(slots, options)
}

/**
 * Calcule le temps libre total pour un jour donné (en excluant les créneaux de préparation).
 */
export function computeDayFreeMinutes(
  dayOfWeek: number,
  entries: ScheduleEntry[],
  rules: TimeRule[],
  options: FreeTimeOptions = {},
): number {
  const slots = computeFreeTimeSlots(dayOfWeek, entries, rules, options)
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
  const newLevel = currentLevel - 1
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

// ─── Réconciliation des tâches actives ──────────────────────────────────────

/**
 * Évent généré par la réconciliation niveau 0 (V2 P9). Permet à
 * `tasks.store` de fire la notification native correspondante.
 */
export type TaskReconciliationEvent =
  | { type: 'task-completed'; taskId: string; taskTitle: string }
  | { type: 'task-expired'; taskId: string; taskTitle: string }
  | { type: 'task-queued'; taskId: string; taskTitle: string; objectiveId: string }
  | {
      type: 'task-activated'
      taskId: string
      taskTitle: string
      objectiveId: string
      deadline: string
    }
  | {
      type: 'task-auto-degraded'
      taskId: string
      taskTitle: string
      oldLevel: number
      newLevel: number
    }

export type TaskReconciliation = {
  updated: Task[]
  events: TaskReconciliationEvent[]
}

function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addMinutesToDateStr(todayStr: string, minutes: number): { deadline: string; deadlineTime?: string } {
  const start = parseLocalDate(todayStr)
  const next = new Date(start.getTime() + Math.max(0, Math.round(minutes)) * 60_000)
  const deadline = localDateKey(next)
  const deadlineTime =
    next.getHours() === 0 && next.getMinutes() === 0
      ? undefined
      : `${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}`
  return { deadline, deadlineTime }
}

function parseDeadlineMinute(deadlineTime: string | undefined): number | null {
  if (!deadlineTime) return null
  const [hours, minutes] = deadlineTime.split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return Math.max(0, Math.min(1440, hours! * 60 + minutes!))
}

function hasDeadlineReached(task: Task, todayStr: string, now: Date): boolean {
  if (task.deadline < todayStr) return true
  if (task.deadline > todayStr) return false
  const deadlineMinute = parseDeadlineMinute(task.deadlineTime)
  if (deadlineMinute === null) return true
  const nowMinute =
    localDateKey(now) === todayStr ? now.getHours() * 60 + now.getMinutes() : 1440
  return nowMinute >= deadlineMinute
}

function taskRemainingMinutes(task: Task): number {
  return task.remainingMinutes ?? task.estimatedMinutes ?? estimateMinutesForLevel(task.level)
}

function taskFrozenOffsetDays(task: Task): number {
  if (task.frozenDeadlineOffsetDays !== undefined) return task.frozenDeadlineOffsetDays
  const createdDate = localDateKey(new Date(task.createdAt))
  return Math.max(0, daysBetweenLocalDates(createdDate, task.deadline))
}

function taskFrozenOffsetMinutes(task: Task): number {
  if (task.frozenDeadlineOffsetMinutes !== undefined) return task.frozenDeadlineOffsetMinutes
  if (task.frozenDeadlineOffsetDays !== undefined) return task.frozenDeadlineOffsetDays * 1440
  const created = new Date(task.createdAt)
  const [year, month, day] = task.deadline.split('-').map(Number) as [number, number, number]
  const deadlineMinute = parseDeadlineMinute(task.deadlineTime)
  const deadline = new Date(
    year,
    month - 1,
    day,
    deadlineMinute === null ? 0 : Math.floor(deadlineMinute / 60),
    deadlineMinute === null ? 0 : deadlineMinute % 60,
  )
  return Math.max(0, Math.round((deadline.getTime() - created.getTime()) / 60_000))
}

function freezeQueuedTask(task: Task, now: Date): Task {
  const offsetMinutes = taskFrozenOffsetMinutes(task)
  return {
    ...task,
    status: 'queued',
    frozenDeadlineOffsetDays: taskFrozenOffsetDays(task),
    frozenDeadlineOffsetMinutes: offsetMinutes,
    queuedAt: task.queuedAt ?? now.toISOString(),
  }
}

function activateQueuedTask(task: Task, todayStr: string, now: Date): Task {
  const offsetMinutes = taskFrozenOffsetMinutes(task)
  const nextDeadline = addMinutesToDateStr(todayStr, offsetMinutes)
  return {
    ...task,
    status: 'active',
    deadline: nextDeadline.deadline,
    deadlineTime: task.deadlineTime ? nextDeadline.deadlineTime : task.deadlineTime,
    frozenDeadlineOffsetDays: Math.floor(offsetMinutes / 1440),
    frozenDeadlineOffsetMinutes: offsetMinutes,
    activatedAt: now.toISOString(),
  }
}

function taskPlanningComplexity(task: Task): NonNullable<Task['complexity']> {
  return task.difficulty ?? task.complexity ?? 'normal'
}

function taskQueueComplexityCoefficient(task: Task): number {
  const complexity = taskPlanningComplexity(task)
  if (complexity === 'easy') return 1
  if (complexity === 'normal') return 1.2
  if (complexity === 'hard') return 1.5
  if (complexity === 'manual') return 1
  if (complexity === 'extreme') return 2.4
  return 1.8
}

function taskQueueProgressCoefficient(task: Task): number {
  const estimated = task.estimatedMinutes ?? estimateMinutesForLevel(task.level)
  const remaining = taskRemainingMinutes(task)
  if (estimated <= 0) return 0.3
  const progress = Math.max(0, Math.min(1, (estimated - remaining) / estimated))
  if (progress >= 0.9) return 0.3
  if (progress >= 0.75) return 0.5
  if (progress >= 0.5) return 0.7
  if (progress >= 0.25) return 0.85
  return 1
}

function taskQueueScore(task: Task, todayStr: string): number {
  const deadline =
    task.status === 'queued'
      ? addMinutesToDateStr(todayStr, taskFrozenOffsetMinutes(task)).deadline
      : task.deadline
  return (
    task.level *
    getDeadlineMultiplier(deadline, todayStr, task.deadlineImpact ?? 'recoverable') *
    taskQueueComplexityCoefficient(task) *
    taskQueueProgressCoefficient(task)
  )
}

function compareQueuedTasks(a: Task, b: Task, todayStr: string): number {
  const scoreDiff = taskQueueScore(b, todayStr) - taskQueueScore(a, todayStr)
  if (scoreDiff !== 0) return scoreDiff
  return b.level - a.level || a.createdAt.localeCompare(b.createdAt)
}

function autoDegradeTask(task: Task, now: Date): { task: Task; event: TaskReconciliationEvent | null } {
  const baseline = new Date(task.lastAutoDegradedAt ?? task.createdAt)
  const elapsedSteps = Math.floor((now.getTime() - baseline.getTime()) / (48 * 60 * 60 * 1000))
  if (elapsedSteps <= 0 || task.level <= 0) return { task, event: null }

  const oldLevel = task.level
  const newLevel = Math.max(0, task.level - elapsedSteps)
  if (newLevel === oldLevel) return { task, event: null }

  const degradedAt = new Date(baseline.getTime() + elapsedSteps * 48 * 60 * 60 * 1000)
  return {
    task: {
      ...task,
      level: newLevel,
      lastAutoDegradedAt: degradedAt.toISOString(),
    },
    event: {
      type: 'task-auto-degraded',
      taskId: task.id,
      taskTitle: task.title,
      oldLevel,
      newLevel,
    },
  }
}

function reconcileObjectiveTaskQueues(
  tasks: Task[],
  todayStr: string,
  now: Date,
): TaskReconciliation {
  const events: TaskReconciliationEvent[] = []
  const byObjective = new Map<string, Task[]>()

  for (const task of tasks) {
    if (!task.linkedObjectiveId) continue
    if (task.status !== 'active' && task.status !== 'queued') continue
    if (taskRemainingMinutes(task) <= 0) continue
    byObjective.set(task.linkedObjectiveId, [
      ...(byObjective.get(task.linkedObjectiveId) ?? []),
      task,
    ])
  }

  if (byObjective.size === 0) return { updated: tasks, events }

  const replacements = new Map<string, Task>()

  for (const [objectiveId, objectiveTasks] of byObjective) {
    const ranked = objectiveTasks.slice().sort((a, b) => compareQueuedTasks(a, b, todayStr))
    const winner = ranked[0]
    if (!winner) continue

    for (const task of ranked) {
      if (task.id === winner.id) {
        if (task.status === 'queued') {
          const activated = activateQueuedTask(task, todayStr, now)
          replacements.set(task.id, activated)
          events.push({
            type: 'task-activated',
            taskId: task.id,
            taskTitle: task.title,
            objectiveId,
            deadline: activated.deadline,
          })
        }
        continue
      }

      if (task.status === 'active') {
        const queued = freezeQueuedTask(task, now)
        replacements.set(task.id, queued)
        events.push({
          type: 'task-queued',
          taskId: task.id,
          taskTitle: task.title,
          objectiveId,
        })
      } else if (task.frozenDeadlineOffsetDays === undefined) {
        replacements.set(task.id, freezeQueuedTask(task, now))
      }
    }
  }

  if (replacements.size === 0) return { updated: tasks, events }
  return {
    updated: tasks.map((task) => replacements.get(task.id) ?? task),
    events,
  }
}

/**
 * Réconcilie les tâches actives avec les règles actuelles :
 * - remainingMinutes <= 0 → completed ;
 * - deadline atteinte et remainingMinutes > 0 → expired ;
 * - niveau courant -1 toutes les 48h tant que la tâche reste active.
 */
export function reconcileActiveTasks(
  tasks: Task[],
  todayStr: string,
  now = new Date(),
): TaskReconciliation {
  const events: TaskReconciliationEvent[] = []
  const updated = tasks.map((task) => {
    if (task.status === 'queued') {
      return task.frozenDeadlineOffsetDays === undefined ? freezeQueuedTask(task, now) : task
    }
    if (task.status !== 'active') return task
    const remainingMinutes = taskRemainingMinutes(task)

    if (remainingMinutes <= 0) {
      events.push({ type: 'task-completed', taskId: task.id, taskTitle: task.title })
      return {
        ...task,
        status: 'completed' as const,
        remainingMinutes: 0,
        completedAt: now.toISOString(),
      }
    }

    if (hasDeadlineReached(task, todayStr, now)) {
      events.push({ type: 'task-expired', taskId: task.id, taskTitle: task.title })
      return { ...task, status: 'expired' as const }
    }

    const degraded = autoDegradeTask(task, now)
    if (degraded.event) events.push(degraded.event)
    return degraded.task
  })

  const queued = reconcileObjectiveTaskQueues(updated, todayStr, now)
  return { updated: queued.updated, events: [...events, ...queued.events] }
}

export function reconcileLevelZeroTasks(
  tasks: Task[],
  todayStr: string,
  now = new Date(),
): TaskReconciliation {
  return reconcileActiveTasks(tasks, todayStr, now)
}

export function reconcileObjectiveQueuesOnly(
  tasks: Task[],
  todayStr: string,
  now = new Date(),
): TaskReconciliation {
  return reconcileObjectiveTaskQueues(tasks, todayStr, now)
}

export function applyObjectiveProgressToTasks(
  tasks: Task[],
  objectiveDeltas: Array<{ objectiveId: string; minutes: number }>,
  todayStr: string,
  now = new Date(),
): TaskReconciliation {
  const events: TaskReconciliationEvent[] = []
  let updated = tasks.slice()

  for (const delta of objectiveDeltas) {
    let minutesLeft = Math.max(0, Math.round(delta.minutes))

    while (minutesLeft > 0) {
      const active = updated.find(
        (task) =>
          task.linkedObjectiveId === delta.objectiveId &&
          task.status === 'active' &&
          taskRemainingMinutes(task) > 0,
      )
      if (!active) break

      const remaining = taskRemainingMinutes(active)
      const consumed = Math.min(remaining, minutesLeft)
      minutesLeft -= consumed
      const nextRemaining = remaining - consumed

      updated = updated.map((task) => {
        if (task.id !== active.id) return task
        if (nextRemaining <= 0) {
          events.push({
            type: 'task-completed',
            taskId: task.id,
            taskTitle: task.title,
          })
          return {
            ...task,
            status: 'completed' as const,
            remainingMinutes: 0,
            completedAt: now.toISOString(),
          }
        }
        return { ...task, remainingMinutes: nextRemaining }
      })

      if (nextRemaining <= 0) {
        const queue = reconcileObjectiveTaskQueues(updated, todayStr, now)
        updated = queue.updated
        events.push(...queue.events)
      }
    }
  }

  return { updated, events }
}

export type CognitiveEfficiencySampleInput = {
  taskId?: string
  completedAt: Date
  complexity?: Task['complexity'] | Task['difficulty']
  plannedMinutes: number
  actualMinutes: number
}

function cognitiveComplexityCoefficient(
  complexity: Task['complexity'] | Task['difficulty'] | undefined,
): number {
  if (complexity === 'easy') return 1
  if (complexity === 'normal' || complexity === undefined) return 1.2
  if (complexity === 'hard') return 1.5
  if (complexity === 'manual') return 1
  if (complexity === 'extreme') return 2.4
  return 1.8
}

export function calculateCognitiveEfficiencyScore(input: CognitiveEfficiencySampleInput): number {
  const planned = Math.max(1, Math.round(input.plannedMinutes))
  const actual = Math.max(1, Math.round(input.actualMinutes))
  return Math.max(
    0,
    Math.min(100, (planned / actual) * cognitiveComplexityCoefficient(input.complexity) * 10),
  )
}

export type HourlyEfficiencySample = {
  completedAt: string
  hour: number
  efficiency: number
}

export function rollingHourlyEfficiency(
  samples: HourlyEfficiencySample[],
  now = new Date(),
): Map<number, number> {
  const cutoff = now.getTime() - 14 * 24 * 60 * 60 * 1000
  const buckets = new Map<number, number[]>()
  for (const sample of samples) {
    const completedAt = Date.parse(sample.completedAt)
    if (!Number.isFinite(completedAt) || completedAt < cutoff) continue
    const hour = Math.max(0, Math.min(23, Math.round(sample.hour)))
    buckets.set(hour, [...(buckets.get(hour) ?? []), sample.efficiency])
  }
  const averages = new Map<number, number>()
  for (const [hour, values] of buckets) {
    averages.set(hour, values.reduce((sum, value) => sum + value, 0) / values.length)
  }
  return averages
}

export function peakAlertnessHour(
  samples: HourlyEfficiencySample[],
  fallbackHour = 10,
  now = new Date(),
): number {
  const averages = rollingHourlyEfficiency(samples, now)
  let bestHour = Math.max(0, Math.min(23, Math.round(fallbackHour)))
  let bestScore = Number.NEGATIVE_INFINITY
  for (const [hour, score] of averages) {
    if (score > bestScore) {
      bestScore = score
      bestHour = hour
    }
  }
  return bestHour
}

export type CarryOverClassification = 'life-emergency' | 'procrastination' | 'unknown'

export function classifyCarryOverEvent(args: {
  missedStartAt: Date
  missedEndAt: Date
  idleSeconds: number
  distractingActivityMinutes: number
}): CarryOverClassification {
  const missedMinutes = Math.max(
    1,
    Math.round((args.missedEndAt.getTime() - args.missedStartAt.getTime()) / 60_000),
  )
  if (args.idleSeconds >= Math.min(missedMinutes, 30) * 60) return 'life-emergency'
  if (args.distractingActivityMinutes > 0) return 'procrastination'
  return 'unknown'
}

export type CarryOverPlan =
  | {
      ok: true
      dailyBonusMinutes: number
      risk: boolean
      classification: CarryOverClassification
    }
  | {
      ok: false
      reason: 'capacity-exceeded-by-procrastination'
      classification: CarryOverClassification
    }

export function smoothCarryOverMinutes(args: {
  missedMinutes: number
  remainingDays: number
  currentDailyMinutes: number
  dailyCapMinutes?: number
  classification: CarryOverClassification
}): CarryOverPlan {
  const cap = args.dailyCapMinutes ?? 240
  const days = Math.max(1, Math.round(args.remainingDays))
  const dailyBonusMinutes = Math.ceil(Math.max(0, args.missedMinutes) / days)
  if (args.currentDailyMinutes + dailyBonusMinutes > cap) {
    if (args.classification === 'procrastination') {
      return {
        ok: false,
        reason: 'capacity-exceeded-by-procrastination',
        classification: args.classification,
      }
    }
    return {
      ok: true,
      dailyBonusMinutes,
      risk: true,
      classification: args.classification,
    }
  }
  return {
    ok: true,
    dailyBonusMinutes,
    risk: false,
    classification: args.classification,
  }
}

export function taskDeadlineLabel(task: Pick<Task, 'deadline' | 'deadlineTime'>, todayStr: string): string {
  const diffDays = daysBetweenLocalDates(todayStr, task.deadline)
  if (diffDays < 0) return 'Expirée'
  if (diffDays === 0) return task.deadlineTime ? `À finir avant ${task.deadlineTime}` : "À finir aujourd'hui"
  if (diffDays === 1) {
    return task.deadlineTime ? `Deadline demain ${task.deadlineTime}` : 'Dernier jour'
  }
  if (diffDays <= 7) return `${diffDays} jours`
  return `Dans ${diffDays} jours`
}
