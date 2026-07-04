import type { ExecutionPreviewPlanV2 } from '@shared/execution-preview-model'
import type { ExecutionPreviewQaReport } from '@shared/execution-preview-qa-model'
import type { ManualReviewDraftV2, ManualReviewGateResult } from '@shared/manual-review-gate-model'
import { buildExecutionContractDraft } from './activation-contract-draft-builder'

export function executionPreviewFixture(): ExecutionPreviewPlanV2 {
  return {
    id: 'p1', userId: 'u1', dateRange: { startDate: '2026-06-26', endDate: '2026-06-26' },
    mode: 'debug_preview', status: 'ready_for_preview', dependencies: [],
    days: [{
      date: '2026-06-26', status: 'healthy', unplacedCount: 0,
      blocks: [{
        id: 'b1', targetType: 'task', targetId: 't1', title: 'Test block', date: '2026-06-26',
        start: '2026-06-26T08:00:00.000Z', end: '2026-06-26T09:00:00.000Z', durationMinutes: 60,
        previewKind: 'work_block', readiness: 'ready', reasons: [], warnings: [], confidence: 100,
      }],
      summary: { proposedWorkMinutes: 60, deepWorkMinutes: 0, rescueMinutes: 0, reviewMinutes: 0, protectedRecoveryMinutes: 0, blockedOrUnsafeCount: 0 },
      reasons: [], warnings: [], confidence: 100,
    }],
    sessionPlanIds: [], runtimeCoordinatorPlanIds: [],
    readiness: { canDisplayPreview: true, canApplyLater: false, readiness: 'ready_for_ui_preview', blockers: [], warnings: [], requiredActions: [], confidence: 100 },
    safety: { status: 'safe', realActionDetected: false, forbiddenDependencyDetected: false, unsafeRuntimePlans: [], warnings: [], reasons: [], confidence: 100 },
    pipelineTrace: { steps: [], failedStepIds: [], warningStepIds: [], confidence: 100 },
    explanation: { title: 'Preview', summary: 'Ready', keyDecisions: [], warnings: [], nextRecommendedAction: 'show_ui_preview', confidence: 100 },
    summary: { totalPreviewBlocks: 1, totalProposedMinutes: 60, totalWarnings: 0, totalBlocked: 0, totalManualReview: 0, totalUnsafe: 0 },
    confidence: 100,
    metadata: { modelVersion: 1, createdAt: '2026-06-26T00:00:00.000Z', updatedAt: '2026-06-26T00:00:00.000Z', source: 'execution_preview' },
  }
}

export function executionQaFixture(): ExecutionPreviewQaReport {
  const emptyMapping = {
    status: 'healthy' as const,
    tasks: { sourceCount: 0, mappedCount: 0, ignoredCount: 0, invalidCount: 0, warnings: [] },
    objectives: { sourceCount: 0, mappedCount: 0, ignoredCount: 0, invalidCount: 0, warnings: [] },
    planning: { hasScheduleData: false, hasUsableTimeWindows: true, fixedBlocksCount: 1, warnings: [] },
    appsAndSites: { sourceAppsCount: 0, sourceSitesCount: 0, mappedRestrictionsCount: 0, warnings: [] },
    confidence: 100,
  }
  return {
    id: 'q1', previewPlanId: 'p1', status: 'good',
    qualityScore: { overall: 90, dataMapping: 90, planning: 90, placement: 90, session: 90, runtimeCoordination: 90, safety: 100, readability: 90, status: 'good', reasons: [] },
    mappingAudit: emptyMapping,
    consistency: { status: 'consistent', checks: [], summary: [], confidence: 100 },
    calibration: { status: 'calibrated', findings: [], recommendations: [], confidence: 100 },
    diagnostics: { status: 'healthy', issues: [], summary: [] }, checks: [],
    canProceedToActivationPlanning: false, warnings: [], blockers: [],
    explanation: { title: 'QA', summary: 'Healthy', keyFindings: [], nextRecommendedAction: 'keep_debug_only' },
    confidence: 100,
    metadata: { source: 'execution_preview_qa', createdAt: '2026-06-26T00:00:00.000Z', modelVersion: 1 },
  }
}

export function manualReviewFixture(): ManualReviewDraftV2 {
  return {
    id: 'r1', previewPlanId: 'p1', qaReportId: 'q1', status: 'approved_in_principle',
    previewDecision: 'accepted_in_principle', dayDecisions: [], blockDecisions: [], decisions: [], warnings: [], blockers: [],
    canCreateSessions: false, canStartSessions: false, canApplyPlanning: false, canApplyBlocking: false,
    canCompleteTasks: false, canPersistReview: false, canProceedToActivationBridge: false, confidence: 100,
    metadata: { source: 'manual_review_gate', createdAt: '2026-06-26T00:00:00.000Z', updatedAt: '2026-06-26T00:00:00.000Z', modelVersion: 1 },
  }
}

export function manualReviewGateFixture(reviewDraft = manualReviewFixture()): ManualReviewGateResult {
  return {
    status: 'review_allowed', reviewDraft, canProceedToActivationBridge: false, canApplyAnything: false,
    blockers: [], warnings: [], nextRecommendedAction: 'keep_reviewing', confidence: 100,
  }
}

export function executionContractFixture() {
  const review = manualReviewFixture()
  return buildExecutionContractDraft({
    previewPlan: executionPreviewFixture(), qaReport: executionQaFixture(),
    manualReviewDraft: review, manualReviewGateResult: manualReviewGateFixture(review),
  })
}
