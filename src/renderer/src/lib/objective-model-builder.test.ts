import { describe, expect, it } from 'vitest'
import type { Objective, RegistryItem, Task } from '@shared/schemas'
import { buildEmptyUserModel } from '@shared/user-model'
import { DEFAULT_OBJECTIVE_MODEL_V2_FLAGS } from '@shared/objective-model'
import { buildObjectiveModelV2 } from './objective-model-builder'

const NOW = new Date('2026-06-24T12:00:00.000Z')
const OBJECTIVE_ID = '22222222-2222-4222-8222-222222222222'
const TASK_ID = '11111111-1111-4111-8111-111111111111'

function objective(over: Partial<Objective> = {}): Objective {
  return {
    id: OBJECTIVE_ID,
    name: 'Construire un projet utile',
    description: 'Construire et livrer une application importante',
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
    title: 'Préparer la prochaine version',
    linkedObjectiveId: OBJECTIVE_ID,
    deadline: '2026-06-25',
    deadlineImpact: 'hard',
    complexity: 'hard',
    estimatedMinutes: 240,
    remainingMinutes: 180,
    level: 7,
    status: 'active',
    createdAt: '2026-06-20T12:00:00.000Z',
    ...over,
  }
}

function registryItem(over: Partial<RegistryItem> = {}): RegistryItem {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    kind: 'app',
    identifier: 'editor.exe',
    executableName: 'editor.exe',
    displayName: 'Editor',
    usageCount: 0,
    lastSeenAt: '2026-06-24T12:00:00.000Z',
    classified: true,
    demoted: false,
    usefulFor: {
      objectives: [OBJECTIVE_ID],
      standaloneTasks: [],
    },
    createdAt: '2026-06-24T12:00:00.000Z',
    ...over,
  }
}

