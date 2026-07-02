import { describe, expect, it } from 'vitest'
import { buildSessionProtectionPlan } from './session-protection-plan-builder'
import type { SessionInputData } from './session-input-adapter'
import type { SessionContract } from '@shared/session-model'

describe('session-protection-plan-builder', () => {
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

  it('generates blocklist mode for normal tasks', () => {
    const res = buildSessionProtectionPlan({
      contract: baseContract,
      inputData: baseInputData
    })
    expect(res.mode).toBe('blocklist')
    expect(res.unlockPolicy).toBe('cooldown')
  })

  it('falls back safely when deep work has an empty allowlist', () => {
    const res = buildSessionProtectionPlan({
      contract: baseContract,
      inputData: { ...baseInputData, placementBlock: { ...baseInputData.placementBlock, placementMode: 'deep_work' } }
    })
    expect(res.mode).toBe('blocklist')
    expect(res.unlockPolicy).toBe('cooldown')
    expect(res.shouldUseOverlay).toBe(true)
    expect(res.warnings[0]).toContain('allowlist refusé')
  })

  it('falls back safely when a critical crisis has an empty strict allowlist', () => {
    const res = buildSessionProtectionPlan({
      contract: baseContract,
      inputData: { ...baseInputData, deadlineCrisisContext: { targetId: 't1', crisisLevel: 'critical', recommendedMode: 'rescue_plan' } }
    })
    expect(res.mode).toBe('blocklist')
    expect(res.unlockPolicy).toBe('cooldown')
    expect(res.warnings[0]).toContain('strict_allowlist refusé')
  })

  it('does not hardcode app names', () => {
    const res = buildSessionProtectionPlan({
      contract: baseContract,
      inputData: {
        ...baseInputData,
        linkedTask: { id: 't1', tags: ['dev'] }
      }
    })
    expect(res.usefulApps[0]).toBe('app_for_tag_dev')
  })
})
