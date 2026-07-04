/**
 * deadline-crisis-context-engine.ts.
 *
 * Builds a DeadlineCrisisContext for a task or objective approaching a deadline.
 * This engine ONLY calculates a context snapshot. It does NOT:
 *   - place tasks
 *   - modify sessions
 *   - change blocking rules
 *   - update the real planning
 *   - modify any scores
 *
 * All output is for informational / advisory purposes and should be consumed
 * by display layers or the Point-7 placement engine, not applied directly.
 *
 * KEY DESIGN DECISIONS:
 * - feasibilityRatio is capped at MAX_FEASIBILITY_RATIO (999) — never Infinity.
 * - Missing estimates fall back to lower confidence and tend toward manual_review.
 * - Sleep is never counted as usable work time.
 * - Strategy selection is based on general task-type signals, not hardcoded examples.
 */

import type { DeadlineAvailabilityResult, DeadlineCrisisContext } from '@shared/planning-time-model'
import type { PlanningContextV2 } from '@shared/planning-time-model'

// ---------------------------------------------------------------------------
// Configurable constants — adjust here, not scattered across the engine.
// ---------------------------------------------------------------------------

/** Hours before a deadline that Vethos considers the deadline "soon". */
const DEADLINE_SOON_HOURS = 72

/** feasibilityRatio below or equal to this → normal/watch. */
const TIGHT_FEASIBILITY_RATIO = 0.75

/** feasibilityRatio above this → tight. */
const CRITICAL_FEASIBILITY_RATIO = 1.0

/** feasibilityRatio above this → impossible_full_completion. */
const IMPOSSIBLE_FULL_COMPLETION_RATIO = 1.5

/**
 * Maximum value for feasibilityRatio when usableFreeMinutes is 0.
 * Used instead of Infinity to keep the output safely serialisable.
 */
const MAX_FEASIBILITY_RATIO = 999

/** Minimum progress percent considered non-zero for crisis escalation. */
const ZERO_PROGRESS_THRESHOLD = 1

/**
 * Keywords/signals in a task's type or tags that suggest a "practice-first"
 * strategy is appropriate.  These are generic activity categories — not
 * hardcoded example scenarios.
 */
const PRACTICE_FIRST_SIGNALS: readonly string[] = [
  'exercise',
  'exercice',
  'training',
  'entrainement',
  'entraînement',
  'assessment',
  'evaluation',
  'évaluation',
  'exam',
  'examen',
  'quiz',
  'practice',
  'pratique',
  'revision',
  'révision',
  'active_recall',
  'mock',
  'drill',
]

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

