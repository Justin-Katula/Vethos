import { describe, expect, it } from 'vitest'
import type { DeadlineAvailabilityResult } from '@shared/planning-time-model'
import type { PlanningContextV2 } from '@shared/planning-time-model'
import { buildDeadlineCrisisContext } from './deadline-crisis-context-engine'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A minimal empty PlanningContextV2 (the crisis engine does not use it directly). */
function emptyContext(): PlanningContextV2 {
  return {
    userId: 'user',
    dateRange: { startDate: '2026-06-22', endDate: '2026-06-28' },
    days: [],
    weeklySummary: {
      rawFreeMinutes: 0,
      usableFreeMinutes: 0,
      deepWorkMinutes: 0,
      recoveryMinutes: 0,
      overloadedDays: 0,
      noUsableTimeDays: 0,
    },
    rulesApplied: [],
    confidence: 70,
    metadata: {
      modelVersion: 2,
      createdAt: '2026-06-22T00:00:00.000Z',
      updatedAt: '2026-06-22T00:00:00.000Z',
      source: 'shadow_planning_context',
    },
  }
}

function availability(overrides: Partial<DeadlineAvailabilityResult> = {}): DeadlineAvailabilityResult {
  return {
    deadline: '2026-06-25T23:59:00.000',
    minutesUntilDeadline: 3 * 24 * 60, // 3 days
    rawFreeMinutesBeforeDeadline: 600,
    usableFreeMinutesBeforeDeadline: 360,
    deepWorkMinutesBeforeDeadline: 240,
    matchingWindowMinutesBeforeDeadline: 180,
    status: 'enough_time',
    reasons: ['Enough time.'],
    confidence: 80,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('deadline-crisis-context-engine', () => {
  // -------------------------------------------------------------------------
  // Test: no deadline -> no crisis
  // -------------------------------------------------------------------------

  it('retourne crisisLevel none et normal_plan quand aucune deadline n\'est definie', () => {
    const result = buildDeadlineCrisisContext({
      targetType: 'task',
      targetId: 'task-1',
      deadlineAvailability: availability(),
      planningContext: emptyContext(),
      requiredIdealMinutes: 120,
    })

    expect(result.crisisLevel).toBe('none')
    expect(result.recommendedMode).toBe('normal_plan')
    expect(result.feasibilityRatio).toBe(0)
    expect(result.shouldProtectSleep).toBe(false)
  })

  // -------------------------------------------------------------------------
  // Test: deadline lointaine + assez de temps -> none/watch
  // -------------------------------------------------------------------------

  it('retourne crisisLevel none ou watch quand la deadline est lointaine et le temps est suffisant', () => {
    const now = new Date('2026-06-22T08:00:00.000Z')
    const result = buildDeadlineCrisisContext({
      targetType: 'task',
      targetId: 'task-2',
      deadline: '2026-07-22T23:59:00.000Z', // 30 days from now
      progressPercent: 40,
      requiredIdealMinutes: 180,
      deadlineAvailability: availability({
        usableFreeMinutesBeforeDeadline: 1200,
        deepWorkMinutesBeforeDeadline: 600,
        matchingWindowMinutesBeforeDeadline: 800,
      }),
      planningContext: emptyContext(),
      now,
    })

    expect(['none', 'watch']).toContain(result.crisisLevel)
    expect(['normal_plan', 'intensive_plan']).toContain(result.recommendedMode)
    expect(result.feasibilityRatio).toBeLessThanOrEqual(0.75)
  })

  // -------------------------------------------------------------------------
  // Test: deadline proche + assez de temps -> tight/intensive
  // -------------------------------------------------------------------------

  it('retourne crisisLevel tight et intensive_plan quand la deadline est proche mais le temps est suffisant', () => {
    const now = new Date('2026-06-22T08:00:00.000Z')
    const result = buildDeadlineCrisisContext({
      targetType: 'task',
      targetId: 'task-3',
      deadline: '2026-06-24T08:00:00.000Z', // 2 days, within DEADLINE_SOON_HOURS
      progressPercent: 30,
      requiredIdealMinutes: 240,
      deadlineAvailability: availability({
        minutesUntilDeadline: 2 * 24 * 60,
        usableFreeMinutesBeforeDeadline: 280, // slightly above ideal
        deepWorkMinutesBeforeDeadline: 200,
        matchingWindowMinutesBeforeDeadline: 200,
      }),
      planningContext: emptyContext(),
      now,
    })

    // ratio = 240 / 280 ~= 0.857 -> tight
    expect(result.crisisLevel).toBe('tight')
    expect(result.recommendedMode).toBe('intensive_plan')
  })

  // -------------------------------------------------------------------------
  // Test: deadline proche, progression 0, temps insuffisant -> critical/rescue
  // -------------------------------------------------------------------------

  it('retourne critical ou rescue quand progression est nulle et le temps est insuffisant', () => {
    const now = new Date('2026-06-22T08:00:00.000Z')
    const result = buildDeadlineCrisisContext({
      targetType: 'task',
      targetId: 'task-4',
      deadline: '2026-06-23T08:00:00.000Z', // ~24h
      progressPercent: 0,
      requiredIdealMinutes: 840, // 14h ideal
      deadlineAvailability: availability({
        minutesUntilDeadline: 24 * 60,
        usableFreeMinutesBeforeDeadline: 480, // 8h usable
        deepWorkMinutesBeforeDeadline: 300,
        matchingWindowMinutesBeforeDeadline: 300,
      }),
      planningContext: emptyContext(),
      now,
    })

    // ratio = 840 / 480 = 1.75 -> impossible_full_completion by ratio,
    // but progress=0 + soon also escalates. Either critical/rescue/impossible.
    expect(['critical', 'rescue_required', 'impossible_full_completion']).toContain(result.crisisLevel)
    // When minimum viable is also not achievable, engine may return manual_review.
    expect(['rescue_plan', 'minimum_viable_plan', 'manual_review']).toContain(result.recommendedMode)
  })

  // -------------------------------------------------------------------------
  // Test: requiredIdeal impossible but minimum viable possible -> minimum_viable_plan
  // -------------------------------------------------------------------------

  it('recommande minimum_viable_plan quand ideal est impossible mais minimum est atteignable', () => {
    const now = new Date('2026-06-22T08:00:00.000Z')
    const result = buildDeadlineCrisisContext({
      targetType: 'task',
      targetId: 'task-5',
      deadline: '2026-06-23T23:59:00.000Z',
      progressPercent: 10,
      requiredIdealMinutes: 600, // 10h - impossible
      requiredMinimumMinutes: 180, // 3h - possible
      deadlineAvailability: availability({
        minutesUntilDeadline: 36 * 60,
        usableFreeMinutesBeforeDeadline: 250, // can do 180, not 600
        deepWorkMinutesBeforeDeadline: 150,
        matchingWindowMinutesBeforeDeadline: 200,
      }),
      planningContext: emptyContext(),
      now,
    })

    expect(result.recommendedMode).toBe('minimum_viable_plan')
    expect(['minimum_pass_strategy', 'prioritize_high_yield']).toContain(result.recommendedStrategy.strategyType)
  })

  // -------------------------------------------------------------------------
  // Test: usableFreeMinutes = 0 -> impossible_full_completion + no Infinity
  // -------------------------------------------------------------------------

  it('retourne feasibilityRatio 999 (pas Infinity) quand aucun temps utilisable', () => {
    const now = new Date('2026-06-22T08:00:00.000Z')
    const result = buildDeadlineCrisisContext({
      targetType: 'task',
      targetId: 'task-6',
      deadline: '2026-06-24T23:59:00.000Z',
      progressPercent: 0,
      requiredIdealMinutes: 300,
      deadlineAvailability: availability({
        minutesUntilDeadline: 2 * 24 * 60,
        rawFreeMinutesBeforeDeadline: 0,
        usableFreeMinutesBeforeDeadline: 0,
        deepWorkMinutesBeforeDeadline: 0,
        matchingWindowMinutesBeforeDeadline: 0,
        status: 'impossible',
      }),
      planningContext: emptyContext(),
      now,
    })

    expect(result.crisisLevel).toBe('impossible_full_completion')
    // MAX_FEASIBILITY_RATIO = 999, never Infinity
    expect(result.feasibilityRatio).toBe(999)
    expect(Number.isFinite(result.feasibilityRatio)).toBe(true)
    expect(result.feasibilityRatio).not.toBe(Infinity)
    expect(result.warnings.some((w) => w.includes('usableFreeMinutesBeforeDeadline is 0'))).toBe(true)
  })

  // -------------------------------------------------------------------------
  // Test: sommeil menace -> shouldProtectSleep true
  // -------------------------------------------------------------------------

  it('active shouldProtectSleep quand le travail ideal ne peut pas s\'accomplir sans sacrifier le sommeil', () => {
    const now = new Date('2026-06-22T08:00:00.000Z')
    const result = buildDeadlineCrisisContext({
      targetType: 'task',
      targetId: 'task-7',
      deadline: '2026-06-24T08:00:00.000Z',
      progressPercent: 5,
      requiredIdealMinutes: 720, // 12h ideal
      deadlineAvailability: availability({
        minutesUntilDeadline: 2 * 24 * 60,
        // Raw free covers ideal (720+), but most is sleep/recovery
        rawFreeMinutesBeforeDeadline: 800,
        usableFreeMinutesBeforeDeadline: 300, // only 5h truly usable
        deepWorkMinutesBeforeDeadline: 180,
        matchingWindowMinutesBeforeDeadline: 250,
      }),
      planningContext: emptyContext(),
      now,
    })

    expect(result.shouldProtectSleep).toBe(true)
    expect(result.minimumSleepWarning).toBeTruthy()
  })

  // -------------------------------------------------------------------------
  // Test: donnees manquantes -> manual_review ou confidence basse
  // -------------------------------------------------------------------------

  it('retourne manual_review ou confidence basse quand les estimations manquent', () => {
    const now = new Date('2026-06-22T08:00:00.000Z')
    const result = buildDeadlineCrisisContext({
      targetType: 'objective',
      targetId: 'obj-1',
      deadline: '2026-06-24T23:59:00.000Z',
      // No progressPercent, no requiredIdealMinutes, no remainingMinutes
      deadlineAvailability: availability({
        minutesUntilDeadline: 2 * 24 * 60,
        usableFreeMinutesBeforeDeadline: 200,
      }),
      planningContext: emptyContext(),
      now,
    })

    const isManualReview = result.recommendedMode === 'manual_review'
    const isLowConfidence = result.confidence <= 50
    expect(isManualReview || isLowConfidence).toBe(true)
  })

  // -------------------------------------------------------------------------
  // Test: practice signals -> practice_first strategy
  // -------------------------------------------------------------------------

  it('choisit practice_first quand des signaux de type pratique sont presents', () => {
    const now = new Date('2026-06-22T08:00:00.000Z')
    const result = buildDeadlineCrisisContext({
      targetType: 'task',
      targetId: 'task-practice',
      deadline: '2026-06-24T23:59:00.000Z',
      progressPercent: 20,
      requiredIdealMinutes: 180,
      taskTypeSignals: ['quiz', 'active_recall'],
      deadlineAvailability: availability({
        minutesUntilDeadline: 2 * 24 * 60,
        usableFreeMinutesBeforeDeadline: 400,
      }),
      planningContext: emptyContext(),
      now,
    })

    expect(result.recommendedStrategy.strategyType).toBe('practice_first')
  })

  // -------------------------------------------------------------------------
  // Test: overdue with remaining work -> critical + manual_review
  // -------------------------------------------------------------------------

  it('retourne critical et manual_review quand la deadline est depassee et du travail reste', () => {
    const now = new Date('2026-06-25T08:00:00.000Z')
    const result = buildDeadlineCrisisContext({
      targetType: 'task',
      targetId: 'task-overdue',
      deadline: '2026-06-22T23:59:00.000Z', // in the past
      progressPercent: 50,
      remainingMinutes: 120,
      requiredIdealMinutes: 240,
      deadlineAvailability: availability({
        minutesUntilDeadline: -2 * 24 * 60, // negative = overdue
        status: 'overdue',
        rawFreeMinutesBeforeDeadline: 0,
        usableFreeMinutesBeforeDeadline: 0,
      }),
      planningContext: emptyContext(),
      now,
    })

    expect(result.crisisLevel).toBe('critical')
    expect(result.recommendedMode).toBe('manual_review')
    expect(result.warnings.some((w) => w.toLowerCase().includes('deadline'))).toBe(true)
  })

  // -------------------------------------------------------------------------
  // Test: shadow — output is a plain serialisable object
  // -------------------------------------------------------------------------

  it('retourne un objet serialisable sans valeurs interdites (pas Infinity, pas NaN)', () => {
    const now = new Date('2026-06-22T08:00:00.000Z')
    const result = buildDeadlineCrisisContext({
      targetType: 'task',
      targetId: 'task-serial',
      deadline: '2026-06-25T23:59:00.000Z',
      progressPercent: 0,
      requiredIdealMinutes: 500,
      deadlineAvailability: availability({
        minutesUntilDeadline: 3 * 24 * 60,
        usableFreeMinutesBeforeDeadline: 0,
      }),
      planningContext: emptyContext(),
      now,
    })

    const serialised = JSON.stringify(result)
    expect(serialised).toBeTruthy()
    expect(serialised).not.toContain('Infinity')
    expect(serialised).not.toContain('NaN')
    expect(result.feasibilityRatio).not.toBe(Infinity)
    expect(Number.isFinite(result.feasibilityRatio)).toBe(true)
  })

  // -------------------------------------------------------------------------
  // Test: all required fields always present
  // -------------------------------------------------------------------------

  it('retourne toujours tous les champs obligatoires quel que soit le cas', () => {
    const result = buildDeadlineCrisisContext({
      targetType: 'task',
      targetId: 'task-fields',
      deadlineAvailability: availability(),
      planningContext: emptyContext(),
    })

    expect(result.targetType).toBe('task')
    expect(result.targetId).toBe('task-fields')
    expect(typeof result.progressPercent).toBe('number')
    expect(typeof result.remainingMinutes).toBe('number')
    expect(typeof result.feasibilityRatio).toBe('number')
    expect(typeof result.shouldProtectSleep).toBe('boolean')
    expect(Array.isArray(result.warnings)).toBe(true)
    expect(Array.isArray(result.explanation)).toBe(true)
    expect(typeof result.confidence).toBe('number')
    expect(result.confidence).toBeGreaterThanOrEqual(0)
    expect(result.confidence).toBeLessThanOrEqual(100)
    expect(result.recommendedStrategy).toBeTruthy()
    expect(Array.isArray(result.recommendedStrategy.reasons)).toBe(true)
  })

  // -------------------------------------------------------------------------
  // Test: complete_everything when time is clearly sufficient and no signals
  // -------------------------------------------------------------------------

  it('recommande complete_everything quand le temps est largement suffisant et pas de signaux speciaux', () => {
    const now = new Date('2026-06-22T08:00:00.000Z')
    const result = buildDeadlineCrisisContext({
      targetType: 'task',
      targetId: 'task-easy',
      deadline: '2026-07-10T23:59:00.000Z', // very far
      progressPercent: 50,
      requiredIdealMinutes: 120,
      deadlineAvailability: availability({
        minutesUntilDeadline: 18 * 24 * 60,
        usableFreeMinutesBeforeDeadline: 1800, // way more than enough
        deepWorkMinutesBeforeDeadline: 900,
        matchingWindowMinutesBeforeDeadline: 1200,
      }),
      planningContext: emptyContext(),
      now,
    })

    expect(['complete_everything', 'practice_first']).toContain(result.recommendedStrategy.strategyType)
    expect(['none', 'watch']).toContain(result.crisisLevel)
  })
})
