import type { DayTimelineSegment, FreeTimeWindow, PlanningRuleResult } from '@shared/planning-time-model'
import type { UserModel } from '@shared/user-model'
import {
  createComputedSegment,
  findAdjacentSegment,
  intervalEndMinute,
  intervalStartMinute,
  segmentId,
  segmentStartMinute,
  splitFreeSegmentWithComputedBlock,
} from './planning-time-utils'

export type ApplyPreparationAndTransitionRulesInput = {
  timeline: DayTimelineSegment[]
  freeWindows: FreeTimeWindow[]
  rules?: Record<string, unknown>
  userModel?: UserModel | null
}

export type PreparationAndTransitionResult = {
  updatedTimeline: DayTimelineSegment[]
  updatedFreeWindows: FreeTimeWindow[]
  rulesApplied: PlanningRuleResult[]
}

function ruleResult(args: {
  id: string
  rule: PlanningRuleResult['rule']
  applied: boolean
  affectedMinutes: number
  reason: string
}): PlanningRuleResult {
  return args
}

export function applyPreparationAndTransitionRules(input: ApplyPreparationAndTransitionRulesInput): PreparationAndTransitionResult {
  void input.rules
  void input.userModel

  let updatedTimeline = input.timeline.slice()
  const rulesApplied: PlanningRuleResult[] = []

  const updatedFreeWindows: FreeTimeWindow[] = input.freeWindows.map((window) => {
    const next = findAdjacentSegment(input.timeline, window, 'next')
    const previous = findAdjacentSegment(input.timeline, window, 'previous')
    const startMinute = intervalStartMinute(window)
    const endMinute = intervalEndMinute(window)

    if (next?.kind === 'school' && segmentStartMinute(next) === endMinute && window.rawDurationMinutes < 61) {
      const block = createComputedSegment({
        date: window.date,
        startMinute,
        endMinute,
        kind: 'preparation',
        label: "Préparation avant l'école",
        idSuffix: window.id,
        metadata: { sourceWindowId: window.id },
      })
      updatedTimeline = splitFreeSegmentWithComputedBlock(updatedTimeline, block)
      rulesApplied.push(
        ruleResult({
          id: segmentId(['rule', window.id, 'pre-school']),
          rule: 'pre_school_preparation',
          applied: true,
          affectedMinutes: window.rawDurationMinutes,
          reason: "Moins de 61 minutes avant l'école : ce temps est gardé comme préparation.",
        }),
      )
      return {
        ...window,
        windowType: 'preparation_only' as const,
        usableDurationMinutes: 0,
        canHostTask: false,
        canHostDeepWork: false,
        canHostRecovery: false,
        reasons: ["Ce temps est protégé comme préparation avant l'école."],
        confidence: Math.max(window.confidence, 90),
      }
    }

    if (next?.kind === 'work' && segmentStartMinute(next) === endMinute && window.rawDurationMinutes < 61) {
      const block = createComputedSegment({
        date: window.date,
        startMinute,
        endMinute,
        kind: 'preparation',
        label: 'Préparation avant le travail',
        idSuffix: window.id,
        metadata: { sourceWindowId: window.id },
      })
      updatedTimeline = splitFreeSegmentWithComputedBlock(updatedTimeline, block)
      rulesApplied.push(
        ruleResult({
          id: segmentId(['rule', window.id, 'pre-work']),
          rule: 'pre_work_preparation',
          applied: true,
          affectedMinutes: window.rawDurationMinutes,
          reason: 'Moins de 61 minutes avant le travail : ce temps est gardé comme préparation.',
        }),
      )
      return {
        ...window,
        windowType: 'preparation_only' as const,
        usableDurationMinutes: 0,
        canHostTask: false,
        canHostDeepWork: false,
        canHostRecovery: false,
        reasons: ['Ce temps est protégé comme préparation avant le travail.'],
        confidence: Math.max(window.confidence, 90),
      }
    }

    if (next?.kind === 'sleep' && segmentStartMinute(next) === endMinute) {
      const protectedMinutes = Math.min(30, window.rawDurationMinutes)
      const transitionStart = endMinute - protectedMinutes
      const block = createComputedSegment({
        date: window.date,
        startMinute: transitionStart,
        endMinute,
        kind: 'transition',
        label: 'Transition avant sommeil',
        idSuffix: window.id,
        metadata: { sourceWindowId: window.id },
      })
      updatedTimeline = splitFreeSegmentWithComputedBlock(updatedTimeline, block)
      rulesApplied.push(
        ruleResult({
          id: segmentId(['rule', window.id, 'pre-sleep']),
          rule: 'pre_sleep_transition',
          applied: true,
          affectedMinutes: protectedMinutes,
          reason: 'Vethos protège une transition avant le sommeil.',
        }),
      )
      return {
        ...window,
        windowType: window.rawDurationMinutes <= 30 ? 'preparation_only' as const : window.windowType,
        usableDurationMinutes: Math.max(0, window.usableDurationMinutes - protectedMinutes),
        canHostTask: window.usableDurationMinutes - protectedMinutes >= 30,
        canHostDeepWork: window.usableDurationMinutes - protectedMinutes >= 120,
        reasons: [...window.reasons, 'Transition protégée avant le sommeil.'],
        confidence: Math.max(window.confidence, 86),
      }
    }

    if (previous && next && previous.kind !== 'free' && next.kind !== 'free' && window.rawDurationMinutes < 20) {
      const block = createComputedSegment({
        date: window.date,
        startMinute,
        endMinute,
        kind: 'transition',
        label: 'Transition courte',
        idSuffix: window.id,
        metadata: { sourceWindowId: window.id },
      })
      updatedTimeline = splitFreeSegmentWithComputedBlock(updatedTimeline, block)
      return {
        ...window,
        windowType: 'tiny' as const,
        usableDurationMinutes: 0,
        canHostTask: false,
        canHostDeepWork: false,
        reasons: [...window.reasons, 'Ce petit espace entre deux blocs sert surtout de transition.'],
      }
    }

    return window
  })

  return { updatedTimeline, updatedFreeWindows, rulesApplied }
}
