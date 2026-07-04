import { describe, expect, it } from 'vitest'
import type { Objective, Task } from '@shared/schemas'
import type { PlacedBlock } from './placement-engine'
import {
  explainBlockingDecision,
  explainPlanningBlock,
  explainTaskDecision,
} from './decision-explanation'

const TODAY = '2026-06-24'

function task(over: Partial<Task> = {}): Task {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Réviser le chapitre 4',
    linkedObjectiveId: null,
    deadline: '2026-06-25',
    deadlineImpact: 'recoverable',
    complexity: 'hard',
    estimatedMinutes: 260,
    remainingMinutes: 220,
    level: 7,
    status: 'active',
    createdAt: '2026-06-20T12:00:00.000Z',
    ...over,
  }
}

function objective(over: Partial<Objective> = {}): Objective {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Réussir mon examen',
    description: 'Préparer la session finale',
    color: '#22c55e',
    linkedRuleIds: [],
    level: 7,
    status: 'active',
    createdAt: '2026-06-20T12:00:00.000Z',
    ...over,
  }
}

function block(over: Partial<PlacedBlock> = {}): PlacedBlock {
  return {
    id: 'block-1',
    date: TODAY,
    startMinute: 540,
    endMinute: 660,
    kind: 'task',
    refKind: 'task',
    refId: '11111111-1111-4111-8111-111111111111',
    label: 'Réviser le chapitre 4',
    locked: true,
    linkedTaskId: null,
    linkedTaskIds: [],
    ...over,
  }
}

describe('decision-explanation', () => {
  it('explique une tâche urgente sans changer son comportement', () => {
    const linked = objective()
    const explanation = explainTaskDecision(
      task({ linkedObjectiveId: linked.id }),
      linked,
      { todayStr: TODAY, todayStartMinute: 9 * 60 },
    )

    expect(explanation.targetType).toBe('task')
    expect(explanation.reasonTags).toContain('deadline_soon')
    expect(explanation.reasonTags).toContain('large_remaining_work')
    expect(explanation.reasonTags).toContain('high_complexity')
    expect(explanation.reasonTags).toContain('linked_to_objective')
    expect(explanation.humanReasons.length).toBeGreaterThan(2)
    expect(explanation.debug?.score).toBeGreaterThan(0)
  })

  it('reconnaît une tâche presque terminée', () => {
    const explanation = explainTaskDecision(
      task({ estimatedMinutes: 260, remainingMinutes: 20, complexity: 'normal' }),
      null,
      { todayStr: TODAY, todayStartMinute: 9 * 60 },
    )

    expect(explanation.reasonTags).toContain('almost_completed')
    expect(explanation.humanTitle).toBe('Presque terminé')
  })

  it('explique un bloc de planning à partir de la tâche liée', () => {
    const explanation = explainPlanningBlock(block(), task(), null)

    expect(explanation.targetType).toBe('planning_block')
    expect(explanation.reasonTags).toContain('good_time_slot')
    expect(explanation.humanReasons.length).toBeGreaterThan(0)
  })

  it('explique une décision de blocage en session active', () => {
    const explanation = explainBlockingDecision(
      { kind: 'app', label: 'Spotify', identifier: 'spotify.exe' },
      {
        sessionActive: true,
        blocked: true,
        focusLabel: 'Réviser le chapitre 4',
        mode: 'allowlist',
        protectionLevel: 8,
      },
    )

    expect(explanation.targetType).toBe('app')
    expect(explanation.reasonTags).toContain('session_active')
    expect(explanation.reasonTags).toContain('blocked_as_distraction')
    expect(explanation.humanTitle).toBe('Accès bloqué')
  })
})
