import { describe, expect, it } from 'vitest'
import { selectCandidateWindows } from './placement-window-selector'
import type { PlacementCandidate } from '@shared/placement-model'

describe('placement-window-selector', () => {
  const baseCandidate = {
    id: 'c1',
    reasons: [],
    canUseShortGap: false,
    shouldAvoidLateNight: false,
  } as unknown as PlacementCandidate

  it('selects normal windows', () => {
    const windows = selectCandidateWindows({
      candidate: baseCandidate,
      planningContext: {
        usableFreeWindows: [
          { id: 'w1', start: '2026-06-25T10:00:00Z', end: '11:00', usableDurationMinutes: 60, canHostTask: true, canHostDeepWork: true, windowType: 'normal' },
        ],
      },
    })
    expect(windows).toHaveLength(1)
  })

  it('excludes preparation and unsafe windows', () => {
    const windows = selectCandidateWindows({
      candidate: baseCandidate,
      planningContext: {
        usableFreeWindows: [
          { id: 'w1', start: '08:00', end: '08:30', usableDurationMinutes: 30, canHostTask: true, canHostDeepWork: false, windowType: 'preparation_only' },
          { id: 'w2', start: '10:00', end: '11:00', usableDurationMinutes: 60, canHostTask: true, canHostDeepWork: false, windowType: 'unsafe' },
        ],
      },
    })
    expect(windows).toHaveLength(0)
  })

  it('excludes recovery_only unless candidate is recovery', () => {
    const recoveryCandidate = { ...baseCandidate, reasons: ['Besoin de recovery'] } as PlacementCandidate
    
    const context = {
      usableFreeWindows: [
        { id: 'w1', start: '10:00', end: '11:00', usableDurationMinutes: 60, canHostTask: true, canHostDeepWork: false, windowType: 'recovery_only' as const },
      ],
    }

    expect(selectCandidateWindows({ candidate: baseCandidate, planningContext: context })).toHaveLength(0)
    expect(selectCandidateWindows({ candidate: recoveryCandidate, planningContext: context })).toHaveLength(1)
  })

  it('excludes windows after deadline', () => {
    const candidateWithDeadline = { ...baseCandidate, deadline: '2026-06-25T12:00:00Z' } as PlacementCandidate
    
    const windows = selectCandidateWindows({
      candidate: candidateWithDeadline,
      planningContext: {
        usableFreeWindows: [
          { id: 'w1', start: '2026-06-25T10:00:00Z', end: '11:00', usableDurationMinutes: 60, canHostTask: true, canHostDeepWork: true, windowType: 'normal' },
          { id: 'w2', start: '2026-06-25T13:00:00Z', end: '14:00', usableDurationMinutes: 60, canHostTask: true, canHostDeepWork: true, windowType: 'normal' },
        ],
      },
    })
    expect(windows).toHaveLength(1)
    expect(windows[0]!.id).toBe('w1')
  })

  it('excludes tiny windows and used windows', () => {
    const windows = selectCandidateWindows({
      candidate: baseCandidate,
      usedWindowIds: ['w1'],
      planningContext: {
        usableFreeWindows: [
          { id: 'w1', start: '10:00', end: '11:00', usableDurationMinutes: 60, canHostTask: true, canHostDeepWork: true, windowType: 'normal' },
          { id: 'w2', start: '11:00', end: '11:10', usableDurationMinutes: 10, canHostTask: true, canHostDeepWork: false, windowType: 'tiny' },
        ],
      },
    })
    expect(windows).toHaveLength(0)
  })
})
