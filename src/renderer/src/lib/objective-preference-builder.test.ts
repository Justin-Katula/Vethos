import { describe, expect, it } from 'vitest'
import { buildObjectivePreferenceModel } from './objective-preference-builder'

describe('objective preference builder', () => {
  it('conserve importance et évitement comme deux dimensions distinctes', () => {
    const result = buildObjectivePreferenceModel(
      { id: 'objective-1', level: 10, status: 'active', createdAt: '2026-06-01T00:00:00.000Z' },
      [{ linkedObjectiveId: 'objective-1', status: 'active' }], [],
      [{ id:'e1', type:'task_skipped', context:{ objectiveId:'objective-1' }, createdAt:'2026-06-20T00:00:00.000Z' }, { id:'e2', type:'session_aborted', context:{ objectiveId:'objective-1' }, createdAt:'2026-06-21T00:00:00.000Z' }], [],
      { now:'2026-07-02T00:00:00.000Z' },
    )
    expect(result.declaredImportanceScore).toBe(100)
    expect(result.avoidanceScore).toBeGreaterThan(40)
    expect(result.stagnationScore).toBeGreaterThan(50)
    expect(result.reasons.length).toBeGreaterThan(0)
  })
})
