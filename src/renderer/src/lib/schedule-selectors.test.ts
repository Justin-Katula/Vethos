import { describe, it, expect } from 'vitest'
import type { ScheduleState, TimeRule, ScheduleEntry } from '@shared/schemas'
import {
  getCurrentEntry,
  getNextChange,
  hasOverlap,
  snapTo15,
  entriesForDay,
  jsDateToDayOfWeek,
  dateToMinuteOfDay,
} from './schedule-selectors'

const RULE_A: TimeRule = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Travail',
  color: '#3b82f6',
  createdAt: '2026-05-05T00:00:00.000Z',
}
const RULE_B: TimeRule = {
  id: '22222222-2222-2222-2222-222222222222',
  name: 'Sport',
  color: '#ef4444',
  createdAt: '2026-05-05T00:00:00.000Z',
}

function entry(id: string, ruleId: string, dow: number, s: number, e: number): ScheduleEntry {
  return {
    id,
    ruleId,
    dayOfWeek: dow,
    startMinute: s,
    endMinute: e,
    createdAt: '2026-05-05T00:00:00.000Z',
  }
}

describe('jsDateToDayOfWeek', () => {
  it('maps Monday to 0', () => {
    expect(jsDateToDayOfWeek(new Date('2026-05-04T10:00:00'))).toBe(0) // 2026-05-04 = lundi
  })
  it('maps Sunday to 6', () => {
    expect(jsDateToDayOfWeek(new Date('2026-05-10T10:00:00'))).toBe(6)
  })
})

describe('dateToMinuteOfDay', () => {
  it('returns 0 at midnight', () => {
    expect(dateToMinuteOfDay(new Date('2026-05-04T00:00:00'))).toBe(0)
  })
  it('returns 600 at 10:00', () => {
    expect(dateToMinuteOfDay(new Date('2026-05-04T10:00:00'))).toBe(600)
  })
})

describe('getCurrentEntry', () => {
  const state: ScheduleState = {
    rules: [RULE_A, RULE_B],
    entries: [entry('e1', RULE_A.id, 0, 540, 720)], // lundi 9h-12h
  }

  it('returns null when no entry at given time', () => {
    expect(getCurrentEntry(state, new Date('2026-05-04T13:00:00'))).toBeNull()
  })
  it('returns entry + rule when inside range', () => {
    const r = getCurrentEntry(state, new Date('2026-05-04T10:00:00'))
    expect(r?.rule.id).toBe(RULE_A.id)
  })
  it('endMinute is exclusive', () => {
    expect(getCurrentEntry(state, new Date('2026-05-04T12:00:00'))).toBeNull()
  })
  it('returns null if rule has been deleted', () => {
    const orphan: ScheduleState = {
      rules: [],
      entries: [entry('e1', RULE_A.id, 0, 540, 720)],
    }
    expect(getCurrentEntry(orphan, new Date('2026-05-04T10:00:00'))).toBeNull()
  })
})

describe('getNextChange', () => {
  it('returns null when no entries', () => {
    expect(getNextChange({ rules: [], entries: [] }, new Date())).toBeNull()
  })
  it('returns end-of-current when inside an entry with no immediate follower', () => {
    const state: ScheduleState = {
      rules: [RULE_A],
      entries: [entry('e1', RULE_A.id, 0, 540, 720)],
    }
    const r = getNextChange(state, new Date('2026-05-04T10:00:00'))
    // lundi 12h00 → minuteOfWeek = 0*1440 + 720 = 720
    expect(r?.atMinuteOfWeek).toBe(720)
    expect(r?.rule).toBeNull()
  })
  it('prefers concurrent start over plain end', () => {
    const state: ScheduleState = {
      rules: [RULE_A, RULE_B],
      entries: [entry('e1', RULE_A.id, 0, 540, 720), entry('e2', RULE_B.id, 0, 720, 780)],
    }
    const r = getNextChange(state, new Date('2026-05-04T10:00:00'))
    expect(r?.atMinuteOfWeek).toBe(720)
    expect(r?.rule?.id).toBe(RULE_B.id)
  })
  it('wraps to next week when nothing left', () => {
    const state: ScheduleState = {
      rules: [RULE_A],
      entries: [entry('e1', RULE_A.id, 0, 540, 720)], // lundi 9h-12h
    }
    // Dimanche 23h → minuteOfWeek = 6*1440 + 23*60 = 9020
    const r = getNextChange(state, new Date('2026-05-10T23:00:00'))
    expect(r?.atMinuteOfWeek).toBe(540 + 10080)
    expect(r?.rule?.id).toBe(RULE_A.id)
  })
})

describe('hasOverlap', () => {
  const entries = [entry('e1', RULE_A.id, 0, 540, 720)] // lundi 9h-12h

  it('detects overlap inside', () => {
    expect(hasOverlap(entries, { dayOfWeek: 0, startMinute: 600, endMinute: 660 })).toBe(true)
  })
  it('accepts adjacent (end == start)', () => {
    expect(hasOverlap(entries, { dayOfWeek: 0, startMinute: 720, endMinute: 780 })).toBe(false)
    expect(hasOverlap(entries, { dayOfWeek: 0, startMinute: 480, endMinute: 540 })).toBe(false)
  })
  it('different days do not overlap', () => {
    expect(hasOverlap(entries, { dayOfWeek: 1, startMinute: 600, endMinute: 660 })).toBe(false)
  })
  it('ignores self when id matches', () => {
    expect(
      hasOverlap(entries, { id: 'e1', dayOfWeek: 0, startMinute: 600, endMinute: 720 }),
    ).toBe(false)
  })
})

describe('snapTo15', () => {
  it('snaps down', () => {
    expect(snapTo15(0)).toBe(0)
    expect(snapTo15(7)).toBe(0)
    expect(snapTo15(8)).toBe(0)
    expect(snapTo15(14)).toBe(0)
    expect(snapTo15(15)).toBe(15)
    expect(snapTo15(22)).toBe(15)
    expect(snapTo15(30)).toBe(30)
  })
})

describe('entriesForDay', () => {
  it('filters and sorts', () => {
    const entries = [
      entry('e1', RULE_A.id, 0, 600, 660),
      entry('e2', RULE_A.id, 1, 540, 720),
      entry('e3', RULE_A.id, 0, 540, 600),
    ]
    const r = entriesForDay(entries, 0)
    expect(r.map((e) => e.id)).toEqual(['e3', 'e1'])
  })
})
