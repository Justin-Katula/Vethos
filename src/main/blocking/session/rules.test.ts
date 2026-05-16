import { describe, expect, it } from 'vitest'
import type { BlockingHistoryEntry } from '@shared/schemas'
import { evaluateSessionRules } from './rules'

function session(profileId: string, startedAt: string, endedAt: string): BlockingHistoryEntry {
  return {
    sessionId: crypto.randomUUID(),
    profileId,
    startedAt,
    endedAt,
    completedNormally: true,
  }
}

describe('evaluateSessionRules', () => {
  it('blocks beyond 4h on the same project', () => {
    const out = evaluateSessionRules({
      history: [
        session('a', '2026-05-13T08:00:00.000Z', '2026-05-13T11:00:00.000Z'),
      ],
      profileId: 'a',
      requestedMinutes: 90,
      now: new Date('2026-05-13T11:30:00.000Z'),
    })

    expect(out).toMatchObject({ ok: false, restMinutes: 30 })
  })

  it('blocks beyond 6h across all projects', () => {
    const out = evaluateSessionRules({
      history: [
        session('a', '2026-05-13T08:00:00.000Z', '2026-05-13T11:00:00.000Z'),
        session('b', '2026-05-13T12:00:00.000Z', '2026-05-13T15:00:00.000Z'),
      ],
      profileId: 'c',
      requestedMinutes: 30,
      now: new Date('2026-05-13T15:30:00.000Z'),
    })

    expect(out).toMatchObject({ ok: false, restMinutes: 90 })
  })

  it('allows a new session after the required same-project rest', () => {
    const out = evaluateSessionRules({
      history: [
        session('a', '2026-05-13T08:00:00.000Z', '2026-05-13T11:00:00.000Z'),
      ],
      profileId: 'a',
      requestedMinutes: 90,
      now: new Date('2026-05-13T12:01:00.000Z'),
    })

    expect(out).toEqual({ ok: true })
  })

  it('blocks the third day when the previous two days had no free time', () => {
    const out = evaluateSessionRules({
      history: [],
      profileId: 'a',
      requestedMinutes: 60,
      now: new Date('2026-05-13T16:00:00.000Z'),
      freeMinutesByDate: {
        '2026-05-12': 0,
        '2026-05-11': 0,
      },
    })

    expect(out).toMatchObject({ ok: false, restMinutes: 1440 })
  })

  it('allows normal session requests', () => {
    const out = evaluateSessionRules({
      history: [],
      profileId: 'a',
      requestedMinutes: 60,
      now: new Date('2026-05-13T16:00:00.000Z'),
    })

    expect(out).toEqual({ ok: true })
  })
})
