import type { Objective, RegistryItem, Task } from '@shared/schemas'
import type { PlacedBlock } from './placement-engine'
import { buildObjectiveStatus } from './objective-intelligence'
import { buildObjectivePriorityResult, buildTaskPriorityResult } from './priority-engine'

export type EngineDiagnostics = {
  analyzedTasks: number
  analyzedObjectives: number
  analyzedBlocks: number
  tasksWithoutExplanation: string[]
  objectivesWithoutStatus: string[]
  priorityDifferences: Array<{
    taskId: string
    legacyApproxScore: number
    priorityScore: number
    difference: number
  }>
  registryItemsAvailable: number
  warnings: string[]
}

export function runEngineDiagnostics(
  tasks: Task[] = [],
  objectives: Objective[] = [],
  schedule: PlacedBlock[] = [],
  registry: RegistryItem[] = [],
): EngineDiagnostics {
  const tasksWithoutExplanation: string[] = []
  const objectivesWithoutStatus: string[] = []
  const priorityDifferences = tasks.map((task) => {
    const objective = objectives.find((item) => item.id === task.linkedObjectiveId) ?? null
    const priority = buildTaskPriorityResult(task, objective)
    if (priority.humanReasons.length === 0) tasksWithoutExplanation.push(task.id)
    const legacyApproxScore = Math.round(task.level * 10)
    return {
      taskId: task.id,
      legacyApproxScore,
      priorityScore: priority.priorityScore,
      difference: Math.abs(legacyApproxScore - priority.priorityScore),
    }
  })

  for (const objective of objectives) {
    const linkedTasks = tasks.filter((task) => task.linkedObjectiveId === objective.id)
    const status = buildObjectiveStatus(objective, linkedTasks)
    const priority = buildObjectivePriorityResult(objective, linkedTasks)
    if (status.reasons.length === 0 && priority.humanReasons.length === 0) {
      objectivesWithoutStatus.push(objective.id)
    }
  }

  const warnings: string[] = []
  const largeDifferences = priorityDifferences.filter((item) => item.difference >= 40)
  if (largeDifferences.length > 0) {
    warnings.push('Certaines tâches ont un gros écart entre le niveau actuel et le nouveau score.')
  }

  return {
    analyzedTasks: tasks.length,
    analyzedObjectives: objectives.length,
    analyzedBlocks: schedule.length,
    tasksWithoutExplanation,
    objectivesWithoutStatus,
    priorityDifferences,
    registryItemsAvailable: registry.length,
    warnings,
  }
}
