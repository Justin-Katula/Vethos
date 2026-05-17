import { describe, it, expect } from 'vitest'
import type { BlockingHistoryEntry } from '@shared/schemas'
import { computeLongestStreak } from './streak'

function entry(endedAt: string, completedNormally = true): BlockingHistoryEntry {
  return {
    sessionId: crypto.randomUUID(),
    profileId: crypto.randomUUID(),
    startedAt: endedAt,
    endedAt,
    completedNormally,
  }
}

describe('computeLongestStreak', () => {
  it('renvoie 0 pour un historique vide', () => {
    expect(computeLongestStreak([])).toBe(0)
  })

  it('renvoie 1 pour une seule session terminée normalement', () => {
    expect(computeLongestStreak([entry('2026-05-13T10:00:00.000Z')])).toBe(1)
  })

  it('compte les jours consécutifs', () => {
    const streak = computeLongestStreak([
      entry('2026-05-11T10:00:00.000Z'),
      entry('2026-05-12T10:00:00.000Z'),
      entry('2026-05-13T10:00:00.000Z'),
    ])
    expect(streak).toBe(3)
  })

  it('un jour manquant casse la série', () => {
    const streak = computeLongestStreak([
      entry('2026-05-11T10:00:00.000Z'),
      entry('2026-05-12T10:00:00.000Z'),
      // 2026-05-13 manquant
      entry('2026-05-14T10:00:00.000Z'),
    ])
    expect(streak).toBe(2)
  })

  it('ignore les sessions non terminées normalement', () => {
    const streak = computeLongestStreak([
      entry('2026-05-11T10:00:00.000Z', true),
      entry('2026-05-12T10:00:00.000Z', false),
      entry('2026-05-13T10:00:00.000Z', true),
    ])
    // 11 et 13 comptent, 12 non → pas de série de 3, max = 1
    expect(streak).toBe(1)
  })
})
