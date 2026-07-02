import type { ExecutionPreviewPlanV2 } from '@shared/execution-preview-model'
import { ExecutionPreviewUiFlags } from '@shared/execution-preview-ui-flags'

export interface ExecutionPreviewViewModel {
  hasPreview: boolean

  title: string
  subtitle: string

  status: 'ready' | 'warning' | 'partial' | 'manual_review' | 'unsafe' | 'empty'

  days: ExecutionPreviewDayViewModel[]

  summaryCards: Array<{
    label: string
    value: string
    severity: 'neutral' | 'good' | 'warning' | 'critical'
  }>

  globalWarnings: string[]
  globalReasons: string[]
  diagnosticsSummary: string[]

  actions: ExecutionPreviewActionViewModel[]

  debug?: {
    planId?: string
    confidence?: number
    pipelineSteps?: unknown[]
  }
}

export interface ExecutionPreviewDayViewModel {
  date: string
  title: string
  statusLabel: string
  statusSeverity: 'neutral' | 'good' | 'warning' | 'critical'
  blocks: ExecutionPreviewBlockViewModel[]
  summary: string[]
  warnings: string[]
}

export interface ExecutionPreviewBlockViewModel {
  id: string
  title: string
  timeLabel: string
  durationLabel: string
  kindLabel: string
  modeLabel?: string
  protectionLabel?: string
  readinessLabel: string
  readinessSeverity: 'neutral' | 'good' | 'warning' | 'critical'
  reasons: string[]
  warnings: string[]
  confidenceLabel: string
}

export interface ExecutionPreviewActionViewModel {
  label: string
  actionType:
    | 'debug_only'
    | 'manual_review'
    | 'fix_inputs'
    | 'rebuild_shadow'
    | 'disabled_apply'
    | 'disabled_start_session'
    | 'disabled_blocking'
  enabled: boolean
  reason: string
}