describe('objective-model-builder intégré', () => {
  it('crée une prochaine action quand un objectif actif n’a aucune tâche liée', () => {
    const model = buildObjectiveModelV2({
      objective: objective(),
      linkedTasks: [],
      now: NOW,
    })

    expect('advisoryOnly' in model.metadata).toBe(false)
    expect(model.metadata.source).toBe('objective_model_builder')
    expect(model.metadata.flags.objectiveControlsBlocking).toBe(false)
    expect(model.nextAction.kind).toBe('create_task')
    expect(model.risk.noNextActionRiskScore).toBeGreaterThanOrEqual(80)
    expect(model.progress.progressPercent).toBe(0)
  })

  it('reconnaît une tâche active comme prochain pas sans changer le planner réel', () => {
    const model = buildObjectiveModelV2({
      objective: objective(),
      linkedTasks: [task()],
      now: NOW,
    })

    expect(['continue_task', 'recover_stagnation']).toContain(model.nextAction.kind)
    expect('taskId' in model.nextAction ? model.nextAction.taskId : '').toBe(TASK_ID)
    expect(model.linkedTasks[0]?.id).toBe(TASK_ID)
    expect(model.metadata.flags.objectiveControlsPlanning).toBe(false)
    expect(model.metadata.flags.objectiveControlsTaskQueue).toBe(true)
  })

  it('utilise les préférences utilisateur et le registre sans pré-enregistrer une application', () => {
    const userModel = buildEmptyUserModel('user-1', { now: NOW.toISOString() })
    userModel.objectivePreferences = [
      {
        objectiveId: OBJECTIVE_ID,
        declaredImportanceScore: 95,
        observedCommitmentScore: 70,
        lifeImpactScore: 90,
        avoidanceScore: 0,
        stagnationScore: 0,
        momentumScore: 40,
        confidence: 80,
        reasons: ['L’utilisateur a déclaré cet objectif comme central.'],
        updatedAt: NOW.toISOString(),
      },
    ]
    userModel.appSitePreferences = [
      {
        identifier: 'research.example',
        kind: 'site',
        updatedAt: NOW.toISOString(),
        contextRules: [
          {
            contextType: 'objective',
            contextId: OBJECTIVE_ID,
            classification: 'useful',
            confidence: 90,
            source: 'user',
            reasons: ['Source utile pour cet objectif.'],
            updatedAt: NOW.toISOString(),
          },
        ],
      },
      {
        identifier: 'noise.example',
        kind: 'site',
        updatedAt: NOW.toISOString(),
        contextRules: [
          {
            contextType: 'objective',
            contextId: OBJECTIVE_ID,
            classification: 'distraction',
            confidence: 80,
            source: 'usage',
            reasons: ['Distraction observée pour ce domaine.'],
            updatedAt: NOW.toISOString(),
          },
        ],
      },
    ]

    const model = buildObjectiveModelV2({
      objective: objective(),
      linkedTasks: [task()],
      userModel,
      registry: [registryItem()],
      now: NOW,
    })

    expect(model.mission.declaredImportance).toBe('central')
    expect(model.protection.usefulSites).toContain('research.example')
    expect(model.protection.distractingSites).toContain('noise.example')
    expect(model.protection.usefulApps).toContain('editor.exe')
  })

  it('résume les minutes investies depuis les sessions liées', () => {
    const model = buildObjectiveModelV2({
      objective: objective(),
      linkedTasks: [task({ remainingMinutes: 60 })],
      sessions: [
        {
          objectiveId: OBJECTIVE_ID,
          startedAt: '2026-06-24T09:00:00.000Z',
          endedAt: '2026-06-24T10:00:00.000Z',
          durationMinutes: 60,
        },
      ],
      now: NOW,
    })

    expect(model.progress.investedMinutesToday).toBe(60)
    expect(model.progress.investedMinutesThisWeek).toBe(60)
    expect(model.progress.progressPercent).toBeGreaterThan(50)
  })

  it('expose des flags propres et dangereux désactivés par défaut', () => {
    expect(DEFAULT_OBJECTIVE_MODEL_V2_FLAGS.objectiveModelV2Enabled).toBe(true)
    expect(DEFAULT_OBJECTIVE_MODEL_V2_FLAGS.objectiveControlsDisplay).toBe(true)
    expect(DEFAULT_OBJECTIVE_MODEL_V2_FLAGS.objectiveControlsPlanning).toBe(false)
    expect(DEFAULT_OBJECTIVE_MODEL_V2_FLAGS.objectiveControlsBlocking).toBe(false)
  })

  it('construit les dix sous-objets sans modifier les entrées', () => {
    const sourceObjective = objective()
    const sourceTask = task()
    const before = JSON.stringify({ sourceObjective, sourceTask })
    const model = buildObjectiveModelV2({ objective: sourceObjective, linkedTasks: [sourceTask], now: NOW })
    expect(new Set(Object.keys(model))).toEqual(new Set(['identity','mission','status','progress','risk','protection','nextAction','linkedTasks','explanation','metadata']))
    expect(JSON.stringify({ sourceObjective, sourceTask })).toBe(before)
    expect(model.identity.objectiveId).toBe(OBJECTIVE_ID)
    expect(model.metadata.debug).toBeDefined()
  })

  it('utilise le nombre de tâches quand aucune estimation explicite n’est disponible', () => {
    const model = buildObjectiveModelV2({
      objective: objective(),
      linkedTasks: [task({ status: 'completed', estimatedMinutes: undefined, remainingMinutes: undefined }), task({ id: '44444444-4444-4444-8444-444444444444', estimatedMinutes: undefined, remainingMinutes: undefined })],
      now: NOW,
    })
    expect(model.progress.progressPercent).toBeGreaterThan(0)
    expect(model.progress.completedTaskCount).toBe(1)
  })

  it('compte une session liée par tâche et détecte la stagnation', () => {
    const recent = buildObjectiveModelV2({ objective: objective(), linkedTasks: [task()], sessions: [{ taskId: TASK_ID, endedAt: '2026-06-24T10:00:00.000Z', durationMinutes: 45 }], now: NOW })
    const stalled = buildObjectiveModelV2({ objective: objective({ createdAt: '2026-05-01T00:00:00.000Z' }), linkedTasks: [task()], now: NOW })
    expect(recent.progress.investedMinutesThisWeek).toBe(45)
    expect(stalled.risk.stagnationScore).toBeGreaterThanOrEqual(65)
    expect(stalled.nextAction.suggestedActionType).toBe('recover_stagnation')
  })

  it('explique une deadline proche avec le vrai travail restant', () => {
    const model = buildObjectiveModelV2({ objective: objective(), linkedTasks: [task({ deadline: '2026-06-24', remainingMinutes: 240 })], now: NOW })
    expect(model.risk.deadlineRiskScore).toBeGreaterThanOrEqual(80)
    expect(model.risk.reasons.length).toBeGreaterThan(0)
    expect(model.explanation.reasons.some((reason) => reason.includes('4.0 h'))).toBe(true)
  })

  it('reste valable sans UserModel et produit toujours des raisons', () => {
    const model = buildObjectiveModelV2({ objective: objective({ description: undefined }), linkedTasks: [], userModel: null, now: NOW })
    expect(model.mission.confidence).toBeLessThanOrEqual(70)
    expect(model.mission.reasons.length).toBeGreaterThan(0)
    expect(model.risk.reasons.length).toBeGreaterThan(0)
    expect(model.protection.reasons.length).toBeGreaterThan(0)
  })
})
