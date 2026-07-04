import type { SessionPlanV2 } from '@shared/session-model'

export function sessionPlanFixture(): SessionPlanV2 {
  return {
    id: 'test-session', userId: 'test-user', targetType: 'task', targetId: 'task-1', linkedTaskId: 'task-1',
    title: 'Test session', mode: 'normal', date: '2026-06-26',
    plannedStart: '2026-06-26T10:00:00.000Z', plannedEnd: '2026-06-26T11:00:00.000Z',
    plannedDurationMinutes: 60, minimumUsefulMinutes: 20, maximumSafeMinutes: 120,
    contract: {
      targetType: 'task', targetId: 'task-1', purpose: 'Faire avancer le travail',
      progressDefinition: 'time_on_task', completionPolicy: 'session_only', completionCriteria: [],
      allowedToMarkTaskCompleted: false, requiresClosureReview: false, requiresStrictEvidence: false,
      reasons: [], confidence: 100,
    },
    preflight: { readiness: 'ready', canStart: true, blockers: [], warnings: [], requiredActions: [], confidence: 100 },
    protection: {
      mode: 'blocklist', protectionLevel: 50, unlockPolicy: 'cooldown',
      usefulApps: [], usefulSites: [], blockedApps: ['generic-distraction.exe'], blockedSites: ['distraction.invalid'],
      conditionalApps: [], conditionalSites: [], shouldUseOverlay: true,
      shouldMuteDistractingMedia: true, reasons: [], warnings: [], confidence: 100,
    },
    lifecycle: {
      initialState: 'planned', allowedTransitions: [], lateStartGraceMinutes: 5,
      earlyStopPenaltyMinutes: 5, allowPause: false, overtimePolicy: 'stop_at_end', reasons: [],
    },
    closure: {
      required: false, closurePromptType: 'simple', questions: [], allowedOutcomes: ['no_progress', 'partial_progress', 'confirmed_progress'],
      requiresSpecificAnswer: false, minimumSpecificityScore: 0, reasons: [],
    },
    explanation: { title: 'Test', summary: 'Test session', reasons: [], warnings: [] },
    confidence: 100,
    metadata: { modelVersion: 2, createdAt: '2026-06-26T00:00:00.000Z', updatedAt: '2026-06-26T00:00:00.000Z', source: 'session_engine' },
  }
}
