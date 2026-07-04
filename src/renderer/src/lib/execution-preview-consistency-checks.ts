import { ExecutionPreviewConsistencyReport, ExecutionPreviewQaCheck } from '@shared/execution-preview-qa-model'
import { ExecutionPreviewPlanV2 } from '@shared/execution-preview-model'
import { ExecutionPreviewProviderState } from '@shared/execution-preview-data-connector-model'

export type ConsistencyChecksInput = {
  previewPlan?: ExecutionPreviewPlanV2
  providerState?: ExecutionPreviewProviderState
  settings?: any
}

export function runExecutionPreviewConsistencyChecks(
  input: ConsistencyChecksInput
): ExecutionPreviewConsistencyReport {
  const { previewPlan, providerState, settings } = input
  const checks: ExecutionPreviewQaCheck[] = []
  
  // 1. Ready without plan
  if (providerState?.status === 'ready' && !previewPlan) {
    checks.push({
      id: 'cc-1',
      category: 'planning',
      status: 'fail',
      severity: 'critical',
      title: 'Missing Plan on Ready Status',
      message: 'Provider is ready but no preview plan is available.',
      confidence: 100
    })
  }

  // 2. canApplyLater / canApplyPreview detection
  if ((previewPlan?.readiness as { canApplyLater?: boolean } | undefined)?.canApplyLater === true) {
    checks.push({
      id: 'cc-2',
      category: 'readiness',
      status: 'fail',
      severity: 'critical',
      title: 'canApplyLater is True',
      message: 'Preview plan has canApplyLater set to true, which is forbidden in QA.',
      confidence: 100
    })
  }

  if ((providerState as { canApplyPreview?: boolean } | undefined)?.canApplyPreview === true) {
    checks.push({
      id: 'cc-3',
      category: 'readiness',
      status: 'fail',
      severity: 'critical',
      title: 'canApplyPreview is True',
      message: 'Provider state has canApplyPreview set to true, which is forbidden in QA.',
      confidence: 100
    })
  }

  // 3. Block validation
  if (previewPlan) {
    const blockIds = new Set<string>()
    let duplicateBlocks = 0
    let invalidDuration = 0

    previewPlan.days.forEach(day => {
      day.blocks.forEach(block => {
        if (blockIds.has(block.id)) {
          duplicateBlocks++
        }
        blockIds.add(block.id)

        if (block.durationMinutes <= 0) {
          invalidDuration++
        }
      })
    })

    if (duplicateBlocks > 0) {
       checks.push({
         id: 'cc-4',
         category: 'placement',
         status: 'fail',
         severity: 'high',
         title: 'Duplicate Block IDs',
         message: `${duplicateBlocks} duplicate block IDs found.`,
         confidence: 100
       })
    }

    if (invalidDuration > 0) {
       checks.push({
         id: 'cc-5',
         category: 'placement',
         status: 'fail',
         severity: 'high',
         title: 'Invalid Block Duration',
         message: `${invalidDuration} blocks with duration <= 0.`,
         confidence: 100
       })
    }
    
    // Safety check
    if (previewPlan.safety?.status === 'unsafe' || previewPlan.safety?.status === 'critical') {
       if (providerState?.status === 'ready') {
         checks.push({
           id: 'cc-6',
           category: 'safety',
           status: 'fail',
           severity: 'critical',
           title: 'Ready but Unsafe',
           message: 'Provider status is ready but safety is unsafe/critical.',
           confidence: 100
         })
       }
    }
    
    if (previewPlan.summary?.totalProposedMinutes < 0) {
       checks.push({
         id: 'cc-7',
         category: 'planning',
         status: 'fail',
         severity: 'medium',
         title: 'Invalid totalProposedMinutes',
         message: 'totalProposedMinutes is less than zero.',
         confidence: 100
       })
    }
  }

  const criticalFails = checks.filter(c => c.severity === 'critical' && c.status === 'fail').length
  const fails = checks.filter(c => c.status === 'fail').length

  let status: ExecutionPreviewConsistencyReport['status'] = 'consistent'
  if (criticalFails > 0) {
    status = 'critical'
  } else if (fails > 0) {
    status = 'inconsistent'
  } else if (checks.length > 0) {
    status = 'warning'
  }

  return {
    status,
    checks,
    summary: checks.map(c => c.message),
    confidence: providerState?.confidence ?? 100
  }
}
