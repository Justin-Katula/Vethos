import type { ExecutionPreviewDiagnostics, ExecutionPreviewPlanV2 } from '@shared/execution-preview-model'

export function runExecutionPreviewDiagnostics(plan: Omit<ExecutionPreviewPlanV2, 'diagnostics'>): ExecutionPreviewDiagnostics {
  const issues: ExecutionPreviewDiagnostics['issues'] = []
  let status: ExecutionPreviewDiagnostics['status'] = 'healthy'

  // 1. Invalid date range
  const start = new Date(plan.dateRange.startDate)
  const end = new Date(plan.dateRange.endDate)
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    issues.push({
      id: 'invalid_date_range',
      severity: 'critical',
      message: 'Date range is invalid.'
    })
    status = 'critical'
  }

  // 2. Missing User Id
  if (!plan.userId) {
    issues.push({
      id: 'missing_user_id',
      severity: 'critical',
      message: 'User ID is missing.'
    })
    status = 'critical'
  }

  // 3. canApplyLater / real action overrides (Secondary check for extreme safety)
  if ((plan.readiness as { canApplyLater?: boolean }).canApplyLater === true) {
    issues.push({
      id: 'can_apply_later_true',
      severity: 'critical',
      message: 'Readiness gate falsely permitted canApplyLater.'
    })
    status = 'critical'
  }

  if (plan.safety.status === 'critical' && plan.readiness.readiness !== 'unsafe') {
    issues.push({
      id: 'safety_critical_but_ready',
      severity: 'critical',
      message: 'Safety is critical but readiness is not unsafe.'
    })
    status = 'critical'
  }

  // 4. Block level diagnostics
  const allBlockIds = new Set<string>()
  for (const day of plan.days) {
    for (const block of day.blocks) {
      if (allBlockIds.has(block.id)) {
        issues.push({
          id: 'duplicate_block_id',
          severity: 'high',
          message: `Duplicate block id detected: ${block.id}`
        })
        if (status !== 'critical') status = 'warning'
      }
      allBlockIds.add(block.id)

      if (block.durationMinutes <= 0) {
        issues.push({
          id: 'invalid_block_duration',
          severity: 'medium',
          message: `Block ${block.id} has duration <= 0.`
        })
        if (status !== 'critical') status = 'warning'
      }

      // Session / Runtime alignment
      if (block.sourceSessionPlanId && !block.sourceRuntimeCoordinatorPlanId) {
        issues.push({
          id: 'missing_runtime_plan_for_session',
          severity: 'medium',
          message: `Block ${block.id} has a session plan but no runtime coordinator plan.`
        })
        if (status !== 'critical') status = 'warning'
      }

      // Date alignment
      const blockDate = new Date(block.date)
      if (blockDate < start || blockDate > end) {
        issues.push({
          id: 'block_out_of_range',
          severity: 'high',
          message: `Block ${block.id} is outside the preview date range.`
        })
        if (status !== 'critical') status = 'warning'
      }
    }
  }

  // 5. High confidence with missing deps
  const missingDeps = plan.dependencies.filter(d => d.status === 'missing' && d.required)
  if (missingDeps.length > 0 && plan.confidence > 80) {
    issues.push({
      id: 'confidence_too_high',
      severity: 'medium',
      message: 'Confidence is >80 but essential dependencies are missing.'
    })
    if (status !== 'critical') status = 'warning'
  }

  return {
    status,
    issues,
    summary: issues.map(i => `[${i.severity.toUpperCase()}] ${i.message}`)
  }
}
