import type {
  ExecutionPreviewDiagnostics,
  ExecutionPreviewMode,
  ExecutionPreviewPlanV2,
  PreviewPipelineTrace,
  PreviewSafetyReport,
} from '@shared/execution-preview-model'
import { ExecutionPreviewUiFlags } from '@shared/execution-preview-ui-flags'

export type ExecutionPreviewSeverity = 'neutral' | 'good' | 'warning' | 'critical'

export interface ExecutionPreviewViewModel {
  hasPreview: boolean
  title: string
  subtitle: string
  status: 'ready' | 'warning' | 'partial' | 'manual_review' | 'unsafe' | 'empty'
  days: ExecutionPreviewDayViewModel[]
  summaryCards: Array<{ label: string; value: string; severity: ExecutionPreviewSeverity }>
  globalWarnings: string[]
  globalReasons: string[]
  diagnosticsSummary: string[]
  actions: ExecutionPreviewActionViewModel[]
  diagnostics?: ExecutionPreviewDiagnostics
  pipelineTrace?: PreviewPipelineTrace
  guardFacts: {
    canApplyLater: boolean
    realActionHandlerPresent: boolean
    safetyStatus?: PreviewSafetyReport['status']
    previewMode?: ExecutionPreviewMode
  }
  debug?: { planId?: string; confidence?: number }
}

export interface ExecutionPreviewDayViewModel {
  date: string
  title: string
  statusLabel: string
  statusSeverity: ExecutionPreviewSeverity
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
  readinessSeverity: ExecutionPreviewSeverity
  reasons: string[]
  warnings: string[]
  confidenceLabel: string
}

export type ExecutionPreviewActionType =
  | 'debug_only'
  | 'manual_review'
  | 'fix_inputs'
  | 'rebuild_proposed'
  | 'disabled_apply'
  | 'disabled_start_session'
  | 'disabled_blocking'

export interface ExecutionPreviewActionViewModel {
  label: string
  actionType: ExecutionPreviewActionType
  enabled: boolean
  reason: string
}

export function buildExecutionPreviewViewModel(input: {
  previewPlan?: ExecutionPreviewPlanV2
  uiData?: unknown
  now?: string
}): ExecutionPreviewViewModel {
  const { previewPlan, uiData } = input
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
      guardFacts: { canApplyLater: false, realActionHandlerPresent: hasRealActionHandler(uiData) },
    }
  }

  const status = resolvePreviewStatus(previewPlan)
  return {
    hasPreview: true,
    title: previewPlan.explanation.title,
    subtitle: previewPlan.explanation.summary,
    status,
    days: previewPlan.days.map(mapDay),
    summaryCards: [
      { label: 'Temps proposé', value: `${previewPlan.summary.totalProposedMinutes} min`, severity: previewPlan.summary.totalProposedMinutes > 0 ? 'good' : 'neutral' },
      {
        label: 'Blocs bloqués ou non sécurisés',
        value: `${previewPlan.summary.totalBlocked + previewPlan.summary.totalUnsafe}`,
        severity: previewPlan.summary.totalBlocked + previewPlan.summary.totalUnsafe > 0 ? 'critical' : 'neutral',
      },
      { label: 'Avertissements', value: `${previewPlan.summary.totalWarnings}`, severity: previewPlan.summary.totalWarnings > 0 ? 'warning' : 'neutral' },
    ],
    globalWarnings: unique([...previewPlan.explanation.warnings, ...previewPlan.readiness.warnings, ...previewPlan.safety.warnings]),
    globalReasons: unique([...previewPlan.safety.reasons, ...previewPlan.readiness.blockers]),
    diagnosticsSummary: previewPlan.diagnostics?.summary ?? [],
    actions: buildActions(status),
    diagnostics: previewPlan.diagnostics,
    pipelineTrace: previewPlan.pipelineTrace,
    guardFacts: {
      canApplyLater: previewPlan.readiness.canApplyLater,
      realActionHandlerPresent: hasRealActionHandler(uiData),
      safetyStatus: previewPlan.safety.status,
      previewMode: previewPlan.mode,
    },
    debug: ExecutionPreviewUiFlags.executionPreviewDebugPanelEnabled
      ? { planId: previewPlan.id, confidence: previewPlan.confidence }
      : undefined,
  }
}

function resolvePreviewStatus(plan: ExecutionPreviewPlanV2): ExecutionPreviewViewModel['status'] {
  if (plan.mode === 'unsafe' || plan.safety.status === 'critical' || plan.safety.status === 'unsafe' || plan.readiness.readiness === 'unsafe') return 'unsafe'
  if (plan.mode === 'manual_review_required' || plan.status === 'manual_review_required' || plan.readiness.readiness === 'manual_review_required') return 'manual_review'
  if (plan.status === 'partial_preview' || plan.readiness.readiness === 'partial_preview_only') return 'partial'
  if (plan.status === 'ready_with_warnings' || plan.safety.status === 'warning' || plan.explanation.warnings.length > 0 || plan.summary.totalWarnings > 0) return 'warning'
  return 'ready'
}

