import type {
  ExecutionPreviewSanitizedSnapshot,
  ProposedPipelineBuildResult,
  ProposedPipelineBuildMode,
} from '@shared/execution-preview-data-connector-model'

import { buildExecutionPreviewPlanV2 } from './execution-preview-plan-builder'

export type ProposedPipelineInput = {
  snapshot: ExecutionPreviewSanitizedSnapshot
  now?: string
  idFactory?: () => string
}

export function runExecutionPreviewProposedPipeline(
  input: ProposedPipelineInput
): ProposedPipelineBuildResult {
  const { snapshot, now } = input
  const warnings: string[] = [...snapshot.warnings]
  const errors: string[] = []
  let confidence = snapshot.confidence
  let mode: ProposedPipelineBuildMode = 'preview_only'

  if (snapshot.userId === 'MISSING_USER_ID') {
    errors.push("Impossible de construire le pipeline proposé : userId manquant.")
    return {
      mode: 'unsafe',
      warnings,
      errors,
      confidence: 0,
    }
  }

  try {
    // Appel au constructeur pur principal V2 (du Point 10)
    const previewPlan = buildExecutionPreviewPlanV2({
      userId: snapshot.userId,
      dateRange: snapshot.dateRange,
      taskModelsV2: snapshot.tasks,
      objectiveModelsV2: snapshot.objectives,
      // Pass other fields as needed for the builder
      settings: snapshot.settings,
      now,
      idFactory: input.idFactory,
    })

    if (previewPlan.mode === 'unsafe' || previewPlan.mode === 'manual_review_required') {
      mode = previewPlan.mode
    } else if (previewPlan.status === 'partial_preview') {
      mode = 'partial_preview'
    }

    warnings.push(...previewPlan.summary.totalWarnings ? ['Des warnings existent dans le plan généré.'] : [])
    confidence = Math.min(confidence, previewPlan.confidence)

    return {
      mode,
      previewPlan,
      userModel: undefined,
      objectiveModelsV2: snapshot.objectives,
      taskModelsV2: snapshot.tasks,
      priorityScoresV2: undefined,
      planningContextV2: undefined,
      placementPlanV2: undefined,
      sessionPlansV2: undefined,
      runtimeCoordinatorPlansV2: undefined,
      warnings,
      errors,
      confidence: Math.max(0, confidence),
    }

  } catch (err) {
    errors.push(`Erreur fatale dans le pipeline proposé : ${err instanceof Error ? err.message : String(err)}`)
    return {
      mode: 'unsafe',
      warnings,
      errors,
      confidence: 0,
    }
  }
}
