import { describe, it, expect } from 'vitest'
import { explainActivationBridge } from './activation-bridge-explanation'
import { ActivationBridgeGateResult } from '../../../shared/activation-bridge-model'

describe('activation-bridge-explanation', () => {
  it('explique draft ready', () => {
    const res = explainActivationBridge({ contractDraft: {} as any, gateResult: { status: 'draft_ready' } as any })
    expect(res.summary).toContain('aucune activation réelle')
    expect(res.nextRecommendedAction).toBe('keep_as_draft')
  })

  it('explique blocked review', () => {
    const res = explainActivationBridge({ contractDraft: {} as any, gateResult: { status: 'blocked_by_review' } as any })
    expect(res.summary).toContain('bloquée')
    expect(res.nextRecommendedAction).toBe('fix_review')
  })

  it('rappelle que c est draft-only', () => {
    const res = explainActivationBridge({ contractDraft: {} as any, gateResult: { status: 'draft_ready' } as any })
    expect(res.keyPoints.some(p => p.includes('Read-Only') || p.includes('seulement'))).toBe(true)
  })
})
