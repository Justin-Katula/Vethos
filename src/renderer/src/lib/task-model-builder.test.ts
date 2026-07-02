import { describe, expect, it } from 'vitest'
import type { Objective, RegistryItem, Task } from '@shared/schemas'
import { buildEmptyUserModel } from '@shared/user-model'
import { DEFAULT_TASK_MODEL_V2_FLAGS } from '@shared/task-model'
import { buildObjectiveModelV2 } from './objective-model-builder'
import { buildTaskModelV2 } from './task-model-builder'

const NOW = new Date('2026-06-24T12:00:00.000Z')
const OBJECTIVE_ID = '22222222-2222-4222-8222-222222222222'
const TASK_ID = '11111111-1111-4111-8111-111111111111'

function objective(over: Partial<Objective> = {}): Objective {
  return {
    id: OBJECTIVE_ID,
    name: 'Finaliser un projet',
    description: 'Projet important à livrer',
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
    title: 'Écrire le rapport final',
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
      objectives: [],
      standaloneTasks: [TASK_ID],
    },
    createdAt: '2026-06-24T12:00:00.000Z',
    ...over,
  }
}

describe('task-model-builder orchestrator', () => {
  it('analyse une tâche liée à un objectif vivant', () => {
    const obj = objective()
    const t = task()
    const objectiveModel = buildObjectiveModelV2({ objective: obj, linkedTasks: [t], now: NOW })
    const model = buildTaskModelV2({
      task: t,
      objective: obj,
      objectiveModel,
      now: NOW,
      usableFreeMinutesBeforeDeadline: 120,
    })

    expect(model.metadata.source).toBe('task_model_builder')
    expect(model.metadata.flags.newTaskModelControlsBlocking).toBe(false)
    expect(model.purpose.objectiveName).toBe(obj.name)
    expect(model.urgency.deadlineRiskRatio).toBeGreaterThanOrEqual(1)
    expect(model.protection.currentBehaviorStillControlsBlocking).toBe(true)
    expect(model.completionVerification.verifiedCompleted).toBe(false)
    expect(model.lifecycle).toBeDefined()
  })

  it('expose le Completion Gate quand une demande de complétion est fournie', () => {
    const model = buildTaskModelV2({
      task: task(),
      objective: objective(),
      now: NOW,
      completionContract: {
        taskId: TASK_ID,
        outcomeKind: 'document',
        expectedOutcome: 'Le rapport final est rédigé.',
        acceptanceCriteria: ['rapport final', 'corrections terminées'],
      },
      completionClaim: {
        userClaimedCompleted: true,
        progressClaim: 'completed',
        summary: 'J’ai terminé le rapport final et les corrections.',
        claimedAt: NOW.toISOString(),
      },
      completionSessionEvidence: {
        sessionId: 'session-1',
        durationMinutes: 70,
        usefulActivityMinutes: 65,
        idleMinutes: 2,
        distractingAttempts: 0,
        unlockRequests: 0,
        endedNormally: true,
        strictMode: false,
      },
    })

    expect(model.completionVerification.userClaimedCompleted).toBe(true)
    expect(['accept_completion', 'require_review', 'accept_partial_progress']).toContain(
      model.completionVerification.decision,
    )
    expect(model.completionVerification.metadata.debug.currentTaskStatusStillControlsPersistence).toBe(true)
  })

  it('recommande de découper une tâche extrême au lieu de forcer une session énorme', () => {
    const model = buildTaskModelV2({
      task: task({
        complexity: 'extreme',
        estimatedMinutes: 900,
        remainingMinutes: 760,
      }),
      objective: objective(),
      now: NOW,
    })

    expect(model.workload.shouldBeSplit).toBe(true)
    expect(model.nextStep.kind).toBe('split_task')
    expect(model.session.maximumSafeSessionMinutes).toBeLessThanOrEqual(120)
  })

  it('propose de finir une tâche presque terminée', () => {
    const model = buildTaskModelV2({
      task: task({
        estimatedMinutes: 240,
        remainingMinutes: 20,
        complexity: 'normal',
      }),
      objective: objective(),
      now: NOW,
    })

    expect(model.progress.progressPercent).toBeGreaterThanOrEqual(90)
    expect(model.nextStep.kind).toBe('finish_task')
  })

  it('demande de clarifier une tâche trop vague', () => {
    const model = buildTaskModelV2({
      task: task({
        title: 'Faire',
        linkedObjectiveId: null,
        complexity: 'unknown',
        contextNotes: undefined,
        estimatedMinutes: undefined,
        remainingMinutes: undefined,
      }),
      objective: null,
      now: NOW,
    })

    expect(model.risk.ambiguityRiskScore).toBeGreaterThanOrEqual(70)
    expect(model.nextStep.kind).toBe('clarify_task')
  })

  it('reprend les apps/sites utiles depuis les préférences et le registre sans règle pré-enregistrée', () => {
    const userModel = buildEmptyUserModel('user-1', { now: NOW.toISOString() })
    userModel.appSitePreferences = [
      {
        identifier: 'docs.example',
        kind: 'site',
        contextRules: [
          {
            contextType: 'task',
            contextId: TASK_ID,
            classification: 'useful',
            confidence: 90,
            source: 'user',
            reasons: ['Nécessaire pour cette tâche.'],
            updatedAt: NOW.toISOString(),
          },
        ],
      },
      {
        identifier: 'feed.example',
        kind: 'site',
        contextRules: [
          {
            contextType: 'objective',
            contextId: OBJECTIVE_ID,
            classification: 'distraction',
            confidence: 80,
            source: 'usage',
            reasons: ['Distraction observée.'],
            updatedAt: NOW.toISOString(),
          },
        ],
      },
    ]

    const model = buildTaskModelV2({
      task: task(),
      objective: objective(),
      userModel,
      registry: [registryItem()],
      now: NOW,
    })

    expect(model.appSiteContext.usefulApps).toContain('editor.exe')
    expect(model.appSiteContext.usefulSites).toContain('docs.example')
    expect(model.appSiteContext.distractingSites).toContain('feed.example')
    expect(model.protection.usefulSites).toContain('docs.example')
  })

  it('expose des flags propres et dangereux désactivés par défaut', () => {
    expect(DEFAULT_TASK_MODEL_V2_FLAGS.newTaskModelControlsPlacement).toBe(false)
    expect(DEFAULT_TASK_MODEL_V2_FLAGS.newTaskModelControlsBlocking).toBe(false)
  })
})
