import { describe, it, expect } from 'vitest'
import { buildExecutionPreviewViewModel } from './execution-preview-view-model'
import type { ExecutionPreviewPlanV2 } from '@shared/execution-preview-model'

describe('execution-preview-view-model', () => {
  it('returns empty state when no previewPlan is provided', () => {
    const vm = buildExecutionPreviewViewModel({})
    expect(vm.hasPreview).toBe(false)
    expect(vm.status).toBe('empty')
  })

  it('maps a complete and safe plan correctly', () => {
    const fakePlan = {
      id: 'plan-1',
      mode: 'full',
      status: 'ready_to_build',
      confidence: 90,
      days: [],
      safety: { status: 'safe', reasons: [] },
      readiness: { readiness: 'ready_for_ui_preview', warnings: [] },
      summary: { totalProposedMinutes: 120, totalWarnings: 0, totalBlocked: 0, totalUnsafe: 0 },
      explanation: { title: 'Titre', summary: 'Sous-titre', warnings: [] },
      diagnostics: { summary: [] },
      pipelineTrace: { steps: [] }
    } as unknown as ExecutionPreviewPlanV2

    const vm = buildExecutionPreviewViewModel({ previewPlan: fakePlan })
    expect(vm.hasPreview).toBe(true)
    expect(vm.status).toBe('ready')
    expect(vm.title).toBe('Titre')
  })

  it('disables dangerous actions unconditionally', () => {
    const fakePlan = {
      id: 'plan-2',
      mode: 'full',
      status: 'ready_to_build',
      confidence: 90,
      days: [],
      safety: { status: 'safe', reasons: [] },
      readiness: { readiness: 'ready_for_ui_preview', warnings: [] },
      summary: { totalProposedMinutes: 120, totalWarnings: 0, totalBlocked: 0, totalUnsafe: 0 },
      explanation: { title: 'Titre', summary: 'Sous-titre', warnings: [] },
      diagnostics: { summary: [] },
      pipelineTrace: { steps: [] }
    } as unknown as ExecutionPreviewPlanV2

    const vm = buildExecutionPreviewViewModel({ previewPlan: fakePlan })
    const applyAction = vm.actions.find(a => a.actionType === 'disabled_apply')
    const startAction = vm.actions.find(a => a.actionType === 'disabled_start_session')
    const blockAction = vm.actions.find(a => a.actionType === 'disabled_blocking')
    
    expect(applyAction?.enabled).toBe(false)
    expect(startAction?.enabled).toBe(false)
    expect(blockAction?.enabled).toBe(false)
  })

  it('detects unsafe status and partial previews', () => {
    const fakePlan = {
      mode: 'unsafe',
      safety: { status: 'unsafe', reasons: [] },
      readiness: { readiness: 'blocked', warnings: [] },
      days: [],
      summary: { totalProposedMinutes: 0, totalWarnings: 0, totalBlocked: 0, totalUnsafe: 0 },
      explanation: { title: '', summary: '', warnings: [] },
      pipelineTrace: { steps: [] }
    } as unknown as ExecutionPreviewPlanV2
    const vm = buildExecutionPreviewViewModel({ previewPlan: fakePlan })
    expect(vm.status).toBe('unsafe')
  })
})
