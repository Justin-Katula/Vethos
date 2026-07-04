import { describe, expect, it } from 'vitest'
import type { PriorityResult } from '@shared/engine-results'
import type { Task } from '@shared/schemas'
import { buildTaskStatus } from './task-intelligence'

const task = { id:'11111111-1111-4111-8111-111111111111', title:'Travail critique', linkedObjectiveId:null, deadline:'2026-07-02', deadlineImpact:'hard', complexity:'hard', estimatedMinutes:180, remainingMinutes:180, level:8, status:'active', createdAt:'2026-07-01T00:00:00.000Z' } satisfies Task

describe('task intelligence', () => {
  it('maintient une pause obligatoire quand une deadline critique allonge la session', () => {
    const priority: PriorityResult = { kind:'task', targetId:task.id, priorityScore:95, urgencyScore:95, valueScore:70, workloadScore:90, complexityScore:80, stagnationScore:20, momentumScore:0, reasonTags:['deadline_today','large_remaining_work'], humanReasons:['Deadline aujourd’hui.'], confidence:90, debug:{ remainingMinutes:180 } }
    const status = buildTaskStatus(task, null, priority)
    expect(status.recommendedSessionLength).toBe(120)
    expect(status.requiresMandatoryBreak).toBe(true)
    expect(status.mandatoryBreaks).toHaveLength(2)
  })
})
