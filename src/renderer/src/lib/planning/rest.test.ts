import { describe, it, expect } from 'vitest'
import { computeBreakMinutes, computeRestFloor, computeWeeklyRest, computeFatigue, shouldResetFatigue } from './rest'

describe('Partie E — rest', () => {
  describe('E.1 computeBreakMinutes', () => {
    it('bloc 30 min → 5 min', () => expect(computeBreakMinutes(30)).toBe(5))
    it('bloc 50 min → 10 min', () => expect(computeBreakMinutes(50)).toBe(10))
    it('bloc 90 min → 20 min', () => expect(computeBreakMinutes(90)).toBe(20))
    it('bloc 100 min → 20 min', () => expect(computeBreakMinutes(100)).toBe(20))
    it('bloc 20 min → 0 min', () => expect(computeBreakMinutes(20)).toBe(0))
  })

  describe('E.2 computeRestFloor', () => {
    it('20% de 540 = 108', () => expect(computeRestFloor(540)).toBe(108))
    it('plancher absolu 60 min si capacité faible', () => expect(computeRestFloor(100)).toBe(60))
    it('plancher absolu 60 min si capacité très faible', () => expect(computeRestFloor(50)).toBe(60))
    it('capacité 600 → 120', () => expect(computeRestFloor(600)).toBe(120))
  })

  describe('E.3 computeWeeklyRest', () => {
    it('repos ≥ cible → aucune intervention', () => {
      const r = computeWeeklyRest({
        restTakenByDay: [{ date: 'd1', minutes: 500 }],
        totalWeeklyRawCapacity: 2000,
        highUtilizationDays: 0,
      })
      // cible = 20% × 2000 = 400. Repos pris = 500 ≥ 400.
      expect(r.adjustment).toBe('none')
    })

    it('repos < cible → jour réduit', () => {
      const r = computeWeeklyRest({
        restTakenByDay: [{ date: 'd1', minutes: 100 }],
        totalWeeklyRawCapacity: 2000,
        highUtilizationDays: 1,
      })
      // cible = 400. Repos = 100. Gap = -300.
      expect(r.adjustment).toBe('reduced_day')
      expect(r.reductionPercent).toBe(40)
    })

    it('≥5 jours à >85% → major_adjustment', () => {
      const r = computeWeeklyRest({
        restTakenByDay: [{ date: 'd1', minutes: 50 }],
        totalWeeklyRawCapacity: 2000,
        highUtilizationDays: 5,
      })
      expect(r.adjustment).toBe('major_adjustment')
    })
  })

  describe('E.4 computeFatigue', () => {
    it('0 jour consécutif → pas de pénalité', () => {
      const f = computeFatigue({ consecutiveHighDays: 0, effectiveCapacityMinutes: 400 })
      expect(f.penaltyMinutes).toBe(0)
      expect(f.reductionPercent).toBe(0)
    })

    it('2 jours consécutifs → jour 3 réduit de 25%', () => {
      const f = computeFatigue({ consecutiveHighDays: 2, effectiveCapacityMinutes: 400 })
      expect(f.reductionPercent).toBe(25)
      expect(f.penaltyMinutes).toBe(100) // 400 × 0.25
    })

    it('3 jours consécutifs → jour 4 forcé à max 40% (réduction 60%)', () => {
      const f = computeFatigue({ consecutiveHighDays: 3, effectiveCapacityMinutes: 400 })
      expect(f.reductionPercent).toBe(60)
      expect(f.penaltyMinutes).toBe(240)
    })

    it('crise (densité > 1) → plancher 60%, réduction plafonnée à 40%', () => {
      // 3 jours consécutifs + crise → réduction normalement 60%, mais plafonnée à 40% en crise.
      const f = computeFatigue({ consecutiveHighDays: 3, effectiveCapacityMinutes: 400, isCrisis: true })
      expect(f.reductionPercent).toBe(40) // plafonné, pas 60%
      expect(f.penaltyMinutes).toBe(160)
      expect(f.crisisFloorPercent).toBe(60)
    })

    it('2 jours + crise → 25% reste 25% (< 40% plafond)', () => {
      const f = computeFatigue({ consecutiveHighDays: 2, effectiveCapacityMinutes: 400, isCrisis: true })
      expect(f.reductionPercent).toBe(25) // pas plafonné car < 40%
    })
  })

  describe('E.4 shouldResetFatigue', () => {
    it('< 50% → reset', () => expect(shouldResetFatigue(40)).toBe(true))
    it('50% → pas de reset', () => expect(shouldResetFatigue(50)).toBe(false))
    it('85% → pas de reset', () => expect(shouldResetFatigue(85)).toBe(false))
  })
})
