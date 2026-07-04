// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { Objective, Task } from '@shared/schemas'
import { buildObjectiveModelV2 } from './objective-model-builder'
import { buildPriorityScoreSnapshot } from './priority-score-snapshot'
import { buildTaskModelV2 } from './task-model-builder'
import { useSettingsStore } from '../store/settings.store'

const NOW = new Date('2026-06-25T12:00:00.000Z')
const OBJECTIVE_ID = '22222222-2222-4222-8222-222222222222'
const TASK_ID = '11111111-1111-4111-8111-111111111111'

function objective(over: Partial<Objective> = {}): Objective {
  return {
    id: OBJECTIVE_ID,
    name: 'Finir Vethos',
    description: 'Objectif central',
    color: '#22c55e',
    linkedRuleIds: [],
    level: 7,
    status: 'active',
    createdAt: '2026-06-01T12:00:00.000Z',
    ...over,
  }
}

function task(over: Partial<Task> = {}): Task {
  return {
    id: TASK_ID,
    title: 'Créer snapshot priorité',
    linkedObjectiveId: OBJECTIVE_ID,
    deadline: '2026-06-26',
    deadlineImpact: 'hard',
    complexity: 'hard',
    estimatedMinutes: 240,
    remainingMinutes: 180,
    level: 8,
    status: 'active',
    createdAt: '2026-06-20T12:00:00.000Z',
    ...over,
  }
}

describe('priority-score-snapshot', () => {
  it('calcule tâches, objectifs, rankings, comparaisons et diagnostics en mode consultatif', () => {
    const obj = objective()
    const t = task()
    const objectiveModel = buildObjectiveModelV2({ objective: obj, linkedTasks: [t], now: NOW })
    const taskModel = buildTaskModelV2({ task: t, objective: obj, objectiveModel, now: NOW })

    useSettingsStore.setState({ engineV2Priority: false })

    const snapshot = buildPriorityScoreSnapshot({
      taskModelsV2: [taskModel],
      objectiveModelsV2: [objectiveModel],
      oldScores: { [TASK_ID]: 50, [OBJECTIVE_ID]: 60 },
      now: NOW,
    })

    expect(snapshot.metadata.advisoryOnly).toBe(true)
    expect(snapshot.taskScores).toHaveLength(1)
    expect(snapshot.objectiveScores).toHaveLength(1)
    expect(snapshot.rankings.action.rankedItems.length).toBeGreaterThan(0)
    expect(snapshot.comparisons).toHaveLength(2)
    expect(snapshot.diagnostics.status).toMatch(/healthy|warning|critical/)
  })
})