export type BuildDeadlineCrisisContextInput = {
  targetType: 'task' | 'objective'
  targetId: string

  deadline?: string

  /** 0–100 */
  progressPercent?: number

  /** Minutes of work remaining. If absent, derived from requiredIdealMinutes and progress. */
  remainingMinutes?: number

  /**
   * Ideal minutes needed to complete the work fully.
   * If absent, falls back to remainingMinutes when available.
   */
  requiredIdealMinutes?: number

  /**
   * Minimum minutes needed for a viable (not perfect) completion.
   * If absent, derived prudently from requiredIdealMinutes.
   */
  requiredMinimumMinutes?: number

  deadlineAvailability: DeadlineAvailabilityResult

  planningContext: PlanningContextV2

  /**
   * Optional signals about the task type to help pick the right strategy.
   * Examples: taskType, tags, domain, category — any string-based hint.
   */
  taskTypeSignals?: string[]

  priorityScoreV2?: unknown
  userModel?: unknown
  now?: Date
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function minutesUntilDeadlineFromString(deadline: string, now: Date): number | null {
  const parsed = new Date(deadline)
  if (!Number.isFinite(parsed.getTime())) return null
  return Math.round((parsed.getTime() - now.getTime()) / 60_000)
}

function isDeadlineSoon(minutesUntilDeadline: number | undefined): boolean {
  if (minutesUntilDeadline === undefined) return false
  return minutesUntilDeadline <= DEADLINE_SOON_HOURS * 60
}

function isDeadlineVeryClose(minutesUntilDeadline: number | undefined): boolean {
  if (minutesUntilDeadline === undefined) return false
  return minutesUntilDeadline <= 24 * 60
}

/**
 * Resolves the required minutes, applying conservative fallback logic when
 * data is missing. Returns the resolved values along with a confidence penalty
 * that reflects how much estimation was involved.
 */
function resolveRequiredMinutes(input: BuildDeadlineCrisisContextInput): {
  requiredIdealMinutes: number
  requiredMinimumMinutes: number
  remainingMinutes: number
  progressPercent: number
  confidencePenalty: number
} {
  let confidencePenalty = 0

  // Progress percent — default to unknown (50% is a neutral assumption we avoid;
  // if missing, we treat it as low-confidence).
  const progressPercent = input.progressPercent !== undefined
    ? Math.max(0, Math.min(100, input.progressPercent))
    : 0

  if (input.progressPercent === undefined) confidencePenalty += 20

  // requiredIdealMinutes
  let requiredIdealMinutes: number
  if (input.requiredIdealMinutes !== undefined && input.requiredIdealMinutes >= 0) {
    requiredIdealMinutes = input.requiredIdealMinutes
  } else if (input.remainingMinutes !== undefined && input.remainingMinutes >= 0) {
    // Use remainingMinutes as a conservative fallback — this is what's left, not
    // what's ideal, so we can treat them as equivalent at low confidence.
    requiredIdealMinutes = input.remainingMinutes
    confidencePenalty += 15
  } else {
    // No usable estimate at all.
    requiredIdealMinutes = 0
    confidencePenalty += 30
  }

  // remainingMinutes
  let remainingMinutes: number
  if (input.remainingMinutes !== undefined && input.remainingMinutes >= 0) {
    remainingMinutes = input.remainingMinutes
  } else if (requiredIdealMinutes > 0 && input.progressPercent !== undefined) {
    // Derive from requiredIdeal * (1 - progress/100).
    const factor = Math.max(0, 1 - progressPercent / 100)
    remainingMinutes = Math.round(requiredIdealMinutes * factor)
    confidencePenalty += 10
  } else {
    remainingMinutes = requiredIdealMinutes
    confidencePenalty += 10
  }

  // requiredMinimumMinutes — derive conservatively from ideal if absent.
  let requiredMinimumMinutes: number
  if (input.requiredMinimumMinutes !== undefined && input.requiredMinimumMinutes >= 0) {
    requiredMinimumMinutes = input.requiredMinimumMinutes
  } else if (requiredIdealMinutes > 0) {
    // A safe heuristic: minimum viable ≈ 55–65 % of ideal.
    requiredMinimumMinutes = Math.round(requiredIdealMinutes * 0.6)
    confidencePenalty += 10
  } else {
    requiredMinimumMinutes = 0
    confidencePenalty += 10
  }

  return { requiredIdealMinutes, requiredMinimumMinutes, remainingMinutes, progressPercent, confidencePenalty }
}

/**
 * Compute feasibilityRatio. Never returns Infinity — uses MAX_FEASIBILITY_RATIO
 * when the denominator is 0.
 */
function computeFeasibilityRatio(requiredIdealMinutes: number, usableFreeMinutesBeforeDeadline: number): number {
  if (requiredIdealMinutes <= 0) return 0
  if (usableFreeMinutesBeforeDeadline <= 0) return MAX_FEASIBILITY_RATIO
  return requiredIdealMinutes / usableFreeMinutesBeforeDeadline
}

type CrisisLevel = DeadlineCrisisContext['crisisLevel']
type RecommendedMode = DeadlineCrisisContext['recommendedMode']

function determineCrisisLevelFromRatio(ratio: number): CrisisLevel {
  if (ratio <= TIGHT_FEASIBILITY_RATIO) return 'none'
  if (ratio <= CRITICAL_FEASIBILITY_RATIO) return 'tight'
  if (ratio <= IMPOSSIBLE_FULL_COMPLETION_RATIO) return 'critical'
  return 'impossible_full_completion'
}

/**
 * Escalate the crisis level based on secondary signals beyond the raw ratio.
 */
function escalateCrisisLevel(
  base: CrisisLevel,
  args: {
    progressPercent: number
    minutesUntilDeadline: number | undefined
    deepWorkMinutesBeforeDeadline: number
    requiredIdealMinutes: number
    usableFreeMinutesBeforeDeadline: number
    isOverdue: boolean
  },
): CrisisLevel {
  const ORDER: CrisisLevel[] = ['none', 'watch', 'tight', 'critical', 'rescue_required', 'impossible_full_completion']

  function max(a: CrisisLevel, b: CrisisLevel): CrisisLevel {
    return ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b
  }

  let level = base

  // Deadline is overdue with remaining work → critical floor.
  if (args.isOverdue && args.requiredIdealMinutes > 0) {
    level = max(level, 'critical')
  }

  // Zero progress + deadline soon → escalate.
  if (args.progressPercent < ZERO_PROGRESS_THRESHOLD && isDeadlineSoon(args.minutesUntilDeadline)) {
    level = max(level, 'critical')
  }

  // Zero progress + deadline very close → rescue_required floor.
  if (args.progressPercent < ZERO_PROGRESS_THRESHOLD && isDeadlineVeryClose(args.minutesUntilDeadline)) {
    level = max(level, 'rescue_required')
  }

  // Not enough deep work for a task that likely requires it.
  if (
    args.deepWorkMinutesBeforeDeadline < args.requiredIdealMinutes * 0.5 &&
    args.requiredIdealMinutes > 120 &&
    level === 'none'
  ) {
    level = max(level, 'watch')
  }

  // Time exists but is all tiny/fragmented — usable is much less than ideal.
  if (
    args.usableFreeMinutesBeforeDeadline > 0 &&
    args.usableFreeMinutesBeforeDeadline < args.requiredIdealMinutes &&
    level === 'none'
  ) {
    level = max(level, 'watch')
  }

  return level
}

function determineModeFromCrisis(
  level: CrisisLevel,
  minimumViable: boolean,
  hasReliableData: boolean,
): RecommendedMode {
  if (!hasReliableData) return 'manual_review'
  switch (level) {
    case 'none':
    case 'watch':
      return 'normal_plan'
    case 'tight':
      return 'intensive_plan'
    case 'critical':
      return 'rescue_plan'
    case 'rescue_required':
      return minimumViable ? 'rescue_plan' : 'minimum_viable_plan'
    case 'impossible_full_completion':
      return minimumViable ? 'minimum_viable_plan' : 'manual_review'
    default:
      return 'manual_review'
  }
}

type StrategyType = DeadlineCrisisContext['recommendedStrategy']['strategyType']
type StrategyFocus = DeadlineCrisisContext['recommendedStrategy']['focus']

/**
 * Determine the recommended strategy based on general signals.
 * Does NOT hardcode any specific example scenario.
 * practice_first is triggered by generic activity-type signals,
 * not by the word "exam" or any other specific example.
 */
function determineStrategy(
  level: CrisisLevel,
  mode: RecommendedMode,
  args: {
    progressPercent: number
    taskTypeSignals?: string[]
    hasReliableData: boolean
  },
): { strategyType: StrategyType; focus: StrategyFocus; reasons: string[] } {
  if (!args.hasReliableData || mode === 'manual_review') {
    return {
      strategyType: 'manual_review',
      focus: 'unknown',
      reasons: ['Données insuffisantes pour choisir une stratégie précise.'],
    }
  }

  // Detect practice-type tasks from generic signals — not hardcoded examples.
  const lowerSignals = (args.taskTypeSignals ?? []).map((signal) => signal.toLowerCase())
  const isPracticeType = PRACTICE_FIRST_SIGNALS.some((keyword) =>
    lowerSignals.some((signal) => signal.includes(keyword)),
  )

  const isLowProgress = args.progressPercent < ZERO_PROGRESS_THRESHOLD
  const isVeryLowProgress = args.progressPercent < 10

  if (level === 'none' || level === 'watch') {
    if (isPracticeType) {
      return {
        strategyType: 'practice_first',
        focus: 'practice_questions',
        reasons: ['Le type d\'activite suggere de commencer par la pratique active.'],
      }
    }
    return {
      strategyType: 'complete_everything',
      focus: 'all_material',
      reasons: ['Le temps disponible est suffisant pour couvrir l\'ensemble.'],
    }
  }

  if (level === 'tight') {
    if (isPracticeType) {
      return {
        strategyType: 'practice_first',
        focus: 'practice_questions',
        reasons: ['Temps serre et activite pratique : commencer par la pratique maximise l\'efficacite.'],
      }
    }
    return {
      strategyType: 'prioritize_high_yield',
      focus: 'highest_value_material',
      reasons: ['Le temps est serre : il vaut mieux prioriser l\'essentiel a fort impact.'],
    }
  }

  if (level === 'critical' || level === 'rescue_required') {
    if (isLowProgress || isVeryLowProgress) {
      return {
        strategyType: 'diagnostic_first',
        focus: 'weak_points',
        reasons: [
          'Progression faible ou nulle : il faut d\'abord identifier les lacunes avant de planifier.',
        ],
      }
    }
    if (isPracticeType) {
      return {
        strategyType: 'practice_first',
        focus: 'practice_questions',
        reasons: ['Situation critique et activité pratique : la pratique ciblée est la priorité.'],
      }
    }
    return {
      strategyType: 'prioritize_high_yield',
      focus: 'highest_value_material',
      reasons: ['Situation critique : cibler uniquement les éléments à plus fort impact.'],
    }
  }

  // impossible_full_completion
  return {
    strategyType: 'minimum_pass_strategy',
    focus: 'summary_and_memory',
    reasons: [
      'Le travail complet est irréaliste dans le temps disponible.',
      'Vethos recommande un plan minimum viable, sans inventer un planning.',
    ],
  }
}

/**
 * Checks whether completing all the work would require cutting significantly
 * into sleep time. This is a heuristic: if the required work is much larger
 * than the usable (non-sleep) time, sleep is likely threatened.
 */
function assessSleepProtection(args: {
  requiredIdealMinutes: number
  usableFreeMinutesBeforeDeadline: number
  rawFreeMinutesBeforeDeadline: number
}): { shouldProtectSleep: boolean; warning?: string } {
  // If the raw free time barely covers the ideal, and usable is much lower,
  // it means a lot of "free time" is protected as sleep or recovery.
  const rawCoversIdeal = args.rawFreeMinutesBeforeDeadline >= args.requiredIdealMinutes
  const usableDoesNotCover = args.usableFreeMinutesBeforeDeadline < args.requiredIdealMinutes
  const significantGap = args.requiredIdealMinutes - args.usableFreeMinutesBeforeDeadline > 120

  if (rawCoversIdeal && usableDoesNotCover && significantGap) {
    return {
      shouldProtectSleep: true,
      warning:
        'Terminer tout le travail nécessiterait de sacrifier une partie significative du sommeil ou de la récupération. Vethos ne recommande pas ce plan.',
    }
  }

  // Also protect sleep if there is almost no usable time at all.
  if (args.usableFreeMinutesBeforeDeadline <= 0 && args.requiredIdealMinutes > 60) {
    return {
      shouldProtectSleep: true,
      warning:
        'Aucun temps réellement utilisable avant la deadline. Forcer un plan complet nécessiterait de supprimer le repos essentiel.',
    }
  }

  return { shouldProtectSleep: false }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds a DeadlineCrisisContext snapshot.
 *
 * Does NOT modify the planning, sessions, blocking, or any score.
 * The caller is responsible for deciding whether to act on this context.
 */
export function buildDeadlineCrisisContext(input: BuildDeadlineCrisisContextInput): DeadlineCrisisContext {
  const now = input.now ?? new Date()
  void input.priorityScoreV2
  void input.userModel
  void input.planningContext

  const availability = input.deadlineAvailability

  // --- Resolve deadline timing ---
  const minutesUntilDeadline: number | undefined = input.deadline
    ? (minutesUntilDeadlineFromString(input.deadline, now) ?? undefined)
    : undefined

  const isOverdue = minutesUntilDeadline !== undefined && minutesUntilDeadline < 0

  // --- Resolve required minutes with fallback logic ---
  const resolved = resolveRequiredMinutes(input)
  const { requiredIdealMinutes, requiredMinimumMinutes, remainingMinutes, progressPercent, confidencePenalty } = resolved

  // --- Base confidence ---
  const baseConfidence = Math.max(20, availability.confidence - confidencePenalty)

  // --- Is data reliable enough for a specific recommendation? ---
  const hasReliableData = confidencePenalty < 50 && requiredIdealMinutes > 0

  // --- If no deadline: no crisis ---
  if (!input.deadline) {
    const strategy = determineStrategy('none', 'normal_plan', {
      progressPercent,
      taskTypeSignals: input.taskTypeSignals,
      hasReliableData,
    })
    return {
      targetType: input.targetType,
      targetId: input.targetId,
      progressPercent,
      remainingMinutes,
      rawFreeMinutesBeforeDeadline: availability.rawFreeMinutesBeforeDeadline,
      usableFreeMinutesBeforeDeadline: availability.usableFreeMinutesBeforeDeadline,
      deepWorkMinutesBeforeDeadline: availability.deepWorkMinutesBeforeDeadline,
      matchingWindowMinutesBeforeDeadline: availability.matchingWindowMinutesBeforeDeadline,
      requiredIdealMinutes,
      requiredMinimumMinutes,
      feasibilityRatio: 0,
      crisisLevel: 'none',
      recommendedMode: 'normal_plan',
      shouldProtectSleep: false,
      recommendedStrategy: strategy,
      warnings: [],
      explanation: ['Aucune deadline définie : pas de contexte de crise.'],
      confidence: baseConfidence,
    }
  }

  // --- Overdue with remaining work ---
  if (isOverdue && remainingMinutes > 0) {
    const strategy = determineStrategy('critical', 'manual_review', {
      progressPercent,
      taskTypeSignals: input.taskTypeSignals,
      hasReliableData,
    })
    return {
      targetType: input.targetType,
      targetId: input.targetId,
      deadline: input.deadline,
      minutesUntilDeadline,
      progressPercent,
      remainingMinutes,
      rawFreeMinutesBeforeDeadline: 0,
      usableFreeMinutesBeforeDeadline: 0,
      deepWorkMinutesBeforeDeadline: 0,
      matchingWindowMinutesBeforeDeadline: 0,
      requiredIdealMinutes,
      requiredMinimumMinutes,
      feasibilityRatio: MAX_FEASIBILITY_RATIO,
      crisisLevel: 'critical',
      recommendedMode: 'manual_review',
      shouldProtectSleep: false,
      recommendedStrategy: strategy,
      warnings: ['La deadline est dépassée. Une révision manuelle est nécessaire.'],
      explanation: ['La deadline est deja passee alors qu\'il reste du travail a faire.'],
      confidence: Math.min(baseConfidence, 70),
    }
  }

  // --- Normal path: compute feasibility ---
  const feasibilityRatio = computeFeasibilityRatio(
    requiredIdealMinutes,
    availability.usableFreeMinutesBeforeDeadline,
  )

  const baseLevel = determineCrisisLevelFromRatio(feasibilityRatio)
  const crisisLevel = escalateCrisisLevel(baseLevel, {
    progressPercent,
    minutesUntilDeadline,
    deepWorkMinutesBeforeDeadline: availability.deepWorkMinutesBeforeDeadline,
    requiredIdealMinutes,
    usableFreeMinutesBeforeDeadline: availability.usableFreeMinutesBeforeDeadline,
    isOverdue,
  })

  // Minimum viable: is it possible to do at least the minimum?
  const minimumViable = requiredMinimumMinutes > 0 &&
    availability.usableFreeMinutesBeforeDeadline >= requiredMinimumMinutes

  const recommendedMode = determineModeFromCrisis(crisisLevel, minimumViable, hasReliableData)
  const strategy = determineStrategy(crisisLevel, recommendedMode, {
    progressPercent,
    taskTypeSignals: input.taskTypeSignals,
    hasReliableData,
  })

  // --- Sleep protection ---
  const sleepAssessment = assessSleepProtection({
    requiredIdealMinutes,
    usableFreeMinutesBeforeDeadline: availability.usableFreeMinutesBeforeDeadline,
    rawFreeMinutesBeforeDeadline: availability.rawFreeMinutesBeforeDeadline,
  })

  // --- Warnings ---
  const warnings: string[] = []
  if (feasibilityRatio >= MAX_FEASIBILITY_RATIO) {
    warnings.push(
      'usableFreeMinutesBeforeDeadline is 0 while requiredIdealMinutes is greater than 0.',
    )
  }
  if (sleepAssessment.shouldProtectSleep && sleepAssessment.warning) {
    warnings.push(sleepAssessment.warning)
  }
  if (crisisLevel === 'impossible_full_completion') {
    warnings.push('Un plan complet n\'est pas réaliste dans le temps disponible.')
  }
  if (isDeadlineSoon(minutesUntilDeadline) && progressPercent < ZERO_PROGRESS_THRESHOLD) {
    warnings.push('La deadline est proche et la progression est nulle ou quasi-nulle.')
  }
  if (!hasReliableData) {
    warnings.push('Les donnees d\'estimation sont insuffisantes pour une recommandation precise.')
  }

  // --- Explanation ---
  const explanation: string[] = []
  explanation.push(
    `Ratio de faisabilité : ${feasibilityRatio >= MAX_FEASIBILITY_RATIO ? '∞ (aucun temps utilisable)' : feasibilityRatio.toFixed(2)}.`,
  )
  if (availability.usableFreeMinutesBeforeDeadline > 0) {
    explanation.push(
      `${availability.usableFreeMinutesBeforeDeadline} min utilisables avant la deadline, ${requiredIdealMinutes} min idéalement requises.`,
    )
  } else {
    explanation.push('Aucun temps réellement utilisable avant la deadline.')
  }
  if (!minimumViable && requiredMinimumMinutes > 0) {
    explanation.push(
      `Meme le minimum viable (${requiredMinimumMinutes} min) n'est pas atteignable avec le temps disponible.`,
    )
  }
  if (minimumViable && crisisLevel !== 'none' && crisisLevel !== 'watch') {
    explanation.push(
      `Le minimum viable (${requiredMinimumMinutes} min) reste atteignable, mais le plan complet ne l'est pas.`,
    )
  }

  return {
    targetType: input.targetType,
    targetId: input.targetId,
    deadline: input.deadline,
    minutesUntilDeadline,
    progressPercent,
    remainingMinutes,
    rawFreeMinutesBeforeDeadline: availability.rawFreeMinutesBeforeDeadline,
    usableFreeMinutesBeforeDeadline: availability.usableFreeMinutesBeforeDeadline,
    deepWorkMinutesBeforeDeadline: availability.deepWorkMinutesBeforeDeadline,
    matchingWindowMinutesBeforeDeadline: availability.matchingWindowMinutesBeforeDeadline,
    requiredIdealMinutes,
    requiredMinimumMinutes,
    feasibilityRatio,
    crisisLevel,
    recommendedMode,
    shouldProtectSleep: sleepAssessment.shouldProtectSleep,
    minimumSleepWarning: sleepAssessment.warning,
    recommendedStrategy: strategy,
    warnings,
    explanation,
    confidence: baseConfidence,
  }
}
