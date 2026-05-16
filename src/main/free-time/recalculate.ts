import type { ScheduleEntry, TimeRule } from '@shared/schemas'
import type { Storage } from '@main/storage'

type FreeTimeSlot = {
  startMinute: number
  endMinute: number
  durationMinutes: number
  isPreparation: boolean
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

export function computeFreeTimeSlots(
  dayOfWeek: number,
  entries: ScheduleEntry[],
  rules: TimeRule[],
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
    return [{ startMinute: 0, endMinute: 1440, durationMinutes: 1440, isPreparation: false }]
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

  return slots
}

export function computeDayFreeMinutes(
  dayOfWeek: number,
  entries: ScheduleEntry[],
  rules: TimeRule[],
): number {
  return computeFreeTimeSlots(dayOfWeek, entries, rules)
    .filter((slot) => !slot.isPreparation)
    .reduce((sum, slot) => sum + slot.durationMinutes, 0)
}

export async function recalculateFreeTimeAtBoot(
  storage: Storage,
  now = new Date(),
): Promise<void> {
  const schedule = await storage.read('schedule')
  if (!schedule) return
  const levels = await storage.read('levels')
  const today = localDateKey(now)
  if (levels?.lastCalculatedDate === today) return

  const totalFreeMinutes = computeDayFreeMinutes(
    jsDateToDayOfWeek(now),
    schedule.entries,
    schedule.rules,
  )

  await storage.write('levels', {
    ...(levels?.objectives ? { objectives: levels.objectives } : {}),
    calculatedDailyFreeMinutes: totalFreeMinutes,
    calculatedAt: now.toISOString(),
    lastCalculatedDate: today,
    lastProcessedSessionId: levels?.lastProcessedSessionId ?? null,
    lastProcessedAppUsageByApp: levels?.lastProcessedAppUsageByApp ?? {},
  })
}

export async function getPreviousFreeMinutesByDate(
  storage: Storage,
  now = new Date(),
): Promise<Record<string, number> | undefined> {
  const schedule = await storage.read('schedule')
  if (!schedule) return undefined

  const yesterday = addDays(now, -1)
  const dayBefore = addDays(now, -2)
  return {
    [localDateKey(yesterday)]: computeDayFreeMinutes(
      jsDateToDayOfWeek(yesterday),
      schedule.entries,
      schedule.rules,
    ),
    [localDateKey(dayBefore)]: computeDayFreeMinutes(
      jsDateToDayOfWeek(dayBefore),
      schedule.entries,
      schedule.rules,
    ),
  }
}
