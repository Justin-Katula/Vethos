import { describe, it, expect } from 'vitest'
import {
  addDays,
  dateKey,
  datesBetween,
  dayOfWeek,
  daysBetween,
  minutesUntilEndOf,
  startOfWeek,
  weekKey,
} from './dates'

describe('dates — arithmétique locale', () => {
  it('dateKey rend la date LOCALE, pas la date UTC', () => {
    // 11 août 2026, 23 h 30 locales. En UTC-6 c'est déjà le 12 en UTC :
    // passer par toISOString() décalait tout le planning d'un jour.
    expect(dateKey(new Date(2026, 7, 11, 23, 30))).toBe('2026-08-11')
    expect(dateKey(new Date(2026, 7, 11, 0, 15))).toBe('2026-08-11')
  })

  it('addDays traverse les fins de mois', () => {
    expect(addDays('2026-08-30', 3)).toBe('2026-09-02')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('daysBetween compte des jours entiers, signés', () => {
    expect(daysBetween('2026-08-11', '2026-08-18')).toBe(7)
    expect(daysBetween('2026-08-18', '2026-08-11')).toBe(-7)
  })

  it('datesBetween rend les bornes incluses', () => {
    expect(datesBetween('2026-08-11', '2026-08-13')).toEqual([
      '2026-08-11',
      '2026-08-12',
      '2026-08-13',
    ])
    expect(datesBetween('2026-08-13', '2026-08-11')).toEqual([])
  })

  it('dayOfWeek : 0 = lundi', () => {
    // Le 10 août 2026 est un lundi.
    expect(dayOfWeek('2026-08-10')).toBe(0)
    expect(dayOfWeek('2026-08-11')).toBe(1)
    expect(dayOfWeek('2026-08-16')).toBe(6)
  })

  it('startOfWeek remonte au lundi', () => {
    expect(startOfWeek('2026-08-13')).toBe('2026-08-10')
    expect(startOfWeek('2026-08-10')).toBe('2026-08-10')
    expect(weekKey('2026-08-16')).toBe('2026-08-10')
  })

  it('minutesUntilEndOf : la deadline échoit à la fin de sa journée', () => {
    // Aujourd'hui 10 h 00, deadline aujourd'hui → 14 h restantes = 840 min.
    expect(minutesUntilEndOf('2026-08-11', '2026-08-11', 600)).toBe(840)
    // Deadline demain, même heure → 840 + 1440.
    expect(minutesUntilEndOf('2026-08-12', '2026-08-11', 600)).toBe(2280)
  })
})
