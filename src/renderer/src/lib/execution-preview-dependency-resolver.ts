import type { PreviewDependencyReport } from '@shared/execution-preview-model'
import type { ExecutionPreviewAdaptedInput } from './execution-preview-input-adapter'

export function resolveExecutionPreviewDependencies(input: ExecutionPreviewAdaptedInput): PreviewDependencyReport[] {
  const reports: PreviewDependencyReport[] = []

  // user_model
  reports.push({
    name: 'user_model',
    status: input.userModel ? 'available' : 'missing',
    required: false,
    reason: input.userModel ? 'User model is available.' : 'User model is recommended but optional.',
    confidence: input.userModel ? 100 : 80
  })

  // objective_models
  reports.push({
    name: 'objective_models',
    status: input.objectiveModelsV2.length > 0 ? 'available' : 'missing',
    required: true,
    reason: input.objectiveModelsV2.length > 0 ? 'Objectives are available.' : 'No objectives found.',
    confidence: input.objectiveModelsV2.length > 0 ? 100 : 20
  })

  // task_models
  reports.push({
    name: 'task_models',
    status: input.taskModelsV2.length > 0 ? 'available' : 'missing',
    required: true,
    reason: input.taskModelsV2.length > 0 ? 'Tasks are available.' : 'No tasks found.',
    confidence: input.taskModelsV2.length > 0 ? 100 : 20
  })

  // priority_scores
  reports.push({
    name: 'priority_scores',
    status: input.priorityScoresV2.length > 0 ? 'available' : 'missing',
    required: true,
    reason: input.priorityScoresV2.length > 0 ? 'Priority scores are available.' : 'Priority scores are needed to explain choices.',
    confidence: input.priorityScoresV2.length > 0 ? 100 : 50
  })

  // planning_context
  reports.push({
    name: 'planning_context',
    status: input.planningContextV2 ? 'available' : 'missing',
    required: true,
    reason: input.planningContextV2 ? 'Planning context is available.' : 'Planning context is required for reliable placement.',
    confidence: input.planningContextV2 ? 100 : 0
  })

  // placement_plan
  reports.push({
    name: 'placement_plan',
    status: input.placementPlanV2 ? 'available' : 'missing',
    required: true,
    reason: input.placementPlanV2 ? 'Placement plan is available.' : 'Placement plan is needed for session building.',
    confidence: input.placementPlanV2 ? 100 : 0
  })

  // session_plans
  reports.push({
    name: 'session_plans',
    status: input.sessionPlansV2.length > 0 ? 'available' : 'missing',
    required: true,
    reason: input.sessionPlansV2.length > 0 ? 'Session plans are available.' : 'Session plans are missing. Preview will only show placement.',
    confidence: input.sessionPlansV2.length > 0 ? 100 : 60
  })

  // runtime_coordinator_plans
  reports.push({
    name: 'runtime_coordinator_plans',
    status: input.runtimeCoordinatorPlansV2.length > 0 ? 'available' : 'missing',
    required: true,
    reason: input.runtimeCoordinatorPlansV2.length > 0 ? 'Runtime coordinator plans are available.' : 'Runtime plans missing. Preview will lack full protection details.',
    confidence: input.runtimeCoordinatorPlansV2.length > 0 ? 100 : 70
  })

  return reports
}
