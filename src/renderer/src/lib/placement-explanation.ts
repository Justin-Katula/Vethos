import type { PlacementResult } from '@shared/engine-results'
import type { Objective, Task } from '@shared/schemas'
import type { PlacedBlock } from './placement-engine'
import { buildTaskPriorityResult } from './priority-engine'

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function formatDateMinute(date: string, minute: number): string {
  const hours = String(Math.floor(minute / 60)).padStart(2, '0')
  const minutes = String(minute % 60).padStart(2, '0')
  return `${date}T${hours}:${minutes}:00`
}

function qualityFromScore(score: number): PlacementResult['placementQuality'] {
  if (score >= 85) return 'excellent'
  if (score >= 70) return 'good'
  if (score >= 50) return 'acceptable'
  if (score >= 25) return 'poor'
  return 'impossible'
}

export function buildPlacementResult(
  block: PlacedBlock,
  task?: Task | null,
  objective?: Objective | null,
  context: { usableFreeMinutesBeforeDeadline?: number | null } = {},
): PlacementResult {
  const durationMinutes = Math.max(0, block.endMinute - block.startMinute)
  const reasons: string[] = []
  const warnings: string[] = []
  let score = 55

  if (block.kind === 'break') {
    reasons.push('Ce bloc protège une récupération nécessaire.')
    score = 80
  } else if (task) {
    const priority = buildTaskPriorityResult(task, objective, {
      todayStr: block.date,
      usableFreeMinutesBeforeDeadline: context.usableFreeMinutesBeforeDeadline,
    })
    const remainingMinutes = Number(priority.debug.remainingMinutes ?? 0)
    const usefulChunk = Math.min(90, Math.max(30, remainingMinutes))

    if (durationMinutes >= usefulChunk) {
      reasons.push('Ce créneau a assez de temps pour faire avancer la tâche.')
      score += 20
    } else {
      warnings.push('Ce créneau est court par rapport au travail restant.')
      score -= 15
    }

    if (priority.reasonTags.includes('deadline_soon') || priority.reasonTags.includes('deadline_today')) {
      reasons.push('La deadline approche, donc ce bloc mérite d’être protégé.')
      score += 10
    }
    if (priority.reasonTags.includes('high_complexity') && durationMinutes >= 45) {
      reasons.push('Le bloc est assez long pour une tâche qui demande de la concentration.')
      score += 10
    }
    if (remainingMinutes >= 360 && durationMinutes < 60) {
      warnings.push('La tâche est trop lourde pour être terminée en un seul petit bloc.')
      score -= 10
    }
  } else if (objective) {
    reasons.push('Ce bloc protège un objectif actif.')
    score += objective.level >= 6 ? 20 : 10
    if (durationMinutes >= 45) reasons.push('Le créneau est assez long pour produire un vrai progrès.')
  } else if (block.kind === 'free') {
    reasons.push('Ce bloc reste libre pour éviter de surcharger la journée.')
    score = 70
  } else {
    reasons.push('Ce bloc a été posé par le moteur de planning existant.')
  }

  if (durationMinutes <= 0) {
    warnings.push('La durée du bloc est invalide.')
    score = 0
  }

  const placementScore = clampScore(score)
  return {
    blockId: block.id,
    blockStart: formatDateMinute(block.date, block.startMinute),
    blockEnd: formatDateMinute(block.date, block.endMinute),
    durationMinutes,
    placementQuality: qualityFromScore(placementScore),
    placementScore,
    reasons,
    warnings,
    debug: {
      blockKind: block.kind,
      taskId: task?.id ?? null,
      objectiveId: objective?.id ?? null,
    },
  }
}
