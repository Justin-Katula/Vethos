import { describe, expect, it } from 'vitest'
import type { LearningUpdate } from '@shared/engine-results'
import { gateLearningUpdate, LEARNING_DAILY_ADJUSTMENT_CAP, LEARNING_REPEAT_THRESHOLD } from './learning-engine'

const update = (createdAt = '2026-07-02T10:00:00.000Z'): LearningUpdate => ({ source:'session', targetType:'task', targetId:'t1', taskEstimateAdjustment:10, reasons:['Plus long que prévu.'], createdAt })

describe('learning safety gate', () => {
  it('attend trois signaux cohérents avant application', () => {
    expect(LEARNING_REPEAT_THRESHOLD).toBe(3)
    expect(gateLearningUpdate(update(), []).taskEstimateAdjustment).toBeUndefined()
    expect(gateLearningUpdate(update(), [update('2026-07-01T10:00:00.000Z'), update('2026-07-01T11:00:00.000Z')]).taskEstimateAdjustment).toBe(10)
  })

  it('limite le cumul journalier', () => {
    const history = [update('2026-07-01T10:00:00.000Z'), update('2026-07-01T11:00:00.000Z'), { ...update(), taskEstimateAdjustment: 12 }]
    const result = gateLearningUpdate(update('2026-07-02T12:00:00.000Z'), history)
    expect(LEARNING_DAILY_ADJUSTMENT_CAP).toBe(15)
    expect(result.taskEstimateAdjustment).toBe(3)
  })
})
