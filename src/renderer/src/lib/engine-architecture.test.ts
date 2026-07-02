import { describe, expect, it } from 'vitest'
import { DEFAULT_ENGINE_FLAGS } from '@shared/engine-flags'
import { appendDecisionLogEntry } from '@shared/decision-log'
import type { DecisionLogEntry } from '@shared/engine-results'
import { buildProtectionResult } from '@shared/protection-result'
import type { Objective, RegistryItem, Task } from '@shared/schemas'
import { explainAppAccess } from './access-explanation'
import { runEngineDiagnostics } from './engine-diagnostics'
import { buildLearningUpdateFromEvent } from './learning-engine'
import { buildObjectiveStatus } from './objective-intelligence'
import type { PlacedBlock } from './placement-engine'
import { buildPlacementResult } from './placement-explanation'
import { buildSessionPlanFromBlock } from './session-plan-engine'
import { buildTaskStatus } from './task-intelligence'

function task(over: Partial<Task> = {}): Task {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Coder le moteur de décision',
    linkedObjectiveId: '22222222-2222-4222-8222-222222222222',
    deadline: '2026-06-25',
    deadlineImpact: 'hard',
    complexity: 'extreme',
    estimatedMinutes: 360,
    remainingMinutes: 300,
    level: 8,
    status: 'active',
    blocking: {
      enabled: true,
      mode: 'allowlist',
      sites: ['docs.example'],
      processes: ['code.exe'],
      networkApps: [],
      unlockPolicy: { type: 'cooldown', minutes: 5 },
    },
    createdAt: '2026-06-01T12:00:00.000Z',
    ...over,
  }
}

function objective(over: Partial<Objective> = {}): Objective {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Finir Vethos',
    description: 'Construire une application de discipline personnelle',
    color: '#22c55e',
    linkedRuleIds: [],
    level: 7,
    status: 'active',
    createdAt: '2026-06-01T12:00:00.000Z',
    ...over,
  }
}

function block(over: Partial<PlacedBlock> = {}): PlacedBlock {
  return {
    id: 'block-1',
    date: '2026-06-24',
    startMinute: 9 * 60,
    endMinute: 10 * 60,
    kind: 'task',
    refKind: 'task',
    refId: '11111111-1111-4111-8111-111111111111',
    label: 'Coder le moteur',
    locked: true,
    linkedTaskId: null,
    linkedTaskIds: [],
    ...over,
  }
}

function registryItem(over: Partial<RegistryItem> = {}): RegistryItem {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    kind: 'app',
    identifier: 'code.exe',
    executableName: 'code.exe',
    displayName: 'Code',
    usageCount: 0,
    lastSeenAt: '2026-06-24T12:00:00.000Z',
    classified: true,
    demoted: false,
    usefulFor: {
      objectives: ['22222222-2222-4222-8222-222222222222'],
      standaloneTasks: [],
    },
    createdAt: '2026-06-24T12:00:00.000Z',
    ...over,
  }
}

