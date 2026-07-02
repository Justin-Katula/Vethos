import { describe, expect, it } from 'vitest'
import type { Task } from '@shared/schemas'
import { addUserBehaviorEvent, buildEmptyUserModel } from '@shared/user-model'
import {
  createAppOpenedDuringSessionEvent,
  createSessionCompletedEvent,
  createSiteOpenedDuringSessionEvent,
  createTaskCreatedEvent,
  createUnlockRequestedEvent,
  createUserBehaviorEvent,
} from './user-event-collector'

function task(over: Partial<Task> = {}): Task {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Créer le UserModel',
    linkedObjectiveId: '22222222-2222-4222-8222-222222222222',
    deadline: '2026-06-25',
    deadlineImpact: 'hard',
    complexity: 'hard',
    estimatedMinutes: 120,
    remainingMinutes: 80,
    level: 7,
    status: 'active',
    createdAt: '2026-06-24T12:00:00.000Z',
    ...over,
  }
}

describe('user-event-collector', () => {
  it('crée un événement générique', () => {
    const event = createUserBehaviorEvent({
      id: 'event-1',
      type: 'task_started',
      targetType: 'task',
      targetId: 'task-1',
      createdAt: '2026-06-24T12:00:00.000Z',
    })

    expect(event.id).toBe('event-1')
    expect(event.type).toBe('task_started')
    expect(event.targetType).toBe('task')
    expect(event.targetId).toBe('task-1')
    expect(event.createdAt).toBe('2026-06-24T12:00:00.000Z')
  })

  it('crée une session complétée avec contexte et metadata', () => {
    const event = createSessionCompletedEvent(
      {
        id: 'session-1',
        taskId: 'task-1',
        objectiveId: 'objective-1',
        plannedMinutes: 60,
        actualMinutes: 58,
        protectionLevel: 80,
        endedAt: '2026-06-24T13:00:00.000Z',
      },
      { blockId: 'block-1' },
    )

    expect(event.type).toBe('session_completed')
    expect(event.targetType).toBe('session')
    expect(event.targetId).toBe('session-1')
    expect(event.context?.taskId).toBe('task-1')
    expect(event.context?.objectiveId).toBe('objective-1')
    expect(event.context?.blockId).toBe('block-1')
    expect(event.metadata?.plannedMinutes).toBe(60)
    expect(event.metadata?.actualMinutes).toBe(58)
  })

  it('crée un événement app ouverte pendant session', () => {
    const event = createAppOpenedDuringSessionEvent(
      { executableName: 'discord.exe', displayName: 'Discord' },
      { id: 'session-1' },
      { taskId: 'task-1', protectionMode: 'allowlist', classificationAtTime: 'blocked' },
    )

    expect(event.type).toBe('app_opened_during_session')
    expect(event.targetType).toBe('app')
    expect(event.targetId).toBe('discord.exe')
    expect(event.context?.sessionId).toBe('session-1')
    expect(event.metadata?.appName).toBe('Discord')
    expect(event.metadata?.protectionMode).toBe('allowlist')
  })

  it('nettoie les sites pour garder le domaine plutôt que l’URL complète', () => {
    const event = createSiteOpenedDuringSessionEvent(
      'https://www.youtube.com/watch?v=abc123&private=true',
      { id: 'session-1' },
      { objectiveId: 'objective-1', protectionMode: 'allowlist' },
    )

    expect(event.type).toBe('site_opened_during_session')
    expect(event.targetType).toBe('site')
    expect(event.targetId).toBe('youtube.com')
    expect(event.metadata?.domain).toBe('youtube.com')
    expect(JSON.stringify(event.metadata)).not.toContain('watch?v=')
  })

  it('crée un événement tâche créée avec metadata utile', () => {
    const event = createTaskCreatedEvent(task())

    expect(event.type).toBe('task_created')
    expect(event.targetType).toBe('task')
    expect(event.context?.objectiveId).toBe('22222222-2222-4222-8222-222222222222')
    expect(event.metadata?.estimatedMinutes).toBe(120)
    expect(event.metadata?.deadline).toBe('2026-06-25')
  })

  it('ne stocke pas le texte complet de justification dans unlock_requested', () => {
    const event = createUnlockRequestedEvent({
      id: 'request-1',
      targetType: 'site',
      targetId: 'https://instagram.com/reels/private',
      sessionId: 'session-1',
      explanation: 'Je veux juste regarder rapidement une vidéo',
      credibilityScore: 2,
    })

    expect(event.type).toBe('unlock_requested')
    expect(event.targetId).toBe('instagram.com')
    expect(event.metadata?.explanationLength).toBeGreaterThan(0)
    expect(JSON.stringify(event.metadata)).not.toContain('regarder rapidement')
  })

  it('s’ajoute au UserModel sans mutation et avec limite', () => {
    const base = buildEmptyUserModel('user-1', { now: '2026-06-24T12:00:00.000Z' })
    const first = addUserBehaviorEvent(
      base,
      createUserBehaviorEvent({ id: 'event-1', type: 'task_started', targetType: 'task', targetId: 'task-1' }),
      { eventLimit: 1 },
    )
    const second = addUserBehaviorEvent(
      first,
      createUserBehaviorEvent({ id: 'event-2', type: 'task_completed', targetType: 'task', targetId: 'task-1' }),
      { eventLimit: 1 },
    )

    expect(base.behaviorEvents).toHaveLength(0)
    expect(second.behaviorEvents).toHaveLength(1)
    expect(second.behaviorEvents[0]?.id).toBe('event-2')
  })
})