function buildActions(status: ExecutionPreviewViewModel['status']): ExecutionPreviewActionViewModel[] {
  const actions: ExecutionPreviewActionViewModel[] = [
    { label: 'Appliquer le plan', actionType: 'disabled_apply', enabled: false, reason: 'Cette vue est en lecture seule. L’application est désactivée.' },
    { label: 'Démarrer une session', actionType: 'disabled_start_session', enabled: false, reason: 'Aucune session réelle ne peut être créée depuis cette vue.' },
    { label: 'Activer le blocage', actionType: 'disabled_blocking', enabled: false, reason: 'Aucun blocage réel ne peut être déclenché depuis cette vue.' },
  ]
  if (status === 'manual_review') actions.push({ label: 'Examen manuel requis', actionType: 'manual_review', enabled: true, reason: 'Consulte les raisons et avertissements avant toute décision extérieure à cette vue.' })
  if (status === 'partial') actions.push({ label: 'Corriger les entrées', actionType: 'fix_inputs', enabled: true, reason: 'Certaines données structurées manquent pour produire une preview complète.' })
  actions.push({ label: 'Reconstruire le plan proposé', actionType: 'rebuild_proposed', enabled: false, reason: 'Désactivé au Point 11 : cette interface ne reconstruit aucun pipeline.' })
  return actions
}

function mapDay(day: ExecutionPreviewPlanV2['days'][number]): ExecutionPreviewDayViewModel {
  return {
    date: day.date,
    title: `Journée du ${day.date}`,
    statusLabel: dayStatusLabel(day.status),
    statusSeverity: dayStatusSeverity(day.status),
    warnings: unique(day.warnings),
    summary: [`Proposé : ${day.summary.proposedWorkMinutes} min`, `Travail profond : ${day.summary.deepWorkMinutes} min`, `Secours : ${day.summary.rescueMinutes} min`],
    blocks: day.blocks.map((block) => ({
      id: block.id,
      title: block.title,
      timeLabel: `${block.start} – ${block.end}`,
      durationLabel: `${block.durationMinutes} min`,
      kindLabel: blockKindLabel(block.previewKind),
      modeLabel: block.sessionMode ? `Session : ${block.sessionMode}` : undefined,
      protectionLabel: block.protectionMode ? `Protection : ${block.protectionMode}` : undefined,
      readinessLabel: readinessLabel(block.readiness),
      readinessSeverity: readinessSeverity(block.readiness),
      reasons: unique(block.reasons),
      warnings: unique(block.warnings),
      confidenceLabel: `${block.confidence}%`,
    })),
  }
}

function dayStatusLabel(status: ExecutionPreviewPlanV2['days'][number]['status']): string {
  return ({ healthy: 'Disponible', tight: 'Serrée', overloaded: 'Surchargée', fragmented: 'Fragmentée', rescue_day: 'Mode secours', manual_review_required: 'Examen manuel requis', no_usable_time: 'Aucun temps utilisable', unknown: 'État indéterminé' })[status]
}

function dayStatusSeverity(status: ExecutionPreviewPlanV2['days'][number]['status']): ExecutionPreviewSeverity {
  if (status === 'healthy') return 'good'
  if (status === 'tight' || status === 'fragmented' || status === 'rescue_day') return 'warning'
  if (status === 'overloaded' || status === 'manual_review_required' || status === 'no_usable_time') return 'critical'
  return 'neutral'
}

function blockKindLabel(kind: ExecutionPreviewPlanV2['days'][number]['blocks'][number]['previewKind']): string {
  return ({ work_block: 'Bloc de travail', deep_work_block: 'Travail profond', rescue_block: 'Bloc de secours', review_block: 'Révision', recovery_block: 'Récupération', manual_review_block: 'Examen manuel', unplaced_item: 'Élément non placé' })[kind]
}

function readinessLabel(readiness: ExecutionPreviewPlanV2['days'][number]['blocks'][number]['readiness']): string {
  return ({ ready: 'Prêt pour la preview', ready_with_warnings: 'Prêt avec avertissements', needs_review: 'Examen requis', blocked: 'Bloqué', unsafe: 'Non sécurisé' })[readiness]
}

function readinessSeverity(readiness: ExecutionPreviewPlanV2['days'][number]['blocks'][number]['readiness']): ExecutionPreviewSeverity {
  if (readiness === 'ready') return 'good'
  if (readiness === 'ready_with_warnings' || readiness === 'needs_review') return 'warning'
  return 'critical'
}

function hasRealActionHandler(uiData: unknown): boolean {
  if (!uiData || typeof uiData !== 'object') return false
  const data = uiData as Record<string, unknown>
  if (data.realActionHandlerPresent === true) return true
  return Object.values(data).some((value) => typeof value === 'function')
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}
