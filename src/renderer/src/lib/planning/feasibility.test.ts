import { describe, it, expect } from 'vitest'
import {
  computeMargin,
  validateImportance,
  computeDensities,
  diagnoseDeficit,
  produceSignals,
  postPlacementCheck,
  buildFeasibilityResult,
} from './feasibility'

describe('Partie C — feasibility', () => {
  describe('C.1 computeMargin', () => {
    it('marge > 0 → comfortable', () => {
      const r = computeMargin(300, 120)
      expect(r.marginMinutes).toBe(180)
      expect(r.status).toBe('comfortable')
      expect(r.urgency).toBeCloseTo(1 / 180)
    })

    it('marge = 0 → now', () => {
      const r = computeMargin(120, 120)
      expect(r.marginMinutes).toBe(0)
      expect(r.status).toBe('now')
      expect(r.urgency).toBe(Infinity)
    })

    it('marge < 0 → overdue', () => {
      const r = computeMargin(60, 120)
      expect(r.marginMinutes).toBe(-60)
      expect(r.status).toBe('overdue')
      expect(r.urgency).toBe(Infinity)
    })
  })

  describe('C.1.1 validateImportance', () => {
    it('accepte 1-10', () => {
      for (let i = 1; i <= 10; i++) expect(validateImportance(i)).toBe(true)
    })
    it('rejette 0, 11, 3.5', () => {
      expect(validateImportance(0)).toBe(false)
      expect(validateImportance(11)).toBe(false)
      expect(validateImportance(3.5)).toBe(false)
    })
  })

  describe('C.2 computeDensities', () => {
    it('densité ≤ 1 → faisable', () => {
      const densities = computeDensities({
        tasks: [{ taskId: 't1', deadline: '2026-07-30', remainingMinutes: 120 }],
        cumulativeCapacity: [{ date: '2026-07-30', capacityMinutes: 200 }],
        today: '2026-07-27',
      })
      expect(densities).toHaveLength(1)
      expect(densities[0]?.density).toBe(0.6)
      expect(densities[0]?.feasible).toBe(true)
    })

    it('densité > 1 → impossible', () => {
      const densities = computeDensities({
        tasks: [{ taskId: 't1', deadline: '2026-07-30', remainingMinutes: 300 }],
        cumulativeCapacity: [{ date: '2026-07-30', capacityMinutes: 200 }],
        today: '2026-07-27',
      })
      expect(densities[0]?.density).toBe(1.5)
      expect(densities[0]?.feasible).toBe(false)
    })

    it('cumule le travail de toutes les tâches ≤ deadline', () => {
      const densities = computeDensities({
        tasks: [
          { taskId: 't1', deadline: '2026-07-28', remainingMinutes: 100 },
          { taskId: 't2', deadline: '2026-07-30', remainingMinutes: 150 },
        ],
        cumulativeCapacity: [
          { date: '2026-07-28', capacityMinutes: 150 },
          { date: '2026-07-30', capacityMinutes: 400 },
        ],
        today: '2026-07-27',
      })
      // 2 deadlines distinctes
      expect(densities).toHaveLength(2)
      // Deadline 07-28 : charge = 100 (t1 seul), cap = 150 → 0.67
      expect(densities[0]?.loadMinutes).toBe(100)
      // Deadline 07-30 : charge = 100 + 150 = 250, cap = 400 → 0.625
      expect(densities[1]?.loadMinutes).toBe(250)
      expect(densities[1]?.density).toBeCloseTo(0.625)
    })
  })

  describe('C.3 diagnoseDeficit', () => {
    it('retourne null si faisable', () => {
      const d = diagnoseDeficit(
        { deadline: '2026-07-30', loadMinutes: 100, capacityMinutes: 200, density: 0.5, feasible: true },
        [],
      )
      expect(d).toBeNull()
    })

    it('produit déficit chiffré + options quand density > 1', () => {
      const d = diagnoseDeficit(
        { deadline: '2026-07-30', loadMinutes: 300, capacityMinutes: 200, density: 1.5, feasible: false },
        [
          { title: 'Maths', remainingMinutes: 200, deadline: '2026-07-30' },
          { title: 'Physique', remainingMinutes: 100, deadline: '2026-07-30' },
        ],
      )
      expect(d).not.toBeNull()
      expect(d!.deficitMinutes).toBe(100)
      expect(d!.severity).toBe('critical') // 100/200 = 50% > 30%
      expect(d!.options.length).toBeGreaterThanOrEqual(2)
    })

    it('déficit < 10% → passive', () => {
      const d = diagnoseDeficit(
        { deadline: '2026-07-30', loadMinutes: 210, capacityMinutes: 200, density: 1.05, feasible: false },
        [{ title: 'T', remainingMinutes: 210, deadline: '2026-07-30' }],
      )
      expect(d!.severity).toBe('passive') // 10/200 = 5% < 10%
    })
  })

  describe('C.3.4 produceSignals', () => {
    it('produit density_deficit en severity high/critical', () => {
      const signals = produceSignals({
        densities: [],
        deficits: [{
          deadline: '2026-07-30',
          deficitMinutes: 100,
          severity: 'critical' as const,
          options: [],
        }],
        anchorMissCounts: {},
        objectivesServed: [],
      })
      expect(signals).toHaveLength(1)
      expect(signals[0]?.type).toBe('density_deficit')
      expect(signals[0]?.severity).toBe('critical')
    })

    it('produit anchor_missed_3x quand count ≥ 3', () => {
      const signals = produceSignals({
        densities: [],
        deficits: [],
        anchorMissCounts: { 'ancre-1': 3 },
        objectivesServed: [],
      })
      expect(signals[0]?.type).toBe('anchor_missed_3x')
      expect(signals[0]?.severity).toBe('passive')
    })

    it('produit objective_stalled quand 3+ jours sans service', () => {
      const signals = produceSignals({
        densities: [],
        deficits: [],
        anchorMissCounts: {},
        objectivesServed: [{ objectiveId: 'o1', name: 'Sport', quotaMet: false, daysSinceLastService: 3 }],
      })
      expect(signals[0]?.type).toBe('objective_stalled')
      expect(signals[0]?.severity).toBe('passive')
    })

    it('ne produit rien si tout va bien', () => {
      const signals = produceSignals({
        densities: [],
        deficits: [],
        anchorMissCounts: {},
        objectivesServed: [],
      })
      expect(signals).toHaveLength(0)
    })
  })

  describe('C.4 postPlacementCheck', () => {
    it('undefined si placed == planned', () => {
      expect(postPlacementCheck(200, 200)).toBeUndefined()
    })

    it('retourne le diff si placed ≠ planned', () => {
      const result = postPlacementCheck(180, 200)
      expect(result).toEqual({ expected: 200, actual: 180, diff: 20 })
    })
  })

  describe('buildFeasibilityResult', () => {
    it('assemble un résultat complet', () => {
      const result = buildFeasibilityResult({
        tasks: [{ taskId: 't1', title: 'Maths', deadline: '2026-07-30', remainingMinutes: 300 }],
        cumulativeCapacity: [{ date: '2026-07-30', capacityMinutes: 200 }],
        today: '2026-07-27',
        anchorMissCounts: {},
        objectivesServed: [],
      })
      expect(result.globallyFeasible).toBe(false)
      expect(result.deficits).toHaveLength(1)
      expect(result.deficits[0]?.deficitMinutes).toBe(100)
    })
  })
})
