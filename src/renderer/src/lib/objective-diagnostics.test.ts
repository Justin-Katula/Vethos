import { describe, expect, it } from 'vitest'
import type { Objective } from '@shared/schemas'
import { buildObjectiveModelV2 } from './objective-model-builder'
import { runObjectiveDiagnostics } from './objective-diagnostics'

const objective: Objective = {
  id: '22222222-2222-4222-8222-222222222222', name: 'Direction importante', color: '#22c55e',
  linkedRuleIds: [], level: 7, status: 'active', createdAt: '2026-05-01T00:00:00.000Z',
}

describe('objective diagnostics', () => {
  it('détecte un objectif actif sans tâche, sans muter le modèle', () => {
    const model = buildObjectiveModelV2({ objective, linkedTasks: [], now: new Date('2026-07-02T12:00:00.000Z') })
    const before = JSON.stringify(model)
    const diagnostics = runObjectiveDiagnostics([model])
    expect(diagnostics.status).toBe('critical')
    expect(diagnostics.issues.map((issue) => issue.code)).toContain('active_without_task')
    expect(diagnostics.issues.map((issue) => issue.code)).toContain('critical_no_next_action')
    expect(JSON.stringify(model)).toBe(before)
  })

  it('retourne healthy pour une liste vide', () => {
    expect(runObjectiveDiagnostics([]).status).toBe('healthy')
  })
})
