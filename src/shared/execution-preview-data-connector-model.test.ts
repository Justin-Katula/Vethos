import { describe, it, expect, expectTypeOf } from 'vitest'
import type { ExecutionPreviewProviderState, ProposedPipelineBuildResult } from './execution-preview-data-connector-model'

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
    expectTypeOf(state.canApplyPreview).toEqualTypeOf<false>()
    expectTypeOf<ProposedPipelineBuildResult['canApplyPreview']>().toEqualTypeOf<false>()
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
