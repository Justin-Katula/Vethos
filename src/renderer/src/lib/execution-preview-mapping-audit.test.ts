import { describe, it, expect } from 'vitest'
import { runExecutionPreviewMappingAudit } from './execution-preview-mapping-audit'
import { ExecutionPreviewPlanV2 } from '@shared/execution-preview-model'

describe('execution-preview-mapping-audit', () => {
  it('detects unmapped tasks', () => {
    const audit = runExecutionPreviewMappingAudit({
      qaInputSummary: {
        sourceCounts: { tasks: 5, objectives: 0, schedules: 0, sessions: 0, apps: 0, sites: 0 },
        sanitizedCounts: { tasks: 5, objectives: 0, schedules: 0, sessions: 0, apps: 0, sites: 0 },
        dataWarnings: [],
        pipelineWarnings: [],
        pipelineErrors: [],
        confidence: 100
      },
      previewPlan: {
        id: '1',
        userId: 'user-1',
        dateRange: { startDate: '2026-06-26', endDate: '2026-06-26' },
        mode: 'shadow_only',
        status: 'ready_for_preview',
        dependencies: [],
        days: [{
          date: '2026-06-26',
          status: 'healthy',
          blocks: [],
          unplacedCount: 0,
          summary: {
            proposedWorkMinutes: 0,
            deepWorkMinutes: 0,
            rescueMinutes: 0,
            reviewMinutes: 0,
            protectedRecoveryMinutes: 0,
            blockedOrUnsafeCount: 0,
          },
          reasons: [],
          warnings: [],
          confidence: 100,
        }],
        sessionPlanIds: [],
        runtimeCoordinatorPlanIds: [],
        readiness: {
          canDisplayPreview: true,
          canApplyLater: false,
          readiness: 'partial_preview_only',
          blockers: [],
          warnings: [],
          requiredActions: [],
          confidence: 100,
        },
        safety: {
          status: 'safe',
          realActionDetected: false,
          forbiddenDependencyDetected: false,
          unsafeRuntimePlans: [],
          warnings: [],
          reasons: [],
          confidence: 100,
        },
        pipelineTrace: {
          steps: [],
          failedStepIds: [],
          warningStepIds: [],
          confidence: 100,
        },
        explanation: {
          title: '',
          summary: '',
          keyDecisions: [],
          warnings: [],
          nextRecommendedAction: 'show_debug_preview',
          confidence: 100,
        },
        summary: {
          totalPreviewBlocks: 0,
          totalProposedMinutes: 0,
          totalWarnings: 0,
          totalBlocked: 0,
          totalManualReview: 0,
          totalUnsafe: 0,
        },
        confidence: 100,
        metadata: {
          modelVersion: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          source: 'execution_preview',
        },
      } as unknown as ExecutionPreviewPlanV2
    })
    
    expect(audit.tasks.mappedCount).toBe(0)
    expect(audit.tasks.warnings.length).toBeGreaterThan(0)
    expect(audit.status).toBe('partial')
  })

  it('handles missing structures without crashing', () => {
    const audit = runExecutionPreviewMappingAudit({})
    expect(audit.status).toBe('invalid')
  })
})
