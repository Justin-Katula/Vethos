import { describe, expect, it } from 'vitest'
import { computeFatigueRecoveryPlan, minutesAfterBedtime } from './circadian-planning'

describe('circadian-planning', () => {
  it('calcule le retard apres une heure de coucher meme apres minuit', () => {
    expect(minutesAfterBedtime(30, 23 * 60 + 30)).toBe(60)
    expect(minutesAfterBedtime(22 * 60, 23 * 60 + 30)).toBe(0)
  })

  it('reduit la charge du jour de reveil apres un coucher tardif detecte', () => {
    const plan = computeFatigueRecoveryPlan({
      bedtimeMinute: 23 * 60,
      now: new Date('2026-05-19T15:00:00.000Z'),
      sessions: [
        {
          sleepStartedAt: '2026-05-19T07:00:00.000Z',
          wokeAt: '2026-05-19T14:00:00.000Z',
          durationMinutes: 420,
          isFreeDay: false,
          source: 'idle-poll',
        },
      ],
    })

    expect(plan).toEqual({
      recoveryDate: '2026-05-19',
      reductionMinutes: 60,
      sleepDebtMinutes: 120,
    })
  })
})
