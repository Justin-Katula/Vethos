import { describe, it, expect } from 'vitest'
import type { ExecutionPreviewProviderState } from './execution-preview-data-connector-model'

describe('ExecutionPreviewDataConnectorModel', () => {
  it('ensures canApplyPreview is literal false in ProviderState', () => {
    const state: ExecutionPreviewProviderState = {
      status: 'idle',
      warnings: [],
      errors: [],
      canGeneratePreview: true,
      canApplyPreview: false,
      confidence: 100,
    }
    expect(state.canApplyPreview).toBe(false)
  })

  it('outputs are fully serializable', () => {
    const state: ExecutionPreviewProviderState = {
      status: 'idle',
      warnings: ['warn'],
      errors: [],
      canGeneratePreview: true,
      canApplyPreview: false,
      confidence: 50,
    }
    const serialized = JSON.parse(JSON.stringify(state))
    expect(serialized).toEqual(state)
  })
})
