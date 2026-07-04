import { describe, expect, it } from 'vitest'
import { runPlacementDiagnostics } from './placement-diagnostics'
import type { PlacementPlanV2 } from '@shared/placement-model'
import type { AnyPlanningContextV2 } from './placement-window-selector'

describe('placement-diagnostics', () => {
  const context: AnyPlanningContextV2 = {
    usableFreeWindows: [
      { id: 'w1', start: '10:00', end: '12:00', usableDurationMinutes: 120, canHostTask: true, canHostDeepWork: true, windowType: 'normal' },
      { id: 'w2', start: '13:00', end: '14:00', usableDurationMinutes: 60, canHostTask: true, canHostDeepWork: false, windowType: 'unsafe' }
    ]
  }

  const basePlan = {
    mode: 'normal',
    dateRange: { startDate: '00:00', endDate: '23:59' },
    summary: { totalProposedMinutes: 60, unplacedCount: 0, rescueMinutes: 0, deepWorkMinutes: 0 },
    proposedBlocks: [],
    unplacedItems: [],
    warnings: [],
    explanation: { title: '', summary: '', reasons: [] },
    confidence: 100
  } as unknown as PlacementPlanV2

  it('reports healthy for a clean plan', () => {
    const plan = {
      ...basePlan,
      proposedBlocks: [
        { id: 'b1', start: '10:00', end: '11:00', durationMinutes: 60, sourceWindowId: 'w1', kind: 'work' }
      ]
    } as unknown as PlacementPlanV2

    const diag = runPlacementDiagnostics(plan, context)
    expect(diag.status).toBe('healthy')
    expect(diag.issues).toHaveLength(0)
  })

  it('detects critical error if total proposed > usable', () => {
    const plan = {
      ...basePlan,
      summary: { ...basePlan.summary, totalProposedMinutes: 200 } // only 180 total, but 60 is unsafe. Actually usable = 120+60=180
    } as unknown as PlacementPlanV2

    const diag = runPlacementDiagnostics(plan, context)
    expect(diag.status).toBe('critical')
    expect(diag.issues[0]!.message).toContain('dépasse le temps libre')
  })

  it('detects overlaps', () => {
    const plan = {
      ...basePlan,
      proposedBlocks: [
        { id: 'b1', start: '10:00', end: '11:00', durationMinutes: 60, sourceWindowId: 'w1' },
        { id: 'b2', start: '10:30', end: '11:30', durationMinutes: 60, sourceWindowId: 'w1' }
      ]
    } as unknown as PlacementPlanV2

    const diag = runPlacementDiagnostics(plan, context)
    expect(diag.status).toBe('critical')
    expect(diag.issues.some(i => i.message.includes('Chevauchement'))).toBe(true)
  })

  it('detects deep work in non-deep window', () => {
    const plan = {
      ...basePlan,
      proposedBlocks: [
        { id: 'b1', start: '13:00', end: '14:00', durationMinutes: 60, sourceWindowId: 'w2', kind: 'deep_work' }
      ]
    } as unknown as PlacementPlanV2

    const diag = runPlacementDiagnostics(plan, context)
    expect(diag.status).toBe('critical') // also detects unsafe window
    expect(diag.issues.some(i => i.message.includes('non-deep_work'))).toBe(true)
    expect(diag.issues.some(i => i.message.includes('interdite'))).toBe(true)
  })

  it('détecte un bloc qui déborde de sa FreeTimeWindow', () => {
    const plan = {
      ...basePlan,
      proposedBlocks: [
        // w1 = 10:00-12:00 ; le bloc finit à 13:00 => débordement.
        { id: 'b1', start: '10:00', end: '13:00', durationMinutes: 180, sourceWindowId: 'w1', kind: 'work' }
      ],
    } as unknown as PlacementPlanV2

    const diag = runPlacementDiagnostics(plan, context)
    expect(diag.status).toBe('critical')
    expect(diag.issues.some((i) => i.message.includes('déborde'))).toBe(true)
  })

  it('signale un plan rescue sans warning global', () => {
    const plan = {
      ...basePlan,
      mode: 'rescue',
      warnings: [], // pas de warning alors qu'on est en crise
      proposedBlocks: [
        { id: 'b1', start: '10:00', end: '11:00', durationMinutes: 60, sourceWindowId: 'w1', kind: 'high_yield' }
      ],
    } as unknown as PlacementPlanV2

    const diag = runPlacementDiagnostics(plan, context)
    expect(diag.issues.some((i) => i.message.includes('crisis') || i.message.includes('warning'))).toBe(true)
  })

  it('signale une confidence incohérente (haute malgré low_confidence)', () => {
    const plan = {
      ...basePlan,
      confidence: 95,
      unplacedItems: [
        { targetId: 't1', reason: 'low_confidence', confidence: 40 } as never,
      ],
    } as unknown as PlacementPlanV2

    const diag = runPlacementDiagnostics(plan, context)
    expect(diag.issues.some((i) => i.message.includes('Confiance'))).toBe(true)
  })

  it('ne modifie jamais le plan passé en paramètre', () => {
    const plan = {
      ...basePlan,
      proposedBlocks: [
        { id: 'b1', start: '10:00', end: '11:00', durationMinutes: 60, sourceWindowId: 'w1', kind: 'work' }
      ],
    } as unknown as PlacementPlanV2
    const original = JSON.parse(JSON.stringify(plan))

    runPlacementDiagnostics(plan, context)
    expect(plan).toEqual(original)
  })
})
