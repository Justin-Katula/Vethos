export interface ExecutionPreviewInputPayload {
  userId: string
  dateRange: {
    startDate: string
    endDate: string
  }
  userModel?: unknown
  objectiveModelsV2?: unknown[]
  taskModelsV2?: unknown[]
  priorityScoresV2?: unknown[]
  planningContextV2?: unknown
  placementPlanV2?: unknown
  sessionPlansV2?: unknown[]
  runtimeCoordinatorPlansV2?: unknown[]
  settings?: unknown
  now?: string
  idFactory?: () => string
}

export interface ExecutionPreviewAdaptedInput {
  userId: string
  dateRange: {
    startDate: string
    endDate: string
  }
  userModel?: unknown
  objectiveModelsV2: unknown[]
  taskModelsV2: unknown[]
  priorityScoresV2: unknown[]
  planningContextV2?: unknown
  placementPlanV2?: unknown
  sessionPlansV2: unknown[]
  runtimeCoordinatorPlansV2: unknown[]
  settings?: unknown
  now?: string
  idFactory?: () => string
  warnings: string[]
  confidence: number
}

export function buildExecutionPreviewInput(input: ExecutionPreviewInputPayload): ExecutionPreviewAdaptedInput {
  const warnings: string[] = []
  let confidence = 100

  // Validate date range roughly
  const start = new Date(input.dateRange.startDate)
  const end = new Date(input.dateRange.endDate)

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    warnings.push('Invalid dateRange provided.')
    confidence -= 30
  }

  if (!input.userId) {
    warnings.push('userId is missing.')
    confidence -= 50
  }

  return {
    userId: input.userId,
    dateRange: {
      startDate: input.dateRange.startDate,
      endDate: input.dateRange.endDate,
    },
    userModel: input.userModel,
    objectiveModelsV2: [...(input.objectiveModelsV2 || [])],
    taskModelsV2: [...(input.taskModelsV2 || [])],
    priorityScoresV2: [...(input.priorityScoresV2 || [])],
    planningContextV2: input.planningContextV2,
    placementPlanV2: input.placementPlanV2,
    sessionPlansV2: [...(input.sessionPlansV2 || [])],
    runtimeCoordinatorPlansV2: [...(input.runtimeCoordinatorPlansV2 || [])],
    settings: input.settings,
    now: input.now,
    idFactory: input.idFactory,
    warnings,
    confidence: Math.max(0, confidence),
  }
}
