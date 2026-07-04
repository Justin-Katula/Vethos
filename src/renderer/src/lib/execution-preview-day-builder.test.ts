import { describe, it, expect } from 'vitest'
import { buildExecutionPreviewDays } from './execution-preview-day-builder'

describe('execution-preview-day-builder', () => {
  it('builds empty days for date range if no placement provided', () => {
    const days = buildExecutionPreviewDays({
      dateRange: { startDate: '2026-06-26T00:00:00Z', endDate: '2026-06-27T00:00:00Z' }
    })
    expect(days).toHaveLength(2)
    expect(days[0]!.date).toBe('2026-06-26')
    expect(days[1]!.date).toBe('2026-06-27')
    expect(days[0]!.blocks).toEqual([])
  })

  it('associates placement block with session and runtime plan', () => {
    const placementPlanV2 = {
      days: [
        {
          date: '2026-06-26',
          blocks: [
            { id: 'b1', sessionPlanId: 's1', durationMinutes: 60, kind: 'deep_work_block' }
          ]
        }
      ]
    }
    const sessionPlansV2 = [{ id: 's1', mode: 'strict' }]
    const runtimeCoordinatorPlansV2 = [
      { id: 'r1', sessionPlanId: 's1', blockingProfileDraft: { mode: 'blocklist' } }
    ]

    const days = buildExecutionPreviewDays({
      dateRange: { startDate: '2026-06-26T00:00:00Z', endDate: '2026-06-26T23:59:59Z' },
      placementPlanV2,
      sessionPlansV2,
      runtimeCoordinatorPlansV2
    })

    expect(days[0]!.blocks).toHaveLength(1)
    const block = days[0]!.blocks[0]!
    expect(block.sourceSessionPlanId).toBe('s1')
    expect(block.sourceRuntimeCoordinatorPlanId).toBe('r1')
    expect(block.sessionMode).toBe('strict')
    expect(block.protectionMode).toBe('blocklist')
    expect(block.readiness).toBe('ready')
    expect(days[0]!.summary.deepWorkMinutes).toBe(60)
  })

  it('marks needs_review and adds warning if session plan is missing', () => {
    const placementPlanV2 = {
      days: [
        {
          date: '2026-06-26',
          blocks: [
            { id: 'b1', sessionPlanId: 'missing_s1' }
          ]
        }
      ]
    }

    const days = buildExecutionPreviewDays({
      dateRange: { startDate: '2026-06-26T00:00:00Z', endDate: '2026-06-26T23:59:59Z' },
      placementPlanV2
    })

    const block = days[0]!.blocks[0]!
    expect(block.readiness).toBe('needs_review')
    expect(block.warnings).toContain('Session plan is missing for this block.')
  })
})
