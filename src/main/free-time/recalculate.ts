import { powerMonitor } from 'electron'
import type { Chronotype, ScheduleEntry, TimeRule } from '@shared/schemas'
import type { Storage } from '@service/storage'
import { distractingActivityMinutesBetween } from '../tracking/app-usage-tracker'

type FreeTimeSlot = {
  startMinute: number
  endMinute: number
  durationMinutes: number
  isPreparation: boolean
}

type FreeTimeOptions = {
  wakeMinute?: number | null
  morningBufferMinutes?: number
  postWorkSchoolRestMinutes?: number
}

type PassiveSleepSession = {
  sleepStartedAt: string
  wokeAt: string
  durationMinutes: number
  isFreeDay: boolean
  source: 'idle-lock' | 'suspend-resume' | 'idle-poll'
}

export type CarryOverSystemClassification = 'life-emergency' | 'procrastination' | 'unknown'

export type CarryOverSystemAudit = {
  classification: CarryOverSystemClassification
  idleSeconds: number
  distractingActivityMinutes: number
}

export function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function jsDateToDayOfWeek(date: Date): number {
  return (date.getDay() + 6) % 7
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

function isFixedActivity(rule: TimeRule): boolean {
  if (rule.categoryType) {
    return ['sleep', 'school', 'work', 'commitment'].includes(rule.categoryType)
  }
  const name = rule.name.toLowerCase()
  return (
    name.includes('école') ||
    name.includes('ecole') ||
    name.includes('school') ||
    name.includes('travail') ||
    name.includes('work') ||
    name.includes('job') ||
    name.includes('sommeil') ||
    name.includes('sleep') ||
    name.includes('dodo') ||
    name.includes('cours') ||
    name.includes('class')
  )
}

function isSleepRule(rule: TimeRule): boolean {
  if (rule.categoryType) return rule.categoryType === 'sleep'
  const name = rule.name.toLowerCase()
  return name.includes('sommeil') || name.includes('sleep') || name.includes('dodo')
}

function isSchoolOrWorkRule(rule: TimeRule): boolean {
  if (rule.categoryType) return rule.categoryType === 'school' || rule.categoryType === 'work'
  const name = rule.name.toLowerCase()
  return (
    name.includes('école') ||
    name.includes('ecole') ||
    name.includes('school') ||
    name.includes('travail') ||
    name.includes('work') ||
    name.includes('job') ||
    name.includes('cours') ||
    name.includes('class')
  )
}

function isFreeRule(rule: TimeRule): boolean {
  if (rule.categoryType) return rule.categoryType === 'free'
  const name = rule.name.toLowerCase()
  return name.includes('temps libre') || name.includes('free time')
}

function minuteOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

function isNightWindow(date: Date): boolean {
  const minute = minuteOfDay(date)
  return minute >= 20 * 60 || minute <= 12 * 60
}

function averageMinuteOfDay(values: number[]): number | undefined {
  if (values.length === 0) return undefined
  const x = values.reduce((sum, minute) => sum + Math.cos((minute / 1440) * Math.PI * 2), 0)
  const y = values.reduce((sum, minute) => sum + Math.sin((minute / 1440) * Math.PI * 2), 0)
  const angle = Math.atan2(y / values.length, x / values.length)
  const normalized = angle < 0 ? angle + Math.PI * 2 : angle
  return Math.round((normalized / (Math.PI * 2)) * 1440) % 1440
}

function classifyChronotypeFromMsf(midSleepMinute: number): Chronotype {
  if (midSleepMinute < 4 * 60) return 'morning'
  if (midSleepMinute >= 5 * 60 + 30) return 'evening'
  return 'intermediate'
}

function deriveCircadianMetrics(sessions: PassiveSleepSession[]): {
  detectedWakeMinute?: number
  detectedSleepMinute?: number
  detectedChronotype?: Chronotype
} {
  const recent = sessions.slice(-14)
  const detectedWakeMinute = averageMinuteOfDay(
    recent.map((session) => minuteOfDay(new Date(session.wokeAt))),
  )
  const detectedSleepMinute = averageMinuteOfDay(
    recent.map((session) => minuteOfDay(new Date(session.sleepStartedAt))),
  )
  const freeDayMidpoints = recent
    .filter((session) => session.isFreeDay)
    .map((session) => {
      const sleep = new Date(session.sleepStartedAt)
      return minuteOfDay(new Date(sleep.getTime() + (session.durationMinutes / 2) * 60_000))
    })
  const midSleepMinute = averageMinuteOfDay(freeDayMidpoints)
  return {
    detectedWakeMinute,
    detectedSleepMinute,
    detectedChronotype:
      midSleepMinute === undefined ? undefined : classifyChronotypeFromMsf(midSleepMinute),
  }
}

function isFreeDay(date: Date): boolean {
  const day = date.getDay()
  return day === 0 || day === 6
}

async function recordPassiveSleepSession(
  storage: Storage,
  session: PassiveSleepSession,
  userId?: string,
): Promise<void> {
  if (!userId) return
  const levels = await storage.read('levels', userId)
  const sessions = [...(levels?.passiveSleepSessions ?? []), session].slice(-60)
  const metrics = deriveCircadianMetrics(sessions)
  const settings = await storage.read('settings', userId)
  const nowIso = new Date().toISOString()

  await storage.write(
    'levels',
    {
      ...(levels?.objectives ? { objectives: levels.objectives } : {}),
      calculatedDailyFreeMinutes: levels?.calculatedDailyFreeMinutes ?? 0,
      calculatedAt: levels?.calculatedAt ?? null,
      lastCalculatedDate: levels?.lastCalculatedDate ?? null,
      lastProcessedSessionId: levels?.lastProcessedSessionId ?? null,
      lastProcessedAppUsageByApp: levels?.lastProcessedAppUsageByApp ?? {},
      closureRitualPromptedAt: levels?.closureRitualPromptedAt ?? null,
      staticPlanDate: levels?.staticPlanDate ?? null,
      staticPlanGeneratedAt: levels?.staticPlanGeneratedAt ?? null,
      cognitiveEfficiencySamples: levels?.cognitiveEfficiencySamples ?? [],
      passiveSleepSessions: sessions,
      detectedWakeMinute: metrics.detectedWakeMinute,
      detectedSleepMinute: metrics.detectedSleepMinute,
      detectedChronotype: metrics.detectedChronotype,
      detectedPeakHour: levels?.detectedPeakHour,
    },
    userId,
  )

  await storage.write(
    'settings',
    {
      ...(settings ?? {}),
      detectedWakeMinute: metrics.detectedWakeMinute ?? settings?.detectedWakeMinute,
      detectedSleepMinute: metrics.detectedSleepMinute ?? settings?.detectedSleepMinute,
      detectedChronotype: metrics.detectedChronotype ?? settings?.detectedChronotype,
      detectedPeakHour: levels?.detectedPeakHour ?? settings?.detectedPeakHour,
      circadianMetricsUpdatedAt: nowIso,
    },
    userId,
  )
}

export function parseClockTimeToMinute(value: string | null | undefined): number | null {
  if (!value) return null
  const [hours, minutes] = value.split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return Math.max(0, Math.min(1439, hours! * 60 + minutes!))
}

function applyMorningBuffer(slots: FreeTimeSlot[], options: FreeTimeOptions = {}): FreeTimeSlot[] {
  const wakeMinute = options.wakeMinute
  if (wakeMinute === null || wakeMinute === undefined) return slots
  const bufferEnd = Math.max(0, Math.min(1440, wakeMinute + (options.morningBufferMinutes ?? 30)))

  return slots.map((slot) => {
    if (slot.endMinute <= bufferEnd) {
      return {
        ...slot,
        startMinute: slot.endMinute,
        durationMinutes: 0,
        isPreparation: true,
      }
    }
    if (slot.startMinute >= bufferEnd) return slot
    const startMinute = bufferEnd
    const durationMinutes = slot.endMinute - startMinute
    return {
      ...slot,
      startMinute,
      durationMinutes,
      isPreparation: slot.isPreparation || durationMinutes < 15,
    }
  })
}

export function computeFreeTimeSlots(
  dayOfWeek: number,
  entries: ScheduleEntry[],
  rules: TimeRule[],
  options: FreeTimeOptions = {},
): FreeTimeSlot[] {
  const ruleById = new Map(rules.map((rule) => [rule.id, rule]))
  const dayEntries = entries
    .filter((entry) => {
      if (entry.dayOfWeek !== dayOfWeek) return false
      const rule = ruleById.get(entry.ruleId)
      if (!rule || isFreeRule(rule)) return false
      return isFixedActivity(rule)
    })
    .sort((a, b) => a.startMinute - b.startMinute)

  if (dayEntries.length === 0) {
    return applyMorningBuffer(
      [{ startMinute: 0, endMinute: 1440, durationMinutes: 1440, isPreparation: false }],
      options,
    )
  }

  const slots: FreeTimeSlot[] = []
  let cursor = 0
  for (const entry of dayEntries) {
    if (entry.startMinute > cursor) {
      slots.push({
        startMinute: cursor,
        endMinute: entry.startMinute,
        durationMinutes: entry.startMinute - cursor,
        isPreparation: false,
      })
    }
    cursor = Math.max(cursor, entry.endMinute)
  }
  if (cursor < 1440) {
    slots.push({
      startMinute: cursor,
      endMinute: 1440,
      durationMinutes: 1440 - cursor,
      isPreparation: false,
    })
  }

  for (const slot of slots) {
    const nextEntry = dayEntries.find((entry) => entry.startMinute >= slot.endMinute)
    const nextRule = nextEntry ? ruleById.get(nextEntry.ruleId) : null
    const prevEntry = [...dayEntries].reverse().find((entry) => entry.endMinute <= slot.startMinute)
    const prevRule = prevEntry ? ruleById.get(prevEntry.ruleId) : null

    if (prevRule && isSchoolOrWorkRule(prevRule)) {
      const rest = Math.min(options.postWorkSchoolRestMinutes ?? 30, slot.durationMinutes)
      slot.startMinute += rest
      slot.durationMinutes -= rest
      if (slot.durationMinutes <= 0) slot.isPreparation = true
    }

    if (nextRule && isSchoolOrWorkRule(nextRule) && slot.durationMinutes < 61) {
      slot.isPreparation = true
    }

    if (nextRule && isSleepRule(nextRule)) {
      const transition = Math.min(30, slot.durationMinutes)
      slot.endMinute -= transition
      slot.durationMinutes -= transition
      if (slot.durationMinutes <= 0) slot.isPreparation = true
    }
  }

  return applyMorningBuffer(slots, options)
}

export function computeDayFreeMinutes(
  dayOfWeek: number,
  entries: ScheduleEntry[],
  rules: TimeRule[],
  options: FreeTimeOptions = {},
): number {
  return computeFreeTimeSlots(dayOfWeek, entries, rules, options)
    .filter((slot) => !slot.isPreparation)
    .reduce((sum, slot) => sum + slot.durationMinutes, 0)
}

export async function verifyCarryOverInactivity(
  storage: Storage,
  missedStartAt: Date,
  missedEndAt: Date,
  userId?: string,
): Promise<CarryOverSystemAudit> {
  const missedMinutes = Math.max(
    1,
    Math.round((missedEndAt.getTime() - missedStartAt.getTime()) / 60_000),
  )
  const idleSeconds = powerMonitor.getSystemIdleTime()
  const usage = userId ? await storage.read('declared_app_usage', userId) : null
  const distractingActivityMinutes = distractingActivityMinutesBetween(
    usage,
    missedStartAt,
    missedEndAt,
  )
  if (idleSeconds >= Math.min(missedMinutes, 30) * 60) {
    return { classification: 'life-emergency', idleSeconds, distractingActivityMinutes }
  }
  if (distractingActivityMinutes > 0) {
    return { classification: 'procrastination', idleSeconds, distractingActivityMinutes }
  }
  return { classification: 'unknown', idleSeconds, distractingActivityMinutes }
}

export async function recalculateFreeTimeAtBoot(
  storage: Storage,
  now = new Date(),
  userId?: string,
): Promise<void> {
  if (!userId) return
  const schedule = await storage.read('schedule', userId)
  if (!schedule) return
  const settings = await storage.read('settings', userId)
  const levels = await storage.read('levels', userId)
  const today = localDateKey(now)
  if (levels?.lastCalculatedDate === today) return

  const totalFreeMinutes = computeDayFreeMinutes(
    jsDateToDayOfWeek(now),
    schedule.entries,
    schedule.rules,
    { wakeMinute: parseClockTimeToMinute(settings?.sleepEnd), morningBufferMinutes: 30 },
  )

  await storage.write(
    'levels',
    {
      ...(levels?.objectives ? { objectives: levels.objectives } : {}),
      calculatedDailyFreeMinutes: totalFreeMinutes,
      calculatedAt: now.toISOString(),
      lastCalculatedDate: today,
      lastProcessedSessionId: levels?.lastProcessedSessionId ?? null,
      lastProcessedAppUsageByApp: levels?.lastProcessedAppUsageByApp ?? {},
      closureRitualPromptedAt: levels?.closureRitualPromptedAt ?? null,
      staticPlanDate: levels?.staticPlanDate ?? null,
      staticPlanGeneratedAt: levels?.staticPlanGeneratedAt ?? null,
      passiveSleepSessions: levels?.passiveSleepSessions ?? [],
      cognitiveEfficiencySamples: levels?.cognitiveEfficiencySamples ?? [],
      detectedPeakHour: levels?.detectedPeakHour,
      detectedWakeMinute: levels?.detectedWakeMinute,
      detectedSleepMinute: levels?.detectedSleepMinute,
      detectedChronotype: levels?.detectedChronotype,
    },
    userId,
  )
}

export async function getPreviousFreeMinutesByDate(
  storage: Storage,
  now = new Date(),
  userId?: string,
): Promise<Record<string, number> | undefined> {
  if (!userId) return undefined
  const schedule = await storage.read('schedule', userId)
  if (!schedule) return undefined
  const settings = await storage.read('settings', userId)
  const options = {
    wakeMinute: parseClockTimeToMinute(settings?.sleepEnd),
    morningBufferMinutes: 30,
  }

  const yesterday = addDays(now, -1)
  const dayBefore = addDays(now, -2)
  return {
    [localDateKey(yesterday)]: computeDayFreeMinutes(
      jsDateToDayOfWeek(yesterday),
      schedule.entries,
      schedule.rules,
      options,
    ),
    [localDateKey(dayBefore)]: computeDayFreeMinutes(
      jsDateToDayOfWeek(dayBefore),
      schedule.entries,
      schedule.rules,
      options,
    ),
  }
}

export function startPassiveChronotypeTracking(
  storage: Storage,
  getUserId: () => string | undefined = () => undefined,
): { stop: () => void } {
  let nightIdleStart: Date | null = null
  let longInactivityStart: Date | null = null
  let lastRecordedWakeAt = 0

  function maybeStartNightIdle(source: PassiveSleepSession['source']): void {
    const now = new Date()
    if (!isNightWindow(now)) return
    const idleSeconds = powerMonitor.getSystemIdleTime()
    if (idleSeconds < 30 * 60) return
    const inferredStart = new Date(now.getTime() - idleSeconds * 1000)
    nightIdleStart = nightIdleStart ?? inferredStart
    longInactivityStart = longInactivityStart ?? inferredStart
    void source
  }

  function maybeRecordWake(source: PassiveSleepSession['source']): void {
    const wake = new Date()
    if (wake.getTime() - lastRecordedWakeAt < 60 * 60 * 1000) return
    const startedAt = longInactivityStart ?? nightIdleStart
    if (!startedAt) return
    const durationMinutes = Math.round((wake.getTime() - startedAt.getTime()) / 60_000)
    nightIdleStart = null
    longInactivityStart = null
    if (durationMinutes < 5 * 60) return
    lastRecordedWakeAt = wake.getTime()
    void recordPassiveSleepSession(
      storage,
      {
        sleepStartedAt: startedAt.toISOString(),
        wokeAt: wake.toISOString(),
        durationMinutes,
        isFreeDay: isFreeDay(wake),
        source,
      },
      getUserId(),
    )
  }

  const poll = setInterval(() => {
    const idleSeconds = powerMonitor.getSystemIdleTime()
    if (idleSeconds >= 30 * 60) {
      maybeStartNightIdle('idle-poll')
      return
    }
    if (idleSeconds < 60) {
      maybeRecordWake('idle-poll')
    }
  }, 60_000)

  const onLock = (): void => {
    if (isNightWindow(new Date())) {
      nightIdleStart = nightIdleStart ?? new Date()
      longInactivityStart = longInactivityStart ?? nightIdleStart
    }
  }
  const onUnlock = (): void => maybeRecordWake('idle-lock')
  const onSuspend = (): void => {
    if (isNightWindow(new Date())) {
      nightIdleStart = nightIdleStart ?? new Date()
      longInactivityStart = longInactivityStart ?? nightIdleStart
    }
  }
  const onResume = (): void => maybeRecordWake('suspend-resume')
  const onActive = (): void => maybeRecordWake('idle-poll')

  powerMonitor.on('lock-screen', onLock)
  powerMonitor.on('unlock-screen', onUnlock)
  powerMonitor.on('suspend', onSuspend)
  powerMonitor.on('resume', onResume)
  powerMonitor.on('user-did-become-active', onActive)

  return {
    stop() {
      clearInterval(poll)
      powerMonitor.off('lock-screen', onLock)
      powerMonitor.off('unlock-screen', onUnlock)
      powerMonitor.off('suspend', onSuspend)
      powerMonitor.off('resume', onResume)
      powerMonitor.off('user-did-become-active', onActive)
    },
  }
}
