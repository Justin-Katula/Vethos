import { describe, expect, it } from 'vitest'
import { validateProposedBlock } from './placement-constraint-engine'
import type { ProposedPlacementBlock, PlacementCandidate } from '@shared/placement-model'
import type { AnyPlanningContextV2 } from './placement-window-selector'

describe('placement-constraint-engine', () => {
  const baseCandidate = {
    id: 'c1',
    requiresDeepWork: false,
  } as PlacementCandidate

  const baseBlock = {
    id: 'b1',
    targetId: 't1',
    start: '10:00',
    end: '11:00',
    durationMinutes: 60,
    sourceWindowId: 'w1',
    locked: false,
    confidence: 100,
    kind: 'work',
  } as ProposedPlacementBlock

  const basePlanningContext: AnyPlanningContextV2 & { lockedBlocks: Array<{ start: string; end: string; type: string }> } = {
    usableFreeWindows: [
      { id: 'w1', start: '09:00', end: '12:00', usableDurationMinutes: 180, windowType: 'normal', canHostTask: true, canHostDeepWork: true }
    ],
    lockedBlocks: []
  }

  it('validates a correct block', () => {
    const result = validateProposedBlock({
      block: baseBlock,
      planningContext: basePlanningContext,
      existingProposedBlocks: [],
      candidate: baseCandidate
    })
    expect(result.valid).toBe(true)
  })

  it('rejects if duration <= 0', () => {
    const result = validateProposedBlock({
      block: { ...baseBlock, durationMinutes: 0 },
      planningContext: basePlanningContext,
      existingProposedBlocks: [],
      candidate: baseCandidate
    })
    expect(result.valid).toBe(false)
  })

  it('rejects if locked=true', () => {
    const result = validateProposedBlock({
      block: { ...baseBlock, locked: true as unknown as false }, // TS normally prevents this, but test at runtime
      planningContext: basePlanningContext,
      existingProposedBlocks: [],
      candidate: baseCandidate
    })
    expect(result.valid).toBe(false)
  })

  it('rejects if outside source window', () => {
    const result = validateProposedBlock({
      block: { ...baseBlock, start: '08:00', end: '09:00' }, // Window is 09:00-12:00
      planningContext: basePlanningContext,
      existingProposedBlocks: [],
      candidate: baseCandidate
    })
    expect(result.valid).toBe(false)
  })

  it('rejects if overlapping locked block (sleep, work, etc)', () => {
    const context = {
      ...basePlanningContext,
      lockedBlocks: [{ start: '10:30', end: '11:30', type: 'sleep' }]
    }
    const result = validateProposedBlock({
      block: baseBlock,
      planningContext: context,
      existingProposedBlocks: [],
      candidate: baseCandidate
    })
    expect(result.valid).toBe(false)
  })

  it('rejects if overlapping existing proposed block', () => {
    const existing: ProposedPlacementBlock = {
      ...baseBlock,
      id: 'existing1',
      start: '10:30',
      end: '11:30'
    }
    const result = validateProposedBlock({
      block: baseBlock,
      planningContext: basePlanningContext,
      existingProposedBlocks: [existing],
      candidate: baseCandidate
    })
    expect(result.valid).toBe(false)
  })

  it('rejects if after deadline', () => {
    const candidateWithDeadline = { ...baseCandidate, deadline: '09:30' }
    const result = validateProposedBlock({
      block: baseBlock,
      planningContext: basePlanningContext,
      existingProposedBlocks: [],
      candidate: candidateWithDeadline
    })
    expect(result.valid).toBe(false)
  })

  it('rejects if requires deep work but window is not deep', () => {
    const candidateDeep = { ...baseCandidate, requiresDeepWork: true }
    const contextNonDeep: AnyPlanningContextV2 & { lockedBlocks: Array<{ start: string; end: string; type: string }> } = {
      ...basePlanningContext,
      usableFreeWindows: [{ ...basePlanningContext.usableFreeWindows[0]!, canHostDeepWork: false }]
    }
    const result = validateProposedBlock({
      block: baseBlock,
      planningContext: contextNonDeep,
      existingProposedBlocks: [],
      candidate: candidateDeep
    })
    expect(result.valid).toBe(false)
  })

  it('rejette un bloc placé dans une fenêtre recovery_only (sauf recovery/manual_review)', () => {
    const recoveryContext: AnyPlanningContextV2 & { lockedBlocks: Array<{ start: string; end: string; type: string }> } = {
      ...basePlanningContext,
      usableFreeWindows: [
        { id: 'w1', start: '09:00', end: '12:00', usableDurationMinutes: 180, windowType: 'recovery_only', canHostTask: true, canHostDeepWork: false }
      ],
    }
    // Un bloc 'work' classique dans une fenêtre recovery_only doit être rejeté.
    const result = validateProposedBlock({
      block: baseBlock,
      planningContext: recoveryContext,
      existingProposedBlocks: [],
      candidate: baseCandidate,
    })
    expect(result.valid).toBe(false)
  })

  it('rejette un bloc placé dans une fenêtre preparation_only', () => {
    const prepContext: AnyPlanningContextV2 & { lockedBlocks: Array<{ start: string; end: string; type: string }> } = {
      ...basePlanningContext,
      usableFreeWindows: [
        { id: 'w1', start: '09:00', end: '12:00', usableDurationMinutes: 180, windowType: 'preparation_only', canHostTask: true, canHostDeepWork: false }
      ],
    }
    const result = validateProposedBlock({
      block: baseBlock,
      planningContext: prepContext,
      existingProposedBlocks: [],
      candidate: baseCandidate,
    })
    expect(result.valid).toBe(false)
  })

  it('rejette un bloc placé dans une fenêtre unsafe', () => {
    const unsafeContext: AnyPlanningContextV2 & { lockedBlocks: Array<{ start: string; end: string; type: string }> } = {
      ...basePlanningContext,
      usableFreeWindows: [
        { id: 'w1', start: '09:00', end: '12:00', usableDurationMinutes: 180, windowType: 'unsafe', canHostTask: true, canHostDeepWork: false }
      ],
    }
    const result = validateProposedBlock({
      block: baseBlock,
      planningContext: unsafeContext,
      existingProposedBlocks: [],
      candidate: baseCandidate,
    })
    expect(result.valid).toBe(false)
  })

  it('rejette un bloc dont le priorityScore est hors bornes (0-100)', () => {
    const result = validateProposedBlock({
      block: { ...baseBlock, priorityScore: 150 },
      planningContext: basePlanningContext,
      existingProposedBlocks: [],
      candidate: baseCandidate,
    })
    expect(result.valid).toBe(false)
  })
})
