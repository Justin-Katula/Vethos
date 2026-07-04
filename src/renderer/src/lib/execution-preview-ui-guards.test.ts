import { describe, expect, it } from 'vitest'
import type { ExecutionPreviewViewModel } from './execution-preview-view-model'
import { guardExecutionPreviewActions } from './execution-preview-ui-guards'

function viewModel(overrides: Partial<ExecutionPreviewViewModel> = {}): ExecutionPreviewViewModel {
  return {
    hasPreview: true, title: 'Preview', subtitle: 'Lecture seule', status: 'ready', days: [],
    summaryCards: [], globalWarnings: [], globalReasons: [], diagnosticsSummary: [],
    actions: [
      { label: 'Apply', actionType: 'disabled_apply', enabled: false, reason: 'disabled' },
      { label: 'Start', actionType: 'disabled_start_session', enabled: false, reason: 'disabled' },
      { label: 'Block', actionType: 'disabled_blocking', enabled: false, reason: 'disabled' },
    ],
    guardFacts: { canApplyLater: false, realActionHandlerPresent: false, safetyStatus: 'safe', previewMode: 'ui_preview' },
    ...overrides,
  }
}

describe('guardExecutionPreviewActions', () => {
  it('accepts a safe view model', () => expect(guardExecutionPreviewActions(viewModel()).safe).toBe(true))
  it.each(['disabled_apply', 'disabled_start_session', 'disabled_blocking'] as const)('rejects enabled %s', (actionType) => {
    const result = guardExecutionPreviewActions(viewModel({ actions: [{ label: actionType, actionType, enabled: true, reason: 'bad' }] }))
    expect(result.safe).toBe(false)
  })
  it('rejects canApplyLater=true', () => expect(guardExecutionPreviewActions(viewModel({ guardFacts: { canApplyLater: true, realActionHandlerPresent: false } })).safe).toBe(false))
  it('rejects an unknown runtime action', () => expect(guardExecutionPreviewActions(viewModel({ actions: [{ label: 'x', actionType: 'unknown' as never, enabled: false, reason: 'x' }] })).safe).toBe(false))
  it('rejects a represented handler', () => expect(guardExecutionPreviewActions(viewModel({ actions: [{ label: 'x', actionType: 'debug_only', enabled: false, reason: 'x', handler: () => undefined } as never] })).safe).toBe(false))
  it('rejects critical safety shown as ready', () => expect(guardExecutionPreviewActions(viewModel({ guardFacts: { canApplyLater: false, realActionHandlerPresent: false, safetyStatus: 'critical' } })).safe).toBe(false))
  it('rejects an enabled action on unsafe preview', () => expect(guardExecutionPreviewActions(viewModel({ status: 'unsafe', actions: [{ label: 'x', actionType: 'debug_only', enabled: true, reason: 'x' }] })).safe).toBe(false))
})
