import { describe, it, expect } from 'vitest'
import {
  computeRawCapacity,
  filterUsableSlots,
  computeUnusableMinutes,
  computeEffectiveCapacity,
  buildDayCapacity,
  reclassifyCognitiveWindow,
  FRAGMENT_THRESHOLDS,
} from './capacity'
import type { TimeSlot } from './types'

const slot = (start: number, end: number): TimeSlot => ({
  startMinute: start,
  endMinute: end,
  durationMinutes: end - start,
  cognitiveWindow: 'NORMALE',
})

describe('Partie A — capacity', () => {
  describe('A.1 computeRawCapacity', () => {
    it('1440 − 8h sommeil − 7h école = 540 min', () => {
      // Sommeil 8h = 480 min, école 7h = 420 min
      expect(computeRawCapacity(480 + 420)).toBe(540)
    })

    it('retourne 0 si tout est occupé', () => {
      expect(computeRawCapacity(1440)).toBe(0)
    })

    it('retourne 0 si surchargé (negative clamp)', () => {
      expect(computeRawCapacity(1500)).toBe(0)
    })
  })

  describe('A.2 filterUsableSlots', () => {
    it('exclut les fragments < 25 min (deep work)', () => {
      const slots = [slot(0, 15), slot(15, 90), slot(90, 100), slot(100, 200)]
      const usable = filterUsableSlots(slots, FRAGMENT_THRESHOLDS.deepWork)
      expect(usable).toHaveLength(2) // 75 min et 100 min
      expect(usable[0]?.durationMinutes).toBe(75)
    })

    it('garde tout si seuil = 10 (light work)', () => {
      const slots = [slot(0, 12), slot(12, 90)]
      const usable = filterUsableSlots(slots, FRAGMENT_THRESHOLDS.lightWork)
      expect(usable).toHaveLength(2)
    })

    it('exclut un fragment exactement égal au seuil - 1', () => {
      const slots = [slot(0, 24), slot(24, 100)]
      const usable = filterUsableSlots(slots, 25)
      expect(usable).toHaveLength(1)
      expect(usable[0]?.durationMinutes).toBe(76)
    })
  })

  describe('A.2 computeUnusableMinutes', () => {
    it('somme les minutes des fragments < seuil', () => {
      const slots = [slot(0, 15), slot(15, 90), slot(90, 95)]
      expect(computeUnusableMinutes(slots, 25)).toBe(20) // 15 + 5
    })

    it('0 si tous les fragments sont utilisables', () => {
      const slots = [slot(0, 90), slot(90, 200)]
      expect(computeUnusableMinutes(slots, 25)).toBe(0)
    })
  })

  describe('A.3 computeEffectiveCapacity', () => {
    it('540 brute − 30 inutilisable − 108 repos(20%) − 0 fatigue = 402', () => {
      // repos = 20% de 540 = 108
      expect(computeEffectiveCapacity(540, 30, 108, 0)).toBe(402)
    })

    it('avec fatigue : 540 − 30 − 108 − 135 = 267', () => {
      // fatigue = 25% de la capacité effective de base (540-30-108=402, ×0.25=100.5≈101)
      // Non : fatiguePenaltyMinutes est passé en paramètre directement
      expect(computeEffectiveCapacity(540, 30, 108, 135)).toBe(267)
    })

    it('jamais négatif', () => {
      expect(computeEffectiveCapacity(100, 50, 60, 50)).toBe(0)
    })
  })

  describe('A.3 buildDayCapacity', () => {
    it('assemble tous les composants', () => {
      const dc = buildDayCapacity({
        date: '2026-07-27',
        rawCapacity: 540,
        freeSlots: [slot(0, 20), slot(20, 200)], // 20min (inutilisable) + 180min
        restReservedMinutes: 108,
        fatiguePenaltyMinutes: 0,
      })
      expect(dc.date).toBe('2026-07-27')
      expect(dc.rawCapacityMinutes).toBe(540)
      expect(dc.usableCapacityMinutes).toBe(412) // 540 - 20 - 108 - 0 = 412
      expect(dc.slots).toHaveLength(1) // seul le 180min passe le seuil
      expect(dc.slots[0]?.durationMinutes).toBe(180)
    })
  })

  describe('A.4 reclassifyCognitiveWindow', () => {
    it('retourne NORMALE si < 5 observations (prudence G.3)', () => {
      const obs = new Map([[14, [{ completed: true }, { completed: true }, { completed: true }, { completed: true }]]])
      expect(reclassifyCognitiveWindow(14, obs)).toBe('NORMALE')
    })

    it('PROFONDE si ≥ 75% complétion (5 obs)', () => {
      const obs = new Map([[9, [
        { completed: true }, { completed: true }, { completed: true }, { completed: true }, { completed: true },
      ]]])
      expect(reclassifyCognitiveWindow(9, obs)).toBe('PROFONDE')
    })

    it('BASSE si < 50% complétion (5 obs)', () => {
      const obs = new Map([[22, [
        { completed: false }, { completed: false }, { completed: false }, { completed: true }, { completed: false },
      ]]])
      expect(reclassifyCognitiveWindow(22, obs)).toBe('BASSE')
    })

    it('NORMALE si entre 50% et 75%', () => {
      const obs = new Map([[14, [
        { completed: true }, { completed: false }, { completed: true }, { completed: true }, { completed: false },
      ]]])
      // 3/5 = 60% → NORMALE
      expect(reclassifyCognitiveWindow(14, obs)).toBe('NORMALE')
    })
  })
})
