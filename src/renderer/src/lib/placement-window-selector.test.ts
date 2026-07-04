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

  it('accepte les fenêtres deep work pour un candidat qui en requiert', () => {
    // Le sélecteur ne filtre pas strictement par requiresDeepWork (le fit-engine pénalise),
    // mais il doit au moins retourner les fenêtres compatibles.
    const deepCandidate = { ...baseCandidate } as PlacementCandidate
    const windows = selectCandidateWindows({
      candidate: deepCandidate,
      planningContext: {
        usableFreeWindows: [
          { id: 'w1', start: '10:00', end: '12:00', usableDurationMinutes: 120, canHostTask: true, canHostDeepWork: true, windowType: 'normal' },
        ],
      },
    })
    expect(windows).toHaveLength(1)
    expect(windows[0]!.canHostDeepWork).toBe(true)
  })

  it('retourne [] quand aucune fenêtre n\'est compatible (que des unsafe/preparation)', () => {
    const windows = selectCandidateWindows({
      candidate: baseCandidate,
      planningContext: {
        usableFreeWindows: [
          { id: 'w1', start: '08:00', end: '08:30', usableDurationMinutes: 30, canHostTask: true, canHostDeepWork: false, windowType: 'unsafe' },
          { id: 'w2', start: '09:00', end: '09:30', usableDurationMinutes: 30, canHostTask: true, canHostDeepWork: false, windowType: 'preparation_only' },
        ],
      },
    })
    expect(windows).toHaveLength(0)
  })

  it('exclut les short windows quand le candidat ne peut pas utiliser les short gaps', () => {
    const noShortGap = { ...baseCandidate, canUseShortGap: false } as PlacementCandidate
    const windows = selectCandidateWindows({
      candidate: noShortGap,
      planningContext: {
        usableFreeWindows: [
          { id: 'w1', start: '10:00', end: '10:20', usableDurationMinutes: 20, canHostTask: true, canHostDeepWork: false, windowType: 'short' },
          { id: 'w2', start: '11:00', end: '12:00', usableDurationMinutes: 60, canHostTask: true, canHostDeepWork: true, windowType: 'normal' },
        ],
      },
    })
    expect(windows).toHaveLength(1)
    expect(windows[0]!.id).toBe('w2')
  })

  it('ne mute jamais le planningContext passé en paramètre', () => {
    const context = {
      usableFreeWindows: [
        { id: 'w1', start: '10:00', end: '11:00', usableDurationMinutes: 60, canHostTask: true, canHostDeepWork: true, windowType: 'normal' as const },
      ],
    }
    const original = JSON.parse(JSON.stringify(context))
    selectCandidateWindows({ candidate: baseCandidate, planningContext: context })
    expect(context).toEqual(original)
  })
})