export function buildExecutionPreviewViewModel(input: {
  previewPlan?: ExecutionPreviewPlanV2
  now?: string
}): ExecutionPreviewViewModel {
  const { previewPlan } = input

  if (!previewPlan) {
    return {
      hasPreview: false,
      title: 'Aucune preview',
      subtitle: 'Aucun plan généré',
      status: 'empty',
      days: [],
      summaryCards: [],
      globalWarnings: [],
      globalReasons: [],
      diagnosticsSummary: [],
      actions: [],
    }
  }

  // Evaluate general status
  let status: ExecutionPreviewViewModel['status'] = 'ready'
  if (previewPlan.mode === 'unsafe' || previewPlan.safety.status === 'critical' || previewPlan.safety.status === 'unsafe') {
    status = 'unsafe'
  } else if (previewPlan.mode === 'manual_review_required' || previewPlan.readiness.readiness === 'manual_review_required') {
    status = 'manual_review'
  } else if (previewPlan.status === 'partial_preview' || previewPlan.readiness.readiness === 'partial_preview_only') {
    status = 'partial'
  } else if (previewPlan.explanation.warnings.length > 0 || previewPlan.summary.totalWarnings > 0) {
    status = 'warning'
  }

  // Global Actions
  const actions: ExecutionPreviewActionViewModel[] = [
    {
      label: 'Appliquer le plan',
      actionType: 'disabled_apply',
      enabled: false,
      reason: 'Preview seulement. Application désactivée.',
    },
    {
      label: 'Démarrer une session',
      actionType: 'disabled_start_session',
      enabled: false,
      reason: 'Aucune session réelle ne sera créée depuis cette vue.',
    },
    {
      label: 'Forcer le blocage',
      actionType: 'disabled_blocking',
      enabled: false,
      reason: 'Ce plan n’est pas encore appliqué.',
    },
  ]

  if (status === 'manual_review') {
    actions.push({
      label: 'Examen manuel requis',
      actionType: 'manual_review',
      enabled: true,
      reason: 'Vérifiez les avertissements de sécurité.',
    })
  } else if (status === 'partial') {
    actions.push({
      label: 'Corriger les entrées',
      actionType: 'fix_inputs',
      enabled: true,
      reason: 'Certaines données sont manquantes pour un plan complet.',
    })
  }

  // Rebuild shadow (disabled for point 11)
  actions.push({
    label: 'Reconstruire shadow',
    actionType: 'rebuild_shadow',
    enabled: false,
    reason: 'Disabled in Point 11: preview UI is read-only.',
  })

  // Summary Cards
  const summaryCards: ExecutionPreviewViewModel['summaryCards'] = [
    {
      label: 'Temps planifié',
      value: `${previewPlan.summary.totalProposedMinutes} min`,
      severity: previewPlan.summary.totalProposedMinutes > 0 ? 'good' : 'neutral',
    },
    {
      label: 'Blocs bloqués/unsafe',
      value: `${previewPlan.summary.totalBlocked + previewPlan.summary.totalUnsafe}`,
      severity: (previewPlan.summary.totalBlocked + previewPlan.summary.totalUnsafe) > 0 ? 'critical' : 'neutral',
    },
    {
      label: 'Avertissements',
      value: `${previewPlan.summary.totalWarnings}`,
      severity: previewPlan.summary.totalWarnings > 0 ? 'warning' : 'neutral',
    }
  ]

  // Map Days
  const days: ExecutionPreviewDayViewModel[] = previewPlan.days.map((d) => {
    let daySeverity: ExecutionPreviewDayViewModel['statusSeverity'] = 'neutral'
    if (d.status === 'healthy') daySeverity = 'good'
    if (d.status === 'rescue_day' || d.status === 'overloaded') daySeverity = 'warning'
    if (d.status === 'no_usable_time' || d.status === 'manual_review_required') daySeverity = 'critical'

    return {
      date: d.date,
      title: `Journée du ${d.date}`,
      statusLabel: d.status,
      statusSeverity: daySeverity,
      warnings: d.warnings,
      summary: [
        `Proposé : ${d.summary.proposedWorkMinutes}m`,
        `Profond : ${d.summary.deepWorkMinutes}m`,
        `Secours : ${d.summary.rescueMinutes}m`,
      ],
      blocks: d.blocks.map((b) => {
        let blockSeverity: ExecutionPreviewBlockViewModel['readinessSeverity'] = 'neutral'
        if (b.readiness === 'ready') blockSeverity = 'good'
        if (b.readiness === 'ready_with_warnings' || b.readiness === 'needs_review') blockSeverity = 'warning'
        if (b.readiness === 'blocked' || b.readiness === 'unsafe') blockSeverity = 'critical'

        return {
          id: b.id,
          title: b.title,
          timeLabel: `${b.start} - ${b.end}`,
          durationLabel: `${b.durationMinutes} min`,
          kindLabel: b.previewKind,
          modeLabel: b.sessionMode || 'N/A',
          protectionLabel: b.protectionMode || 'N/A',
          readinessLabel: b.readiness,
          readinessSeverity: blockSeverity,
          reasons: b.reasons,
          warnings: b.warnings,
          confidenceLabel: `${b.confidence}%`,
        }
      }),
    }
  })

  return {
    hasPreview: true,
    title: previewPlan.explanation.title,
    subtitle: previewPlan.explanation.summary,
    status,
    days,
    summaryCards,
    globalWarnings: previewPlan.explanation.warnings.concat(previewPlan.readiness.warnings),
    globalReasons: previewPlan.safety.reasons,
    diagnosticsSummary: previewPlan.diagnostics?.summary || [],
    actions,
    debug: ExecutionPreviewUiFlags.executionPreviewDebugPanelEnabled
      ? {
          planId: previewPlan.id,
          confidence: previewPlan.confidence,
          pipelineSteps: previewPlan.pipelineTrace.steps,
        }
      : undefined,
  }
}