describe('engine architecture', () => {
  it('explique un placement existant sans changer le bloc', () => {
    const placement = buildPlacementResult(block(), task(), objective())

    expect(placement.debug?.blockKind).toBe('task')
    expect(placement.durationMinutes).toBe(60)
    expect(placement.reasons.length).toBeGreaterThan(0)
  })

  it('prépare un SessionPlan inactif sans remplacer le resolver', () => {
    const plan = buildSessionPlanFromBlock(block(), task(), objective(), [registryItem()], {
      strictBlocking: true,
    })

    expect(plan.debug?.currentResolverStillControlsBlocking).toBe(true)
    expect(plan.mode).toBe('allowlist')
    expect(plan.allowedApps).toContain('code.exe')
    expect(plan.allowedSites).toContain('docs.example')
    expect(plan.protectionLevel).toBeGreaterThanOrEqual(80)
  })

  it('remplace une allowlist vide par une blocklist sûre', () => {
    const emptyAllowlistTask = task({
      blocking: {
        enabled: true,
        mode: 'allowlist',
        sites: [],
        processes: [],
        networkApps: [],
        unlockPolicy: { type: 'cooldown', minutes: 5 },
      },
    })

    const plan = buildSessionPlanFromBlock(block(), emptyAllowlistTask, objective(), [], {
      engineV2Blocking: true,
    })

    expect(plan.mode).toBe('blocklist')
    expect(plan.allowedApps).toEqual([])
    expect(plan.allowedSites).toEqual([])
    expect(plan.debug?.allowlistFallbackApplied).toBe(true)
    expect(plan.reasons).toContain(
      'Allowlist refusée : aucun outil utile connu. Repli sûr vers le blocage ciblé.',
    )
  })

  it('audite les couches de protection appliquées', () => {
    const result = buildProtectionResult(
      { id: 'session-1' },
      ['overlay', 'media_control'],
      [{ layer: 'hosts', message: 'hosts non appliqué pendant le test.' }],
      { blockedApps: ['spotify.exe'], blockedSites: ['instagram.com'] },
    )

    expect(result.applied).toBe(false)
    expect(result.appliedLayers).toContain('overlay')
    expect(result.failedLayers).toContain('hosts')
    expect(result.blockedApps).toContain('spotify.exe')
  })

  it('produit des signaux d’apprentissage sans les appliquer', () => {
    const update = buildLearningUpdateFromEvent({
      kind: 'session_completed',
      targetType: 'task',
      targetId: '11111111-1111-4111-8111-111111111111',
      plannedMinutes: 120,
      actualMinutes: 60,
      createdAt: '2026-06-24T12:00:00.000Z',
    })

    expect(update.debug?.appliedToStoredData).toBe(false)
    expect(update.taskEstimateAdjustment).toBeLessThan(0)
    expect(update.reasons.length).toBeGreaterThan(0)
  })

  it('calcule un statut objectif et un statut tâche lisibles', () => {
    const status = buildObjectiveStatus(objective(), [task()], [], new Date('2026-06-24T12:00:00.000Z'))
    const taskStatus = buildTaskStatus(task(), objective())

    expect(status.objectiveId).toBe('22222222-2222-4222-8222-222222222222')
    expect(status.remainingLinkedWorkMinutes).toBe(300)
    expect(taskStatus.mentalLoadLabel).toBe('extreme')
    expect(taskStatus.recommendedSessionLength).toBeLessThanOrEqual(120)
  })

  it('explique pourquoi une app est autorisée ou bloquée', () => {
    const plan = buildSessionPlanFromBlock(block(), task(), objective(), [registryItem()])
    const allowed = explainAppAccess(registryItem(), plan, task(), objective())
    const blocked = explainAppAccess('discord.exe', plan, task(), objective())

    expect(allowed.access).toBe('allowed')
    expect(blocked.access).toBe('blocked')
    expect(blocked.reasons.join(' ')).toContain('outils nécessaires')
  })

  it('garde les flags dangereux désactivés par défaut', () => {
    expect(DEFAULT_ENGINE_FLAGS.priorityResultEnabled).toBe(true)
    // Stratégie hybride : les moteurs V2 sont désormais actifs (V1 reste fallback).
    expect(DEFAULT_ENGINE_FLAGS.newPriorityControlsPlacement).toBe(true)
    expect(DEFAULT_ENGINE_FLAGS.newSessionPlanControlsBlocking).toBe(true)
  })

  it('nettoie et limite l’historique de décisions', () => {
    const entry: DecisionLogEntry = {
      id: 'log-1',
      createdAt: '2026-06-24T12:00:00.000Z',
      type: 'blocking',
      targetType: 'site',
      targetId: 'www.instagram.com/reels/123?tracking=secret',
      debug: {
        rawUrl: 'https://instagram.com/reels/123?tracking=secret',
        bareUrl: 'instagram.com/reels/456?tracking=secret',
      },
    }

    const result = appendDecisionLogEntry([], entry, 1)

    expect(result).toHaveLength(1)
    expect(result[0]?.targetId).toBe('instagram.com')
    expect(result[0]?.debug?.rawUrl).toBe('instagram.com')
    expect(result[0]?.debug?.bareUrl).toBe('instagram.com')
  })

  it('lance des diagnostics globaux', () => {
    const diagnostics = runEngineDiagnostics([task()], [objective()], [block()], [registryItem()])

    expect(diagnostics.analyzedTasks).toBe(1)
    expect(diagnostics.analyzedObjectives).toBe(1)
    expect(diagnostics.analyzedBlocks).toBe(1)
    expect(diagnostics.priorityDifferences).toHaveLength(1)
  })
})
