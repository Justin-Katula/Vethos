import { describe, it, expect } from 'vitest'
import { guardExecutionPreviewActions } from './execution-preview-ui-guards'
import type { ExecutionPreviewViewModel } from './execution-preview-view-model'
import { ExecutionPreviewUiFlags } from '@shared/execution-preview-ui-flags'

describe('execution-preview-ui-guards', () => {
  it('returns safe for a valid view model', () => {
    const vm: ExecutionPreviewViewModel = {
      hasPreview: true,
      title: 'Titre',
      subtitle: 'Sous-titre',
      status: 'ready',
      days: [],
      summaryCards: [],
      globalWarnings: [],
      globalReasons: [],
      diagnosticsSummary: [],
      actions: [
        { label: 'Apply', actionType: 'disabled_apply', enabled: false, reason: '' }
      ]
    }
    const result = guardExecutionPreviewActions(vm)
    expect(result.safe).toBe(true)
  })

  it('detects enabled dangerous actions as critical issues', () => {
    const vm: ExecutionPreviewViewModel = {
      hasPreview: true,
      title: 'Titre',
      subtitle: 'Sous-titre',
      status: 'ready',
      days: [],
      summaryCards: [],
      globalWarnings: [],
      globalReasons: [],
      diagnosticsSummary: [],
      actions: [
        { label: 'Apply', actionType: 'disabled_apply', enabled: true, reason: '' } // Danger!
      ]
    }
    const result = guardExecutionPreviewActions(vm)
    expect(result.safe).toBe(false)
    expect(result.issues).toBeDefined()
    expect(result.issues![0]!.id).toBe('dangerous_action_enabled_disabled_apply')
  })
})
