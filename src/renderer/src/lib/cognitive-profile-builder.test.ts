import { describe, expect, it } from 'vitest'
import { buildCognitiveModel } from './cognitive-profile-builder'

describe('cognitive profile builder', () => {
  it('garde chronotype déclaré et détecté séparés', () => {
    const sessions = [6,7,8].map((hour) => ({ status:'completed', hour, plannedMinutes:60, actualMinutes:45 }))
    const model = buildCognitiveModel(sessions, [], { declaredChronotype:'evening' }, [], '2026-07-02T00:00:00.000Z')
    expect(model.declaredChronotype).toBe('evening')
    expect(model.detectedChronotype).toBe('morning')
    expect(model.hourlyPerformance[6]?.confidence).toBeLessThan(50)
  })
})
