import { describe, expect, it } from 'vitest'
import type { CompletionContract, CompletionSessionEvidence } from '@shared/completion-gate'
import { buildEmptyUserModel } from '@shared/user-model'
import type { Objective, Task } from '@shared/schemas'
import { buildCompletionGateResult } from './completion-gate-engine'

const NOW = new Date('2026-06-25T12:00:00.000Z')
const TASK_ID = '11111111-1111-4111-8111-111111111111'
const OBJECTIVE_ID = '22222222-2222-4222-8222-222222222222'

function task(over: Partial<Task> = {}): Task {
  return {
    id: TASK_ID,
    title: 'Créer le moteur de validation',
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

function contract(over: Partial<CompletionContract> = {}): CompletionContract {
  return {
    taskId: TASK_ID,
    outcomeKind: 'code',
    expectedOutcome: 'Le moteur de validation existe avec ses tests.',
    acceptanceCriteria: ['moteur de validation', 'tests ajoutés', 'mode shadow'],
    createdAt: NOW.toISOString(),
    ...over,
  }
}

function cleanSession(over: Partial<CompletionSessionEvidence> = {}): CompletionSessionEvidence {
  return {
    sessionId: 'session-1',
    durationMinutes: 75,
    plannedMinutes: 75,
    usefulActivityMinutes: 70,
    idleMinutes: 2,
    distractingAttempts: 0,
    unlockRequests: 0,
    earlyStop: false,
    endedNormally: true,
    strictMode: true,
    usefulAppsUsed: ['editor.exe'],
    ...over,
  }
}

describe('completion-gate-engine shadow mode', () => {
  it('refuse une complétion vague pendant une session suspecte', () => {
    const result = buildCompletionGateResult({
      task: task(),
      objective: objective(),
      objectiveImportanceScore: 95,
      contract: contract(),
      claim: {
        userClaimedCompleted: true,
        progressClaim: 'completed',
        summary: 'fini',
        claimedAt: NOW.toISOString(),
      },
      session: cleanSession({
        durationMinutes: 12,
        usefulActivityMinutes: 2,
        distractingAttempts: 3,
        unlockRequests: 2,
        earlyStop: true,
        endedNormally: false,
      }),
      now: NOW,
    })

    expect(result.verifiedCompleted).toBe(false)
    expect(result.decision).toBe('reject_completion')
    expect(result.verificationStatus).toBe('rejected_insufficient_evidence')
    expect(result.requiredEvidenceScore).toBeGreaterThanOrEqual(85)
    expect(result.verifiedProgressMinutes).toBeLessThan(10)
    expect(result.penalties.some((penalty) => penalty.kind === 'vague_claim')).toBe(true)
  })

  it('accepte une complétion quand le contrat, la réponse et la session sont cohérents', () => {
    const result = buildCompletionGateResult({
      task: task(),
      objective: objective(),
      objectiveImportanceScore: 90,
      contract: contract({ requiredEvidenceScoreOverride: 72 }),
      claim: {
        userClaimedCompleted: true,
        progressClaim: 'completed',
        summary: 'J’ai créé le moteur de validation, ajouté les tests et gardé le mode shadow.',
        claimedAt: NOW.toISOString(),
      },
      session: cleanSession(),
      now: NOW,
    })

    expect(result.verifiedCompleted).toBe(true)
    expect(result.decision).toBe('accept_completion')
    expect(result.verificationStatus).toBe('verified')
    expect(result.finalConfidence).toBeGreaterThanOrEqual(result.requiredEvidenceScore)
    expect(result.verifiedProgressMinutes).toBeGreaterThan(35)
  })

  it('crédite du progrès sans valider la tâche si l’utilisateur ne réclame pas la complétion', () => {
    const result = buildCompletionGateResult({
      task: task(),
      contract: contract(),
      claim: {
        userClaimedCompleted: false,
        progressClaim: 'much',
        summary: 'J’ai avancé le moteur et préparé une partie des tests.',
        claimedAt: NOW.toISOString(),
      },
      session: cleanSession({ strictMode: false }),
      now: NOW,
    })

    expect(result.verifiedCompleted).toBe(false)
    expect(result.decision).toBe('accept_progress')
    expect(result.verifiedProgressMinutes).toBeGreaterThan(20)
  })

  it('baisse le poids de confiance pendant une session stricte et après signaux faibles', () => {
    const userModel = buildEmptyUserModel('user-1', { now: NOW.toISOString() })
    userModel.behaviorEvents = [
      {
        id: 'event-1',
        type: 'unlock_requested',
        targetType: 'task',
        targetId: TASK_ID,
        createdAt: '2026-06-25T11:30:00.000Z',
      },
      {
        id: 'event-2',
        type: 'session_aborted',
        targetType: 'task',
        targetId: TASK_ID,
        createdAt: '2026-06-24T11:30:00.000Z',
      },
    ]

    const result = buildCompletionGateResult({
      task: task(),
      claim: {
        userClaimedCompleted: true,
        progressClaim: 'completed',
        summary: 'J’ai terminé la tâche.',
      },
      session: cleanSession({ strictMode: true }),
      userModel,
      now: NOW,
    })

    expect(result.userTrustWeight).toBeLessThanOrEqual(25)
  })

  it('reste explicite sur le fait qu’il ne lit pas le contenu privé', () => {
    const result = buildCompletionGateResult({
      task: task(),
      contract: contract(),
      claim: {
        userClaimedCompleted: true,
        progressClaim: 'completed',
        summary: 'J’ai créé le moteur et les tests.',
      },
      session: cleanSession(),
      now: NOW,
    })

    expect(result.metadata.shadowOnly).toBe(true)
    expect(result.metadata.debug.contentInspectionEnabled).toBe(false)
    expect(result.metadata.debug.fileReadingEnabled).toBe(false)
    expect(result.metadata.debug.pdfReadingEnabled).toBe(false)
    expect(result.metadata.debug.claimIsSignalNotTruth).toBe(true)
  })
})
