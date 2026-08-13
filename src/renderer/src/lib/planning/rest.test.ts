import { describe, it, expect } from 'vitest'
import {
  computeBreakMinutes,
  computeFatigue,
  computeRestFloor,
  computeWeeklyBreathing,
  countConsecutiveHighDays,
  FATIGUE_CRISIS_FLOOR_PERCENT,
  shouldResetFatigue,
} from './rest'

describe('E.1 — micro-repos inclus dans le bloc', () => {
  it('25-50 min → 5 min, 50-90 → 10 min, 90+ → 20 min', () => {
    expect(computeBreakMinutes(25)).toBe(5)
    expect(computeBreakMinutes(49)).toBe(5)
    expect(computeBreakMinutes(50)).toBe(10)
    expect(computeBreakMinutes(89)).toBe(10)
    expect(computeBreakMinutes(90)).toBe(20)
    expect(computeBreakMinutes(120)).toBe(20)
  })

  it('sous 25 min, pas de pause à prévoir', () => {
    expect(computeBreakMinutes(20)).toBe(0)
  })
})

describe('E.2 — plancher quotidien de repos', () => {
  it('20 % de la capacité brute : 20 % de 960 = 192', () => {
    expect(computeRestFloor(960)).toBe(192)
  })

  it('jamais moins d’une heure, même sur une journée courte', () => {
    expect(computeRestFloor(100)).toBe(60)
    expect(computeRestFloor(0)).toBe(60)
  })
})

describe('E.3 — respiration hebdomadaire', () => {
  const day = (date: string, worked: number) => ({
    date,
    rawCapacityMinutes: 960,
    workedMinutes: worked,
  })

  it('repos déjà pris ≥ cible → aucune intervention', () => {
    const r = computeWeeklyBreathing({
      // 3 jours à 400 min travaillées : 3 × 560 = 1680 min de repos.
      elapsedDays: [day('2026-08-10', 400), day('2026-08-11', 400), day('2026-08-12', 400)],
      weekRawCapacityMinutes: 6720, // cible = 1344
      remainingDays: [{ date: '2026-08-13', demandMinutes: 300 }],
    })
    expect(r.targetMinutes).toBe(1344)
    expect(r.restTakenMinutes).toBe(1680)
    expect(r.adjustment).toBe('none')
    expect(r.reducedDates).toEqual([])
  })

  it('repos manquant → le jour restant le MOINS chargé est réduit à 40 %', () => {
    const r = computeWeeklyBreathing({
      elapsedDays: [day('2026-08-10', 900), day('2026-08-11', 900), day('2026-08-12', 900)],
      weekRawCapacityMinutes: 6720,
      remainingDays: [
        { date: '2026-08-13', demandMinutes: 400 },
        { date: '2026-08-14', demandMinutes: 120 },
      ],
    })
    expect(r.restTakenMinutes).toBe(180)
    expect(r.gapMinutes).toBe(180 - 1344)
    expect(r.adjustment).toBe('reduced')
    // Le 14 porte le moins de charge : c'est lui qu'on réduit, pas le dimanche.
    expect(r.reducedDates).toEqual(['2026-08-14'])
    expect(r.capPercent).toBe(40)
  })

  it('écart important (≥5 jours à >85 %) → l’ampleur augmente', () => {
    const heavy = ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14'].map((d) =>
      day(d, 900),
    )
    const r = computeWeeklyBreathing({
      elapsedDays: heavy,
      weekRawCapacityMinutes: 6720,
      remainingDays: [
        { date: '2026-08-15', demandMinutes: 400 },
        { date: '2026-08-16', demandMinutes: 100 },
      ],
    })
    expect(r.adjustment).toBe('major')
    expect(r.reducedDates).toHaveLength(2)
  })

  it('aucun jour restant → rien à programmer', () => {
    const r = computeWeeklyBreathing({
      elapsedDays: [day('2026-08-10', 960)],
      weekRawCapacityMinutes: 6720,
      remainingDays: [],
    })
    expect(r.adjustment).toBe('none')
  })
})

describe('E.4 — fatigue accumulée', () => {
  it('2 jours consécutifs >85 % → le suivant est réduit de 25 %', () => {
    const f = computeFatigue({ consecutiveHighDays: 2, effectiveCapacityBeforePenalty: 480 })
    expect(f.reductionPercent).toBe(25)
    expect(f.penaltyMinutes).toBe(120)
  })

  it('3 jours consécutifs → le suivant est plafonné à 40 %', () => {
    const f = computeFatigue({ consecutiveHighDays: 3, effectiveCapacityBeforePenalty: 480 })
    expect(f.reductionPercent).toBe(60)
    expect(f.penaltyMinutes).toBe(288) // il reste 192 = 40 % de 480
  })

  it('un seul jour chargé ne déclenche rien', () => {
    expect(
      computeFatigue({ consecutiveHighDays: 1, effectiveCapacityBeforePenalty: 480 })
        .penaltyMinutes,
    ).toBe(0)
  })

  it('une crise prouvée rogne la protection sans jamais l’annuler', () => {
    const f = computeFatigue({
      consecutiveHighDays: 3,
      effectiveCapacityBeforePenalty: 480,
      isCrisis: true,
    })
    // Plancher absolu : jamais sous 60 % de la capacité normale.
    expect(f.reductionPercent).toBe(100 - FATIGUE_CRISIS_FLOOR_PERCENT)
    expect(f.penaltyMinutes).toBe(192)
    expect(f.crisisReduced).toBe(true)
    expect(480 - f.penaltyMinutes).toBe(288)
  })

  it('une crise ne touche pas une protection déjà sous le plancher', () => {
    const f = computeFatigue({
      consecutiveHighDays: 2,
      effectiveCapacityBeforePenalty: 480,
      isCrisis: true,
    })
    expect(f.reductionPercent).toBe(25)
    expect(f.crisisReduced).toBe(false)
  })

  it('un jour sous 50 % remet le compteur à zéro', () => {
    expect(countConsecutiveHighDays([90, 90, 90])).toBe(3)
    expect(countConsecutiveHighDays([90, 90, 40, 90])).toBe(2)
    expect(countConsecutiveHighDays([40, 90, 90])).toBe(0)
    expect(countConsecutiveHighDays([90, 70, 90])).toBe(1)
    expect(shouldResetFatigue(49)).toBe(true)
    expect(shouldResetFatigue(50)).toBe(false)
  })
})
