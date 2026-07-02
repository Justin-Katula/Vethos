import { describe, expect, it } from 'vitest'
import type { Objective, Task } from '@shared/schemas'
import { buildObjectiveStatus } from './objective-intelligence'

const objective = { id:'11111111-1111-4111-8111-111111111111', name:'Objectif', color:'#fff', linkedRuleIds:[], level:3, status:'active', createdAt:'2026-06-01T00:00:00.000Z' } satisfies Objective

describe('objective intelligence', () => {
  it('calcule le risque depuis deadline, stagnation et évitement plutôt que le score global seul', () => {
    const task = { id:'22222222-2222-4222-8222-222222222222', title:'Action', linkedObjectiveId:objective.id, deadline:'2026-07-02', deadlineImpact:'hard', complexity:'normal', estimatedMinutes:240, remainingMinutes:240, level:2, status:'active', createdAt:'2026-06-01T00:00:00.000Z' } satisfies Task
    const result = buildObjectiveStatus(objective, [task], [{ objectiveId:objective.id, status:'aborted', startedAt:'2026-07-01T10:00:00.000Z', endedAt:'2026-07-01T10:10:00.000Z' }], new Date('2026-07-02T12:00:00.000Z'))
    expect(result.deadlineRiskLevel).toBeGreaterThanOrEqual(70)
    expect(result.avoidanceLevel).toBeGreaterThan(0)
    expect(['high','critical']).toContain(result.riskLevel)
  })
})
