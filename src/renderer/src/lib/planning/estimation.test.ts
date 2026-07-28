import { describe, it, expect } from 'vitest'
import {
  computeCorrectionFactor,
  pertEstimate,
  planificationPercentile,
  computePlannedDuration,
  autoSplit,
  estimateTask,
  DEFAULT_FACTORS,
} from './estimation'
import type { DurationRealSource } from './types'

describe('Partie B — estimation', () => {
  describe('B.1 computeCorrectionFactor', () => {
    it('retourne défaut ×1.4 si <5 obs (routine)', () => {
      const result = computeCorrectionFactor({
        category: 'maths',
        observations: [{ estimatedMinutes: 60, actualMinutes: 70 }],
        defaultFactor: DEFAULT_FACTORS.routine,
      })
      expect(result.factor).toBe(1.4)
      expect(result.confidence).toBe('low')
    })

    it('calcule la médiane avec 5+ obs', () => {
      // Ratios : 1.0, 1.1, 1.2, 1.5, 2.0 → médiane = 1.2
      const result = computeCorrectionFactor({
        category: 'maths',
        observations: [
          { estimatedMinutes: 100, actualMinutes: 100 }, // 1.0
          { estimatedMinutes: 100, actualMinutes: 110 }, // 1.1
          { estimatedMinutes: 100, actualMinutes: 120 }, // 1.2
          { estimatedMinutes: 100, actualMinutes: 150 }, // 1.5
          { estimatedMinutes: 100, actualMinutes: 200 }, // 2.0
        ],
      })
      expect(result.factor).toBe(1.2)
      expect(result.confidence).toBe('medium') // 5-9 obs
    })

    it('confiance high à 10+ obs', () => {
      const obs = Array.from({ length: 10 }, (_, i) => ({
        estimatedMinutes: 60,
        actualMinutes: 60 + i * 6, // ratios croissants 1.0 à 1.54
      }))
      const result = computeCorrectionFactor({ category: 'codage', observations: obs })
      expect(result.confidence).toBe('high')
    })

    it('clampe entre 0.5 et 3', () => {
      const result = computeCorrectionFactor({
        category: 'x',
        observations: [
          { estimatedMinutes: 100, actualMinutes: 500 }, // ratio 5.0
          { estimatedMinutes: 100, actualMinutes: 500 },
          { estimatedMinutes: 100, actualMinutes: 500 },
          { estimatedMinutes: 100, actualMinutes: 500 },
          { estimatedMinutes: 100, actualMinutes: 500 },
        ],
      })
      expect(result.factor).toBe(3) // clampé à 3
    })
  })

  describe('B.3 pertEstimate', () => {
    it('(30 + 4×60 + 120) / 6 = 65', () => {
      expect(pertEstimate(30, 60, 120)).toBe(65)
    })

    it('(20 + 4×45 + 90) / 6 = 48', () => {
      expect(pertEstimate(20, 45, 90)).toBe(48)
    })
  })

  describe('B.4 planificationPercentile', () => {
    it('75e percentile avec 5+ obs', () => {
      // Ratios triés : 1.0, 1.1, 1.2, 1.5, 2.0
      // 75e percentile = idx 3.0 → 1.5 (interpolation entre index 3 et 4, frac=0)
      const result = planificationPercentile({
        observations: [
          { estimatedMinutes: 100, actualMinutes: 100 },
          { estimatedMinutes: 100, actualMinutes: 110 },
          { estimatedMinutes: 100, actualMinutes: 120 },
          { estimatedMinutes: 100, actualMinutes: 150 },
          { estimatedMinutes: 100, actualMinutes: 200 },
        ],
        percentile: 0.75,
      })
      expect(result).toBe(1.5)
    })

    it('retourne défaut si <5 obs', () => {
      const result = planificationPercentile({
        observations: [{ estimatedMinutes: 60, actualMinutes: 70 }],
        percentile: 0.75,
        defaultFactor: 1.7,
      })
      expect(result).toBe(1.7)
    })
  })

  describe('B.1 computePlannedDuration', () => {
    it('60 min × 1.4 = 84 min', () => {
      expect(computePlannedDuration({ userEstimate: 60, correctionFactor: 1.4 })).toBe(84)
    })

    it('30 min × 1.7 = 51 min', () => {
      expect(computePlannedDuration({ userEstimate: 30, correctionFactor: 1.7 })).toBe(51)
    })

    it('jamais sous 1', () => {
      expect(computePlannedDuration({ userEstimate: 0, correctionFactor: 1 })).toBe(1)
    })
  })

  describe('B.5 autoSplit', () => {
    it('pas de découpage si ≤ 90 min', () => {
      const result = autoSplit({ totalMinutes: 90 })
      expect(result.needsSplit).toBe(false)
      expect(result.blocks).toEqual([90])
    })

    it('découpe 200 min en 90+90+20→90+90+25(min)', () => {
      // 200 > 90 → 90, reste 110 → 90, reste 20 → < 25, fusionne avec dernier : 90+110
      const result = autoSplit({ totalMinutes: 200, maxBlockMinutes: 90, minBlockMinutes: 25 })
      expect(result.needsSplit).toBe(true)
      expect(result.blocks.length).toBeGreaterThanOrEqual(2)
      // Tous les blocs ≥ 25 ou c'est le seul
      expect(result.blocks.every((b) => b >= 25)).toBe(true)
    })

    it('découpe 300 min en 90×3+30', () => {
      const result = autoSplit({ totalMinutes: 300, maxBlockMinutes: 90, minBlockMinutes: 25 })
      expect(result.blocks.length).toBe(4) // 90+90+90+30
      expect(result.blocks[0]).toBe(90)
    })

    it('50 min seul, pas de split', () => {
      const result = autoSplit({ totalMinutes: 50 })
      expect(result.needsSplit).toBe(false)
    })
  })

  describe('estimateTask convenience', () => {
    it('utilise facteur défaut sans observations', () => {
      const result = estimateTask({
        taskId: 't1',
        userEstimate: 60,
        category: 'maths',
        hasDeadline: true,
        observations: [],
      })
      expect(result.plannedDuration).toBe(84) // 60 × 1.4
      expect(result.confidence).toBe('low')
    })

    it('avec stub DurationRealSource', () => {
      const stub: DurationRealSource = {
        getActualMinutes: () => null,
      }
      const result = estimateTask({
        taskId: 't1',
        userEstimate: 100,
        category: 'codage',
        hasDeadline: false,
        observations: [],
        durationSource: stub,
      })
      expect(result.plannedDuration).toBe(140) // 100 × 1.4
    })
  })
})
