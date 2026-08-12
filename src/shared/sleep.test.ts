import { describe, it, expect } from 'vitest'
import { isWithinSleep, parseHHMM, sleepIntervals, sleepScheduleEntries } from './sleep'

describe('sommeil — source unique', () => {
  it('parseHHMM lit une heure valide et rejette le reste', () => {
    expect(parseHHMM('23:30')).toBe(1410)
    expect(parseHHMM('07:00')).toBe(420)
    expect(parseHHMM('24:00')).toBeNull()
    expect(parseHHMM('7:00')).toBeNull()
    expect(parseHHMM(undefined)).toBeNull()
  })

  it('une nuit qui traverse minuit se lit en deux morceaux', () => {
    expect(sleepIntervals('23:00', '07:00')).toEqual([
      { startMinute: 0, endMinute: 420 },
      { startMinute: 1380, endMinute: 1440 },
    ])
  })

  it('une sieste dans la journée reste un seul morceau', () => {
    expect(sleepIntervals('13:00', '14:30')).toEqual([{ startMinute: 780, endMinute: 870 }])
  })

  it('A.1 : 23 h → 7 h retire bien 480 minutes par jour', () => {
    const entries = sleepScheduleEntries('23:00', '07:00')
    expect(entries).toHaveLength(14) // 2 morceaux × 7 jours
    const lundi = entries.filter((e) => e.dayOfWeek === 0)
    expect(lundi.reduce((s, e) => s + (e.endMinute - e.startMinute), 0)).toBe(480)
    expect(lundi.every((e) => e.categoryType === 'sleep')).toBe(true)
  })

  it('CRITÈRE 3 : les heures de sommeil sont reconnues, minuit compris', () => {
    expect(isWithinSleep(new Date(2026, 7, 11, 23, 30), '23:00', '07:00')).toBe(true)
    expect(isWithinSleep(new Date(2026, 7, 11, 3, 0), '23:00', '07:00')).toBe(true)
    expect(isWithinSleep(new Date(2026, 7, 11, 6, 59), '23:00', '07:00')).toBe(true)
    expect(isWithinSleep(new Date(2026, 7, 11, 7, 0), '23:00', '07:00')).toBe(false)
    expect(isWithinSleep(new Date(2026, 7, 11, 14, 0), '23:00', '07:00')).toBe(false)
  })

  it('sans heures connues, aucune plage n’est protégée', () => {
    expect(isWithinSleep(new Date(), undefined, undefined)).toBe(false)
  })
})
