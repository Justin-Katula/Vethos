import { describe, expect, it } from 'vitest'
import { buildPlacementCandidates } from './placement-input-adapter'

describe('placement-input-adapter', () => {
  it('excludes completed and completed_verified tasks', () => {
    const candidates = buildPlacementCandidates({
      taskModelsV2: [
        { id: '1', status: 'completed' },
        { id: '2', status: 'completed_verified' },
        { id: '3', status: 'active' },
      ],
    })

    expect(candidates).toHaveLength(1)
    expect(candidates[0]!.targetId).toBe('3')
  })

  it('turns vague tasks into short manual_review candidates', () => {
    const candidates = buildPlacementCandidates({
      taskModelsV2: [
        { id: '1', status: 'active', isVague: true, remainingMinutes: 120, requiresDeepWork: true },
      ],
    })

    expect(candidates).toHaveLength(1)
    const c = candidates[0]!
    expect(c.placementModeHint).toBe('manual_review')
    expect(c.requiresDeepWork).toBe(false)
    expect(c.recommendedMinutes).toBeLessThan(30)
    expect(c.canUseShortGap).toBe(true)
  })

  it('creates create_task review candidate for objectives without clear next action', () => {
    const candidates = buildPlacementCandidates({
      objectiveModelsV2: [
        { id: 'o1', status: 'active', hasClearNextAction: false },
      ],
    })

    expect(candidates).toHaveLength(1)
    const c = candidates[0]!
    expect(c.targetType).toBe('objective')
    expect(c.placementModeHint).toBe('manual_review')
    expect(c.reasons[0]).toContain('création')
  })

  it('translates deadline crisis contexts into placementModeHints', () => {
    const candidates = buildPlacementCandidates({
      taskModelsV2: [{ id: '1', status: 'active' }],
      deadlineCrisisContexts: [
        { targetId: '1', crisisLevel: 'critical', recommendedMode: 'rescue_plan' },
      ],
    })

    expect(candidates[0]!.placementModeHint).toBe('rescue')
  })

  it('does not hardcode specific examples', () => {
    // There should be no mention of "examen", "chapitre", etc. in the implementation.
    // The implementation only relies on signals like isVague, requiresDeepWork, status, recommendedAction, crisisLevel.
    const candidates = buildPlacementCandidates({
      taskModelsV2: [{ id: 'exam', status: 'active' }],
    })
    expect(candidates[0]!.reasons.length).toBe(0)
  })
})
