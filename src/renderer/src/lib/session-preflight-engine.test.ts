import { describe, expect, it } from 'vitest'
import { runSessionPreflight } from './session-preflight-engine'
import type { SessionInputData } from './session-input-adapter'
import type { SessionContract } from '@shared/session-model'

describe('session-preflight-engine', () => {
  const duringSession = new Date('2026-06-26T10:05:00').toISOString()
  const baseInputData: SessionInputData = {
    targetType: 'task',
    targetId: 't1',
    placementBlock: {
      id: 'b1',
      targetType: 'task',
      targetId: 't1',
      kind: 'work',
      title: 'T',
      date: '2026-06-26',
      start: '10:00',
      end: '11:00',
      durationMinutes: 60,
      sourceWindowId: 'win1',
      placementMode: 'normal',
      confidence: 100,
      locked: false,
      reasons: [],
      warnings: [],
    },
    warnings: [],
    confidence: 100
  }

  const baseContract: SessionContract = {
    targetType: 'task',
    targetId: 't1',
    purpose: 'Test',
    progressDefinition: 'time_on_task',
    completionPolicy: 'progress_review',
    completionCriteria: [],
    allowedToMarkTaskCompleted: true,
    requiresClosureReview: false,
    requiresStrictEvidence: false,
    reasons: [],
    confidence: 100,
  }

  it('is ready when data is normal', () => {
    const res = runSessionPreflight({
      contract: baseContract,
      inputData: { ...baseInputData, linkedTask: { id: 't1' } },
      now: duringSession,
    })
    expect(res.canStart).toBe(true)
    expect(res.readiness).toBe('ready')
  })

  it('blocks if task is missing', () => {
    const res = runSessionPreflight({
      contract: baseContract,
      inputData: { ...baseInputData, linkedTask: undefined },
      now: duringSession,
    })
    expect(res.canStart).toBe(false)
    expect(res.readiness).toBe('blocked_by_missing_data')
    expect(res.blockers[0]).toContain('introuvable')
  })

  it('blocks if task is unclear and mode is deep_work', () => {
    const res = runSessionPreflight({
      contract: { ...baseContract, completionPolicy: 'completion_gate' },
      inputData: {
        ...baseInputData,
        placementBlock: { ...baseInputData.placementBlock, placementMode: 'deep_work' },
        linkedTask: { id: 't1', isVague: true }
      },
      now: duringSession,
    })
    expect(res.canStart).toBe(false)
    expect(res.readiness).toBe('blocked_by_unclear_target')
    expect(res.requiredActions).toContain('clarify_task')
  })

  it('warns and requires action if session is in the future', () => {
    const res = runSessionPreflight({
      contract: baseContract,
      inputData: { ...baseInputData, linkedTask: { id: 't1' } },
      now: '2026-06-26T08:00:00.000Z' // Before the block
    })
    expect(res.canStart).toBe(true) // We don't hard block, UI handles disabled state
    expect(res.readiness).toBe('ready_with_warnings')
    expect(res.requiredActions).toContain('wait_for_planned_time')
  })

  it('low confidence requires manual review', () => {
    const res = runSessionPreflight({
      contract: { ...baseContract, confidence: 40 },
      inputData: { ...baseInputData, linkedTask: { id: 't1' } },
      now: duringSession,
    })
    expect(res.canStart).toBe(true)
    expect(res.readiness).toBe('ready_with_warnings')
    expect(res.requiredActions).toContain('manual_review')
  })

  it('blocks an empty strict allowlist and asks for useful apps', () => {
    const res = runSessionPreflight({
      contract: baseContract,
      inputData: { ...baseInputData, linkedTask: { id: 't1' } },
      protection: {
        mode: 'strict_allowlist', protectionLevel: 90, unlockPolicy: 'deny_during_strict_session',
        usefulApps: [], usefulSites: [], blockedApps: [], blockedSites: [], conditionalApps: [], conditionalSites: [],
        shouldUseOverlay: true, shouldMuteDistractingMedia: true, reasons: [], warnings: [], confidence: 80,
      },
      now: duringSession,
    })
    expect(res.canStart).toBe(false)
    expect(res.requiredActions).toContain('choose_apps')
    expect(res.readiness).toBe('manual_review_required')
  })
})
