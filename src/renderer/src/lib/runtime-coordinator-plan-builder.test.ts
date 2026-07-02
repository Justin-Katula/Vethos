import { describe, it, expect } from 'vitest'
import { buildRuntimeCoordinatorPlanV2 } from './runtime-coordinator-plan-builder'
import type { SessionPlanV2 } from '@shared/session-model'

describe('runtime-coordinator-plan-builder', () => {
  it('should build a full shadow plan without invoking any side effects', () => {
    const mockSessionPlan: SessionPlanV2 = {
      id: 'test-session',
      objective: {
        id: 'test-obj',
        title: 'Test',
        description: '',
        status: 'pending',
        type: 'work',
        priority: 1,
        timeRequirement: { type: 'open' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      preflight: {
        status: 'ready',
        diagnostics: { status: 'healthy', issues: [], summary: [] },
        checks: [],
        warnings: [],
        confidence: 1,
      },
      timing: {
        recommendedDurationMinutes: 60,
        bufferMinutes: 10,
        expectedStartTimerAt: new Date().toISOString(),
        expectedEndTimerAt: new Date().toISOString(),
        mode: 'fixed',
        type: 'standard',
        reasons: [],
        warnings: [],
        confidence: 1,
      },
      protection: {
        mode: 'blocklist',
        protectionLevel: 'standard',
        usefulApps: [],
        blockedApps: ['discord.exe'],
        conditionalApps: [],
        usefulSites: [],
        blockedSites: ['youtube.com'],
        conditionalSites: [],
        unlockPolicy: { type: 'none' },
        reasons: [],
        warnings: [],
        confidence: 1,
      },
      lifecycle: {
        type: 'strict',
        canPause: false,
        canEndEarly: true,
        reasons: [],
        warnings: [],
        confidence: 1,
      },
      interruption: {
        allowed: true,
        maxDurationMinutes: 5,
        type: 'short_breaks',
        reasons: [],
        warnings: [],
        confidence: 1,
      },
      closure: {
        required: true,
        validation: 'strict',
        type: 'manual',
        reasons: [],
        warnings: [],
        confidence: 1,
      },
      contract: {
        id: 'c1',
        title: 'C',
        userId: 'u1',
        createdAt: '',
        updatedAt: '',
        terms: [],
        commitments: [],
        completionPolicy: 'manual',
        penalties: [],
        rewards: [],
        reasons: [],
        warnings: [],
        confidence: 1,
      },
      integrity: {
        expectedChecks: [],
        thresholds: { maxDistractions: 3, maxPauseMinutes: 5 },
        reasons: [],
        warnings: [],
        confidence: 1,
      },
      outcome: {
        expectedDeliverables: [],
        successCriteria: [],
        type: 'binary',
        reasons: [],
        warnings: [],
        confidence: 1,
      },
      explanation: { title: 'T', summary: 'S', reasons: [], warnings: [] },
      confidence: 1,
      metadata: { modelVersion: 1, generatedAt: '', source: 'engine' },
    }

    const plan = buildRuntimeCoordinatorPlanV2({
      userId: 'test-user',
      sessionPlan: mockSessionPlan,
      now: '2026-06-26T00:00:00Z',
      idFactory: () => 'test-id',
    })

    expect(plan.id).toBe('test-id')
    expect(plan.userId).toBe('test-user')
    expect(plan.sessionPlanId).toBe('test-session')
    
    // Ensure safety
    expect(plan.blockingProfileDraft.overlayBehavior.shouldAvoidKillProcess).toBe(true)
    expect(plan.closureBridgePlan.shouldApplyOutcomeToTaskStoreNow).toBe(false)
    
    // Ensure diagnostics were generated
    expect(plan.diagnostics).toBeDefined()
    expect(plan.diagnostics?.status).toBe('healthy')
  })

  it('should mark mode as unsafe if safety check is critical', () => {
    const mockSessionPlan: SessionPlanV2 = {
      // Minimal stub that has vethos.exe in blocklist
      id: 'test-session',
      protection: {
        mode: 'blocklist',
        protectionLevel: 'standard',
        usefulApps: [],
        blockedApps: ['vethos.exe'],
        conditionalApps: [],
        usefulSites: [],
        blockedSites: [],
        conditionalSites: [],
        unlockPolicy: { type: 'none' },
        reasons: [],
        warnings: [],
        confidence: 1,
      },
      integrity: { thresholds: {} },
      closure: { required: false, type: 'auto' },
      contract: { completionPolicy: 'manual' },
    } as unknown as SessionPlanV2

    const plan = buildRuntimeCoordinatorPlanV2({
      userId: 'test-user',
      sessionPlan: mockSessionPlan,
      now: '2026-06-26T00:00:00Z',
      idFactory: () => 'test-id',
    })

    expect(plan.mode).toBe('unsafe')
    expect(plan.safety.status).toBe('critical')
  })
})
