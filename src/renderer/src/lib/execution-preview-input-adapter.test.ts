import { describe, it, expect } from 'vitest'
import { buildExecutionPreviewInput, type ExecutionPreviewInputPayload } from './execution-preview-input-adapter'

describe('execution-preview-input-adapter', () => {
  it('converts absent arrays to empty arrays', () => {
    const payload: ExecutionPreviewInputPayload = {
      userId: 'u1',
      dateRange: { startDate: '2026-06-26T00:00:00Z', endDate: '2026-06-26T23:59:59Z' }
    }
    const res = buildExecutionPreviewInput(payload)
    expect(res.objectiveModelsV2).toEqual([])
    expect(res.taskModelsV2).toEqual([])
    expect(res.priorityScoresV2).toEqual([])
    expect(res.sessionPlansV2).toEqual([])
    expect(res.runtimeCoordinatorPlansV2).toEqual([])
  })

  it('generates a warning and lowers confidence on invalid dateRange', () => {
    const payload: ExecutionPreviewInputPayload = {
      userId: 'u1',
      dateRange: { startDate: 'invalid', endDate: '2026-06-26T23:59:59Z' }
    }
    const res = buildExecutionPreviewInput(payload)
    expect(res.warnings).toContain('Invalid dateRange provided.')
    expect(res.confidence).toBeLessThan(100)
  })

  it('does not mutate the original input arrays', () => {
    const arr = [{ id: 't1' }]
    const payload: ExecutionPreviewInputPayload = {
      userId: 'u1',
      dateRange: { startDate: '2026-06-26T00:00:00Z', endDate: '2026-06-26T23:59:59Z' },
      taskModelsV2: arr
    }
    const res = buildExecutionPreviewInput(payload)
    expect(res.taskModelsV2).not.toBe(arr)
    expect(res.taskModelsV2).toEqual(arr)
  })

  it('preserves now and idFactory', () => {
    const factory = () => '123'
    const payload: ExecutionPreviewInputPayload = {
      userId: 'u1',
      dateRange: { startDate: '2026-06-26T00:00:00Z', endDate: '2026-06-26T23:59:59Z' },
      now: '2026-06-26T12:00:00Z',
      idFactory: factory
    }
    const res = buildExecutionPreviewInput(payload)
    expect(res.now).toBe('2026-06-26T12:00:00Z')
    expect(res.idFactory).toBe(factory)
  })
})
