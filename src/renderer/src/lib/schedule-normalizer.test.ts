import { describe, expect, it } from 'vitest'
import type { ScheduleState, TimeRule } from '@shared/schemas'
import { normalizeScheduleForDate } from './schedule-normalizer'
import { dayOfWeekForDateKey } from './planning-time-utils'

const date = '2026-06-22'
const createdAt = '2026-06-22T00:00:00.000Z'

function rule(id: string, name: string, categoryType: TimeRule['categoryType']): TimeRule {
  return { id, name, color: '#111111', categoryType, linkedProfileId: null, createdAt }
}

describe('schedule-normalizer', () => {
  it('convertit une activité normale en segment verrouillé', () => {
    const schoolRule = rule('11111111-1111-4111-8111-111111111111', 'École', 'school')
    const schedule: ScheduleState = {
      rules: [schoolRule],
      entries: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          ruleId: schoolRule.id,
          dayOfWeek: dayOfWeekForDateKey(date),
          startMinute: 540,
          endMinute: 900,
          createdAt,
        },
      ],
    }

    const segments = normalizeScheduleForDate({ date, schedule })

    expect(segments).toHaveLength(1)
    expect(segments[0]?.kind).toBe('school')
    expect(segments[0]?.locked).toBe(true)
    expect(segments[0]?.durationMinutes).toBe(360)
  })

  it('gère le sommeil qui traverse minuit', () => {
    const segments = normalizeScheduleForDate({
      date,
      settings: { sleepStart: '22:30', sleepEnd: '06:30' },
    })

    expect(segments.filter((segment) => segment.kind === 'sleep')).toHaveLength(2)
    expect(segments.some((segment) => segment.start.includes('22:30') && segment.end.includes('24:00'))).toBe(true)
    expect(segments.some((segment) => segment.start.includes('00:00') && segment.end.includes('06:30'))).toBe(true)
  })

  it('signale les chevauchements sans les supprimer silencieusement', () => {
    const segments = normalizeScheduleForDate({
      date,
      fixedActivities: [
        { id: 'a', label: 'Cours', startMinute: 600, endMinute: 720, kind: 'school' },
        { id: 'b', label: 'Rendez-vous', startMinute: 660, endMinute: 780 },
      ],
    })

    expect(segments).toHaveLength(2)
    expect(segments.some((segment) => segment.metadata?.conflict === true)).toBe(true)
  })

  it('laisse une journée sans planning vide au niveau normalizer', () => {
    expect(normalizeScheduleForDate({ date })).toEqual([])
  })
})
