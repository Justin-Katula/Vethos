import { describe, expect, it } from 'vitest'
import type { Objective, RegistryItem, Task } from '@shared/schemas'
import {
  buildObjectiveUnderstandingResult,
  buildTaskUnderstandingResult,
} from './understanding-engine'

function task(over: Partial<Task> = {}): Task {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Réviser examen de math',
    linkedObjectiveId: null,
    deadline: '2026-06-25',
    deadlineImpact: 'hard',
    complexity: 'hard',
    estimatedMinutes: 180,
    remainingMinutes: 160,
    level: 7,
    status: 'active',
    createdAt: '2026-06-20T12:00:00.000Z',
    ...over,
  }
}

function objective(over: Partial<Objective> = {}): Objective {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Réussir mes examens',
    description: 'Préparer les cours et les chapitres importants',
    color: '#22c55e',
    linkedRuleIds: [],
    level: 7,
    status: 'active',
    createdAt: '2026-06-01T12:00:00.000Z',
    ...over,
  }
}

function registryItem(over: Partial<RegistryItem> = {}): RegistryItem {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    kind: 'app',
    identifier: 'code.exe',
    displayName: 'Code',
    usageCount: 0,
    lastSeenAt: '2026-06-24T12:00:00.000Z',
    classified: true,
    demoted: false,
    usefulFor: {
      objectives: [],
      standaloneTasks: [],
    },
    createdAt: '2026-06-24T12:00:00.000Z',
    ...over,
  }
}

describe('understanding-engine', () => {
  it('comprend une tâche scolaire même sans Coach', () => {
    const result = buildTaskUnderstandingResult(task())

    expect(result.category).toBe('school')
    expect(result.importanceGuess).toBeGreaterThan(70)
    expect(result.protectionNeedGuess).toBeGreaterThan(70)
    expect(result.confidence).toBeGreaterThan(55)
  })

  it('réutilise les apps et sites utiles déjà connus dans le registre', () => {
    const linkedTask = task({ linkedObjectiveId: '22222222-2222-4222-8222-222222222222' })
    const registry: RegistryItem[] = [
      registryItem({
        identifier: 'notion.exe',
        executableName: 'notion.exe',
        usefulFor: { objectives: [], standaloneTasks: [linkedTask.id] },
      }),
      registryItem({
        id: '44444444-4444-4444-8444-444444444444',
        kind: 'site',
        identifier: 'school.example',
        displayName: 'School',
        usefulFor: { objectives: ['22222222-2222-4222-8222-222222222222'], standaloneTasks: [] },
      }),
    ]

    const result = buildTaskUnderstandingResult(linkedTask, registry)

    expect(result.usefulAppsGuess).toContain('notion.exe')
    expect(result.usefulSitesGuess).toContain('school.example')
    expect(result.confidence).toBeGreaterThanOrEqual(80)
  })

  it('utilise Coach comme enrichissement, pas comme seule source', () => {
    const result = buildTaskUnderstandingResult(task(), undefined, {
      category: 'school',
      confidence: 80,
      reasons: ['Coach confirme que la tâche concerne une session scolaire.'],
    })

    expect(result.category).toBe('school')
    expect(result.reasons).toContain('Coach confirme la catégorie locale.')
    expect(result.confidence).toBeGreaterThan(80)
  })

  it('comprend un objectif à partir de son texte et de ses tâches liées', () => {
    const result = buildObjectiveUnderstandingResult(objective(), [
      task({ linkedObjectiveId: '22222222-2222-4222-8222-222222222222' }),
    ])

    expect(result.targetType).toBe('objective')
    expect(result.category).toBe('school')
    expect(result.importanceGuess).toBeGreaterThanOrEqual(90)
    expect(result.debug?.linkedTaskCount).toBe(1)
  })

  it('utilise description détaillée, sessions et correction utilisateur', () => {
    const target = task({ title: 'Préparer', description: 'Construire le prototype du projet' })
    const result = buildTaskUnderstandingResult(target, undefined, undefined, {
      sessions: [{ taskId: target.id, endedAt: '2026-06-24T10:00:00.000Z' }],
      corrections: [{ id:'c1', type:'coach_wrong', targetType:'task', targetId:target.id, newValue:'work', strength:'strong', createdAt:'2026-06-24T11:00:00.000Z' }],
    })
    expect(result.category).toBe('work')
    expect(result.reasons.some((reason) => reason.includes('description détaillée'))).toBe(true)
    expect(result.debug?.sessionEvidenceCount).toBe(1)
    expect(result.debug?.correctionEvidenceCount).toBe(1)
  })
})
