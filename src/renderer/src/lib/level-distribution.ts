import { Task } from '@shared/schemas'

export function getDeadlineMultiplier(deadlineDateStr: string, todayStr: string): number {
  const diffDays = daysBetweenLocalDates(todayStr, deadlineDateStr)

  if (diffDays < 0) return 1.0
  if (diffDays > 7) return 1.0
  if (diffDays >= 4 && diffDays <= 7) return 1.3
  if (diffDays >= 2 && diffDays <= 3) return 1.6
  return 2.0
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

export type DistributedFreeTime = {
  taskId: string
  scoreReel: number
  minutes: number
}

export function distributeFreeTime(
  tasks: Task[], 
  totalFreeTimeMinutes: number, 
  todayStr: string
): DistributedFreeTime[] {
  // Only active tasks
  const activeTasks = tasks.filter(t => t.status === 'active' && t.level > 0)
  if (activeTasks.length === 0 || totalFreeTimeMinutes <= 0) {
    return activeTasks.map(t => ({ taskId: t.id, scoreReel: 0, minutes: 0 }))
  }

  // Calculate real scores
  const scores = activeTasks.map(task => {
    const multiplier = getDeadlineMultiplier(task.deadline, todayStr)
    const scoreReel = task.level * multiplier
    return { taskId: task.id, scoreReel }
  })

  const totalScore = scores.reduce((sum, item) => sum + item.scoreReel, 0)
  
  if (totalScore === 0) {
    return activeTasks.map(t => ({ taskId: t.id, scoreReel: 0, minutes: 0 }))
  }

  const results: DistributedFreeTime[] = []
  
  for (const item of scores) {
    // Part = (niveau × multiplicateur) / somme totale × temps libre
    const rawMinutes = (item.scoreReel / totalScore) * totalFreeTimeMinutes
    // Arrondi au multiple de 5 minutes le plus proche
    const roundedMinutes = Math.round(rawMinutes / 5) * 5
    results.push({
      taskId: item.taskId,
      scoreReel: item.scoreReel,
      minutes: roundedMinutes
    })
  }

  const totalRounded = results.reduce((sum, item) => sum + item.minutes, 0)
  const diff = totalFreeTimeMinutes - totalRounded
  if (diff !== 0) {
    const top = scores.slice().sort((a, b) => b.scoreReel - a.scoreReel)[0]
    const target = top ? results.find((item) => item.taskId === top.taskId) : undefined
    if (target) target.minutes = Math.max(0, target.minutes + diff)
  }

  return results
}

/**
 * Calcul du niveau minimum autorisé selon le niveau actuel
 */
export function getMinimumLevel(currentLevel: number): number {
  if (currentLevel >= 10) return 3
  if (currentLevel === 9) return 2
  if (currentLevel === 8) return 1
  return 0 // <= 7 peut aller à 0
}

/**
 * Applique la dégradation automatique d'une tâche bien travaillée
 */
export function applyAutomaticDegradation(currentLevel: number): number {
  const newLevel = currentLevel - 0.5
  const minLevel = getMinimumLevel(currentLevel)
  return Math.max(minLevel, newLevel)
}

/**
 * Valide une modification manuelle de niveau (+/- 2 max)
 */
export function clampManualLevelChange(currentLevel: number, desiredLevel: number): number {
  const diff = desiredLevel - currentLevel
  if (diff > 2) return currentLevel + 2
  if (diff < -2) {
    const candidate = currentLevel - 2
    const minLevel = getMinimumLevel(currentLevel)
    return Math.max(candidate, minLevel)
  }
  if (desiredLevel < currentLevel) {
      return Math.max(desiredLevel, getMinimumLevel(currentLevel))
  }
  return desiredLevel
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
export function reconcileLevelZeroTasks(
  tasks: Task[],
  todayStr: string,
): LevelZeroReconciliation {
  const events: LevelZeroEvent[] = []
  const updated = tasks.map((t) => {
    if (t.status !== 'active' || t.level !== 0) return t
    const daysLeft = daysBetweenLocalDates(todayStr, t.deadline)

    if (daysLeft < 0) {
      events.push({ type: 'task-accomplished', taskId: t.id, taskTitle: t.title })
      return { ...t, status: 'history' as const }
    }
    if (daysLeft < 1) {
      events.push({ type: 'task-forced-three', taskId: t.id, taskTitle: t.title })
      return {
        ...t,
        level: 3,
        lastLevelChangeAt: new Date().toISOString(),
      }
    }
    if (daysLeft >= 2 && daysLeft <= 6) {
      events.push({
        type: 'task-auto-rescued',
        taskId: t.id,
        taskTitle: t.title,
        daysLeft,
      })
      return {
        ...t,
        level: 1,
        lastLevelChangeAt: new Date().toISOString(),
      }
    }
    // daysLeft >= 7 ou == 1 (cas frontalier qu'on laisse) — pas de changement
    events.push({ type: 'task-still-zero', taskId: t.id, taskTitle: t.title })
    return t
  })
  return { updated, events }
}
