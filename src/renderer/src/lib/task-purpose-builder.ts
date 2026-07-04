import type { PriorityResult, UnderstandingCategory } from '@shared/engine-results'
import type { ObjectiveModelV2 } from '@shared/objective-model'
import type { Objective, Task } from '@shared/schemas'
import type { TaskPurpose, TaskPurposeStrength } from '@shared/task-model'

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)))
}

function purposeStrength(score: number): TaskPurposeStrength {
  if (score >= 85) return 'mission_critical'
  if (score >= 65) return 'important'
  if (score >= 35) return 'supporting'
  return 'unknown'
}

export type BuildTaskPurposeInput = {
  task: Task
  objective?: Objective | null
  objectiveModel?: ObjectiveModelV2 | null
  priority: PriorityResult
  domain: UnderstandingCategory
  understandingReasons: string[]
}

export function buildTaskPurpose(args: BuildTaskPurposeInput): TaskPurpose {
  const objectiveBoost = args.objectiveModel?.mission.declaredImportanceScore ?? (args.objective ? 65 : 0)
  const importanceScore = clampScore(Math.max(args.priority.valueScore, objectiveBoost))
  const lifeImpactScore = clampScore(args.objectiveModel?.mission.lifeImpactScore ?? args.priority.valueScore)
  const reasons = unique([
    ...args.understandingReasons,
    ...(args.objective ? [`Liée à l’objectif : ${args.objective.name}.`] : []),
    ...(args.objectiveModel ? ['Le modèle vivant de l’objectif renforce le contexte de cette tâche.'] : []),
  ])
  if (reasons.length === 0) {
    reasons.push('Objectif et contexte implicites.')
  }

  return {
    label: args.task.title,
    domain:
      args.objectiveModel?.mission.domain === 'future'
        ? 'unknown'
        : (args.objectiveModel?.mission.domain ?? args.domain),
    strength: purposeStrength(importanceScore),
    importanceScore,
    lifeImpactScore,
    objectiveName: args.objective?.name,
    reasons,
  }
}
