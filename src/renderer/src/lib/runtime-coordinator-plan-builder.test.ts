import { describe, it, expect } from 'vitest'
import { buildRuntimeCoordinatorPlanV2 } from './runtime-coordinator-plan-builder'
import type { SessionPlanV2 } from '@shared/session-model'

describe('runtime-coordinator-plan-builder', () => {
  it('should build a full shadow plan without invoking any side effects', () => {
    const mockSessionPlan: SessionPlanV2 = {
      id: 'test-session',
      userId: 'test-user',
      targetType: 'task' as const,
      targetId: 'test-task',
      title: 'Test',
      mode: 'normal' as const,
      date: '2026-06-26',
      plannedStart: new Date().toISOString(),
      plannedEnd: new Date().toISOString(),
      plannedDurationMinutes: 60,
      minimumUsefulMinutes: 10,
      maximumSafeMinutes: 120,
      preflight: {
        readiness: 'ready' as const,
        canStart: true,
        blockers: [],
        warnings: [],
        requiredActions: [],
        confidence: 1,
      },
      protection: {
        mode: 'blocklist' as const,
        protectionLevel: 80,
        usefulApps: [],
        blockedApps: ['discord.exe'],
        conditionalApps: [],
        usefulSites: [],
        blockedSites: ['youtube.com'],
        conditionalSites: [],
        unlockPolicy: 'none' as const,
        shouldUseOverlay: true,
        shouldMuteDistractingMedia: true,
        reasons: [],
        warnings: [],
        confidence: 1,
      },
      lifecycle: {
        initialState: 'ready_shadow' as const,
        allowedTransitions: [],
        lateStartGraceMinutes: 5,
        earlyStopPenaltyMinutes: 10,
        allowPause: false,
        overtimePolicy: 'stop_at_end' as const,
        reasons: [],
      },
      closure: {
        required: true,
        closurePromptType: 'completion_gate' as const,
        questions: [],
        allowedOutcomes: 'binary' as any,
        requiresSpecificAnswer: false,
        minimumSpecificityScore: 0,
        reasons: [],
      },
      contract: {
        targetType: 'task' as const,
        targetId: 'test-task',
        purpose: 'purpose',
        progressDefinition: 'time_on_task' as const,
        completionPolicy: 'completion_gate' as const,
        completionCriteria: [],
        allowedToMarkTaskCompleted: true,
        requiresClosureReview: false,
        requiresStrictEvidence: false,
        reasons: [],
        confidence: 1,
      },
      explanation: { title: 'T', summary: 'S', reasons: [], warnings: [] },
      confidence: 1,
      metadata: { modelVersion: 1, createdAt: '', updatedAt: '', source: 'session_engine' as const },
    } as unknown as SessionPlanV2

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
