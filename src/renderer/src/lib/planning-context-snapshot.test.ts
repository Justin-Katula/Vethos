import { describe, expect, it } from 'vitest'
import type { ScheduleState, TimeRule } from '@shared/schemas'
import { buildPlanningContextV2 } from './planning-context-snapshot'
import { dayOfWeekForDateKey } from './planning-time-utils'

const createdAt = '2026-06-22T00:00:00.000Z'

function rule(id: string, name: string, categoryType: TimeRule['categoryType']): TimeRule {
  return { id, name, color: '#222222', categoryType, linkedProfileId: null, createdAt }
}

describe('planning-context-snapshot', () => {
  it('construit un snapshot recalculable sur une semaine', () => {
    const school = rule('11111111-1111-4111-8111-111111111111', 'École', 'school')
    const schedule: ScheduleState = {
      rules: [school],
      entries: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          ruleId: school.id,
          dayOfWeek: dayOfWeekForDateKey('2026-06-22'),
          startMinute: 540,
          endMinute: 900,
          createdAt,
        },
      ],
    }

    const context = buildPlanningContextV2({
      userId: 'user',
      dateRange: { startDate: '2026-06-22', endDate: '2026-06-28' },
      schedule,
      settings: { sleepStart: '22:30', sleepEnd: '06:30' },
      now: new Date('2026-06-22T12:00:00.000Z'),
    })

    expect(context.days).toHaveLength(7)
    expect(context.metadata.source).toBe('planning_context_builder')
    expect(context.weeklySummary.rawFreeMinutes).toBeGreaterThan(0)
    expect(context.rulesApplied.some((ruleResult) => ruleResult.rule === 'daily_capacity_limit')).toBe(true)
  })

  it('reste stable avec un now fixé', () => {
    const first = buildPlanningContextV2({
      userId: 'user',
      dateRange: { startDate: '2026-06-22', endDate: '2026-06-22' },
      now: new Date('2026-06-22T12:00:00.000Z'),
    })
    const second = buildPlanningContextV2({
      userId: 'user',
      dateRange: { startDate: '2026-06-22', endDate: '2026-06-22' },
      now: new Date('2026-06-22T12:00:00.000Z'),
    })

    expect(second).toEqual(first)
  })
})
