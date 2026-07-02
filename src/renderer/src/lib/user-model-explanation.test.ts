import { describe, expect, it } from 'vitest'
import { buildEmptyUserModel } from '@shared/user-model'
import { explainObjectivePreference, explainUserModel } from './user-model-explanation'

describe('user model explanations', () => {
  it('explique la stagnation sans langage humiliant et sans debug par défaut', () => {
    const explanation = explainObjectivePreference({ objectiveId:'o1', declaredImportanceScore:90, observedCommitmentScore:10, lifeImpactScore:80, avoidanceScore:70, stagnationScore:80, momentumScore:0, confidence:35, reasons:[], updatedAt:'2026-07-02T00:00:00.000Z' })
    expect(explanation.reasons.length).toBeGreaterThan(0)
    expect(JSON.stringify(explanation).toLowerCase()).not.toContain('faible')
    expect(explanation.debug).toBeUndefined()
    expect(explainUserModel(buildEmptyUserModel('user-1')).length).toBeGreaterThan(0)
  })
})
