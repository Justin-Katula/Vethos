import { describe, expect, it } from 'vitest'
import { buildEmptyUserModel } from '@shared/user-model'
import { applyUserCorrectionToModel, createUserCorrection, getCorrectionWeight, isCorrectionSuspicious, mergeCorrections } from './user-correction-system'

describe('user correction system', () => {
  it('limite une correction opportuniste pendant une session stricte', () => {
    const correction = createUserCorrection({ id:'c1', type:'site_classification_corrected', targetType:'site', targetId:'https://example.test/path', newValue:'useful', strength:'strong', context:{ duringSession:true } })
    expect(isCorrectionSuspicious(correction, { strictSession:true, targetBlocked:true })).toBe(true)
    expect(getCorrectionWeight(correction, { strictSession:true })).toBeLessThan(.5)
    expect(correction.targetId).toBe('example.test')
  })
  it('applique immuablement une correction de chronotype et conserve permanent', () => {
    const model = buildEmptyUserModel('user-1')
    const weak = createUserCorrection({ id:'w', createdAt:'2026-07-02T00:00:00.000Z', type:'chronotype_corrected', targetType:'user_model', newValue:'morning', strength:'weak' })
    const permanent = createUserCorrection({ id:'p', createdAt:'2026-07-01T00:00:00.000Z', type:'chronotype_corrected', targetType:'user_model', newValue:'evening', strength:'permanent' })
    expect(mergeCorrections([permanent, weak])[0]?.id).toBe('p')
    expect(applyUserCorrectionToModel(model, weak).cognitiveModel.declaredChronotype).toBe('morning')
    expect(model.corrections).toHaveLength(0)
  })
})
