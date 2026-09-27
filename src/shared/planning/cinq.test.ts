import { describe, expect, it } from 'vitest'
import { sleepScheduleEntries } from '@shared/sleep'
import { computePlan } from './engine'
import type { PlanningInput } from './types'

describe('Les durées tombent sur des multiples de 5', () => {
  it('jamais « 1 h 23 » : travail restant, blocs et pauses arrondis', () => {
    const tache = (id: string, restant: number) => ({
      id, title: id, plan: 'x', deadline: '2026-09-27', importance: 5, category: 'général', workKind: 'routine' as const,
      estimatedMinutes: restant, remainingMinutes: restant, correctionFactor: 1.4, parentTaskId: null, partOrder: null,
      extraMinutes: 0, status: 'active' as const, appsToBlock: [], createdAt: '2026-09-01T10:00:00.000Z',
    })
    const input: PlanningInput = {
      today: '2026-09-21', rangeEnd: '2026-09-27',
      tasks: [tache('a1111111-1111-4111-8111-111111111111', 83), tache('b1111111-1111-4111-8111-111111111111', 217)],
      objectives: [{ id: 'c1111111-1111-4111-8111-111111111111', name: 'Run', plan: 'x', color: '#e03131', weeklyTargetMinutes: 173, appsToBlock: [], createdAt: '2026-09-01T10:00:00.000Z' }],
      ancres: [], schedule: sleepScheduleEntries('23:00', '07:00'), observations: [], anchorMissCounts: {}, dailyUtilization: {},
      weeklyObjectiveServed: {}, objectiveLastServed: {}, lastSignalAt: {}, tasksCreatedPerWeek: {}, consecutiveDelays: {},
    }
    const plan = computePlan(input, new Date(2026, 8, 21, 9, 37))
    expect(plan.blocks.length).toBeGreaterThan(0)
    for (const b of plan.blocks) {
      expect(b.workMinutes % 5).toBe(0)
      expect(b.durationMinutes % 5).toBe(0)
    }
    expect(plan.internalError).toBeUndefined()
  })
})
