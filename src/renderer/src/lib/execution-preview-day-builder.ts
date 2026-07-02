import type { ExecutionPreviewDay, ExecutionPreviewBlock } from '@shared/execution-preview-model'
import type { ExecutionPreviewAdaptedInput } from './execution-preview-input-adapter'

export function buildExecutionPreviewDays(input: {
  dateRange: ExecutionPreviewAdaptedInput['dateRange']
  placementPlanV2?: any
  sessionPlansV2?: any[]
  runtimeCoordinatorPlansV2?: any[]
  planningContextV2?: any
}): ExecutionPreviewDay[] {
  const days: ExecutionPreviewDay[] = []

  const start = new Date(input.dateRange.startDate)
  const end = new Date(input.dateRange.endDate)

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    return days
  }

  // Very basic mock structure since we are adapting from unknown objects as requested
  // Real implementation would map ProposedPlacementBlock to ExecutionPreviewBlock
  // Since we don't have the full types imported directly here, we will iterate over
  // input.placementPlanV2.days if available.
  
  const placementDays = input.placementPlanV2?.days || []

  // Ensure we at least create empty days for the range if no placement days exist
  const dateCursor = new Date(start)
  while (dateCursor <= end) {
    const dateStr = dateCursor.toISOString().slice(0, 10)
    
    // Find matching placement day
    const matchingDay = placementDays.find((d: any) => d.date === dateStr)
    
    const blocks: ExecutionPreviewBlock[] = []
    let unplacedCount = 0
    let proposedWorkMinutes = 0
    let deepWorkMinutes = 0
    let rescueMinutes = 0
    let reviewMinutes = 0
    let protectedRecoveryMinutes = 0
    let blockedOrUnsafeCount = 0
    
    if (matchingDay) {
      unplacedCount = matchingDay.unplacedItems?.length || 0
      for (const b of (matchingDay.blocks || [])) {
        // Try to match session
        const session = input.sessionPlansV2?.find(s => s.id === b.sessionPlanId)
        // Try to match runtime
        const runtime = input.runtimeCoordinatorPlansV2?.find(r => r.sessionPlanId === session?.id)
        
        let readiness: ExecutionPreviewBlock['readiness'] = 'ready'
        const warnings: string[] = []
        let protectionMode = 'unknown'

        if (!session) {
          readiness = 'needs_review'
          warnings.push('Session plan is missing for this block.')
        } else if (!runtime) {
          warnings.push('Runtime coordinator plan is missing for this session.')
        } else {
          protectionMode = runtime.blockingProfileDraft?.mode || 'unknown'
          if (runtime.safety?.status === 'critical') {
            readiness = 'unsafe'
            blockedOrUnsafeCount++
          }
        }

        const previewKind = b.kind || 'work_block'
        const durationMinutes = b.durationMinutes || 0

        proposedWorkMinutes += durationMinutes
        if (previewKind === 'deep_work_block') deepWorkMinutes += durationMinutes
        if (previewKind === 'rescue_block') rescueMinutes += durationMinutes
        if (previewKind === 'review_block') reviewMinutes += durationMinutes

        blocks.push({
          id: b.id,
          sourcePlacementBlockId: b.id,
          sourceSessionPlanId: session?.id,
          sourceRuntimeCoordinatorPlanId: runtime?.id,
          targetType: b.targetType || 'task',
          targetId: b.targetId || 'unknown',
          title: b.title || 'Unknown Block',
          date: dateStr,
          start: b.start || dateStr,
          end: b.end || dateStr,
          durationMinutes,
          previewKind,
          sessionMode: session?.mode,
          protectionMode,
          readiness,
          reasons: [],
          warnings,
          confidence: 100
        })
      }
    }

    let status: ExecutionPreviewDay['status'] = 'healthy'
    if (rescueMinutes > 0) status = 'rescue_day'
    if (proposedWorkMinutes === 0) status = 'unknown' // Just a fallback status

    days.push({
      date: dateStr,
      status,
      blocks,
      unplacedCount,
      summary: {
        proposedWorkMinutes,
        deepWorkMinutes,
        rescueMinutes,
        reviewMinutes,
        protectedRecoveryMinutes,
        blockedOrUnsafeCount
      },
      reasons: [],
      warnings: [],
      confidence: 100
    })

    dateCursor.setDate(dateCursor.getDate() + 1)
  }

  return days
}
