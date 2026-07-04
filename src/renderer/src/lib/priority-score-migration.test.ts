import { describe, expect, it } from 'vitest'
import type { Objective, Task } from '@shared/schemas'
import { buildTaskPriorityResult } from './priority-engine'
import { rollbackObjectivePriorityScore, rollbackTaskPriorityScore, toPersistedPriorityScore } from './priority-score-migration'

const task: Task = { id:'11111111-1111-4111-8111-111111111111', title:'Tâche', linkedObjectiveId:null, deadline:'2026-07-03', level:5, status:'active', createdAt:'2026-07-01T00:00:00.000Z' }
const objective: Objective = { id:'22222222-2222-4222-8222-222222222222', name:'Objectif', color:'#22c55e', linkedRuleIds:[], level:6, status:'active', createdAt:'2026-07-01T00:00:00.000Z' }

describe('priority score persistence migration', () => {
  it('persiste une version et rollback sans toucher level', () => {
    const score = toPersistedPriorityScore(buildTaskPriorityResult(task), '2026-07-02T00:00:00.000Z')
    expect(score.schemaVersion).toBe(2)
    expect(rollbackTaskPriorityScore({ ...task, priorityScoreV2: score }).level).toBe(5)
    expect(rollbackObjectivePriorityScore({ ...objective, priorityScoreV2: score }).level).toBe(6)
    expect(rollbackTaskPriorityScore({ ...task, priorityScoreV2: score }).priorityScoreV2).toBeUndefined()
  })
})
