import type { ProposedPlacementBlock } from '@shared/placement-model'
import type { SessionTargetType } from '@shared/session-model'
import { AnyDeadlineCrisisContext, AnyObjectiveModel, AnyPriorityScore, AnyTaskModel } from './placement-input-adapter'

export interface BuildSessionInputParams {
  placementBlock: ProposedPlacementBlock
  taskModelsV2?: AnyTaskModel[]
  objectiveModelsV2?: AnyObjectiveModel[]
  priorityScoresV2?: AnyPriorityScore[]
  deadlineCrisisContexts?: AnyDeadlineCrisisContext[]
  userModel?: unknown
  now?: string
}

export interface SessionInputData {
  targetType: SessionTargetType
  targetId: string
  linkedTask?: AnyTaskModel
  linkedObjective?: AnyObjectiveModel
  priorityScore?: AnyPriorityScore
  deadlineCrisisContext?: AnyDeadlineCrisisContext
  userModel?: unknown
  placementBlock: ProposedPlacementBlock
  warnings: string[]
  confidence: number
}

export function buildSessionInputFromPlacement(input: BuildSessionInputParams): SessionInputData {
  const warnings: string[] = []
  let confidence = 100

  const { placementBlock, taskModelsV2 = [], objectiveModelsV2 = [], priorityScoresV2 = [], deadlineCrisisContexts = [] } = input

  let targetType = placementBlock.targetType as SessionTargetType
  const targetId = placementBlock.targetId
  
  if (targetType !== 'task' && targetType !== 'objective' && targetType !== 'strategy_block') {
    warnings.push(`Type de cible inattendu: ${targetType}. Rétrogradation à strategy_block.`)
    targetType = 'strategy_block'
    confidence -= 20
  }

  const linkedTask = taskModelsV2.find((t) => t.id === targetId)
  const linkedObjective = objectiveModelsV2.find((o) => o.id === targetId)

  if (targetType === 'task' && !linkedTask) {
    warnings.push(`Tâche ${targetId} introuvable pour ce bloc.`)
    confidence -= 40
  }

  if (targetType === 'objective' && !linkedObjective) {
    warnings.push(`Objectif ${targetId} introuvable pour ce bloc.`)
    confidence -= 30
  }

  const priorityScore = priorityScoresV2.find((s) => s.targetId === targetId)
  const deadlineCrisisContext = deadlineCrisisContexts.find((c) => c.targetId === targetId)

  if (placementBlock.durationMinutes <= 0) {
    warnings.push(`Le bloc proposé a une durée invalide de ${placementBlock.durationMinutes} minutes.`)
    confidence -= 50
  }

  return {
    targetType,
    targetId,
    linkedTask,
    linkedObjective,
    priorityScore,
    deadlineCrisisContext,
    userModel: input.userModel,
    placementBlock,
    warnings,
    confidence: Math.max(0, Math.min(100, confidence)),
  }
}
