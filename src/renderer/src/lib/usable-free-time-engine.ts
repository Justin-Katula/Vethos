import type { DayTimelineSegment, FreeTimeWindow, TimeInterval } from '@shared/planning-time-model'
import type { UserModel } from '@shared/user-model'
import {
  findAdjacentSegment,
  intervalEndMinute,
  intervalStartMinute,
  segmentEndMinute,
  segmentId,
  segmentStartMinute,
} from './planning-time-utils'

export type CalculateUsableFreeWindowsInput = {
  date: string
  rawFreeWindows: TimeInterval[]
  timeline: DayTimelineSegment[]
  userModel?: UserModel | null
  rules?: Record<string, unknown>
  now?: Date
}

function baseWindowType(duration: number): Pick<FreeTimeWindow, 'windowType' | 'usableDurationMinutes' | 'canHostTask' | 'canHostDeepWork' | 'canHostRecovery' | 'confidence'> {
  if (duration < 15) {
    return {
      windowType: 'tiny',
      usableDurationMinutes: 0,
      canHostTask: false,
      canHostDeepWork: false,
      canHostRecovery: false,
      confidence: 90,
    }
  }
  if (duration < 30) {
    return {
      windowType: 'short',
      usableDurationMinutes: duration,
      canHostTask: false,
      canHostDeepWork: false,
      canHostRecovery: true,
      confidence: 80,
    }
  }
  if (duration < 60) {
    return {
      windowType: 'short',
      usableDurationMinutes: duration,
      canHostTask: true,
      canHostDeepWork: false,
      canHostRecovery: true,
      confidence: 80,
    }
  }
  if (duration < 120) {
    return {
      windowType: 'normal',
      usableDurationMinutes: duration,
      canHostTask: true,
      canHostDeepWork: false,
      canHostRecovery: true,
      confidence: 82,
    }
  }
  return {
    windowType: 'deep_work',
    usableDurationMinutes: duration,
    canHostTask: true,
    canHostDeepWork: true,
    canHostRecovery: true,
    confidence: 86,
  }
}

function baseReasons(duration: number): string[] {
  if (duration < 15) return ['Ce créneau est trop court pour protéger une vraie tâche.']
  if (duration < 30) return ['Ce créneau peut servir à une micro-action ou à souffler, pas à du travail lourd.']
  if (duration < 60) return ['Ce créneau peut accueillir une tâche simple, mais pas du travail profond.']
  if (duration < 120) return ['Ce créneau est assez long pour une session normale.']
  return ['Ce créneau est assez long pour du travail profond.']
}

export function calculateUsableFreeWindows(input: CalculateUsableFreeWindowsInput): FreeTimeWindow[] {
  void input.userModel
  void input.rules
  void input.now

  return input.rawFreeWindows.map((window) => {
    const duration = Math.max(0, window.durationMinutes)
    const base = baseWindowType(duration)
    const reasons = baseReasons(duration)
    const previous = findAdjacentSegment(input.timeline, window, 'previous')
    const next = findAdjacentSegment(input.timeline, window, 'next')
    const startsAt = intervalStartMinute(window)
    const endsAt = intervalEndMinute(window)

    let result: FreeTimeWindow = {
      id: segmentId(['free-window', input.date, startsAt, endsAt]),
      date: input.date,
      start: window.start,
      end: window.end,
      rawDurationMinutes: duration,
      reasons,
      ...base,
    }

    if (next && ['school', 'work'].includes(next.kind) && segmentStartMinute(next) === endsAt && duration < 61) {
      result = {
        ...result,
        windowType: next.kind === 'school' ? 'preparation_only' : 'preparation_only',
        usableDurationMinutes: 0,
        canHostTask: false,
        canHostDeepWork: false,
        canHostRecovery: false,
        confidence: Math.max(result.confidence, 88),
        reasons: [
          `Ce créneau est juste avant ${next.kind === 'school' ? "l'école" : 'le travail'} : Vethos le protège comme préparation.`,
        ],
      }
    }

    if (next?.kind === 'sleep' && segmentStartMinute(next) === endsAt) {
      const protectedMinutes = Math.min(30, duration)
      result = {
        ...result,
        windowType: duration <= 30 ? 'preparation_only' : result.windowType,
        usableDurationMinutes: Math.max(0, result.usableDurationMinutes - protectedMinutes),
        canHostDeepWork: duration - protectedMinutes >= 120,
        canHostTask: duration - protectedMinutes >= 30,
        reasons: [...result.reasons, 'Vethos garde une transition avant le sommeil.'],
        confidence: Math.max(result.confidence, 84),
      }
    }

    if (previous && ['school', 'work'].includes(previous.kind) && segmentEndMinute(previous) === startsAt && duration <= 30) {
      result = {
        ...result,
        windowType: 'recovery_only',
        usableDurationMinutes: 0,
        canHostTask: false,
        canHostDeepWork: false,
        canHostRecovery: true,
        reasons: [`Ce créneau est juste après ${previous.kind === 'school' ? "l'école" : 'le travail'} : il sert surtout à récupérer.`],
        confidence: Math.max(result.confidence, 86),
      }
    }

    return result
  })
}
