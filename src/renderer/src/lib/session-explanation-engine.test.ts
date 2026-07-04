import { describe, expect, it } from 'vitest'
import { explainSessionOutcome } from './session-explanation-engine'

describe('session-explanation-engine', () => {
  it('generates non-humiliating firm messages for rejected completion', () => {
    const res = explainSessionOutcome({
      outcome: 'completion_rejected',
      reasons: ['Preuves manquantes'],
      warnings: []
    } as any)
    
    // The summary must be action-oriented and objective, not personal
    expect(res.summary).toContain('preuves sont insuffisantes')
    expect(res.reasons).toContain('Preuves manquantes')
    
    // Ensure no humiliating words
    const lower = res.summary.toLowerCase()
    expect(lower).not.toContain('mens')
    expect(lower).not.toContain('faible')
    expect(lower).not.toContain('paresseux')
  })
})
