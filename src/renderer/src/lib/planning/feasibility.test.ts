import { describe, it, expect } from 'vitest'
import {
  buildFeasibilityResult,
  computeDensities,
  computeMargin,
  diagnoseDeficit,
  postPlacementCheck,
  produceSignals,
  severityFor,
  validateImportance,
} from './feasibility'

const NOW = new Date(2026, 7, 11, 10, 0)

describe('C.1 — marge et urgence', () => {
  it('marge > 0 → du jeu', () => {
    expect(computeMargin(300, 120)).toMatchObject({ marginMinutes: 180, marginStatus: 'comfortable' })
  })

  it('marge = 0 → commencer maintenant, urgence maximale', () => {
    const m = computeMargin(120, 120)
    expect(m.marginMinutes).toBe(0)
    expect(m.marginStatus).toBe('now')
    expect(m.urgency).toBe(Number.POSITIVE_INFINITY)
  })

  it('marge < 0 → prouvé en retard', () => {
    expect(computeMargin(60, 120)).toMatchObject({ marginMinutes: -60, marginStatus: 'overdue' })
  })

  it('l’urgence est l’inverse de la marge, jamais un calcul séparé', () => {
    expect(computeMargin(200, 100).urgency).toBeCloseTo(1 / 100, 10)
  })
})

describe('C.1.1 — importance', () => {
  it('entier de 1 à 10, rien d’autre', () => {
    expect(validateImportance(1)).toBe(true)
    expect(validateImportance(10)).toBe(true)
    expect(validateImportance(0)).toBe(false)
    expect(validateImportance(11)).toBe(false)
    expect(validateImportance(5.5)).toBe(false)
  })
})

describe('C.2 — test de charge', () => {
  const capacity = [
    { date: '2026-08-11', capacityMinutes: 200 },
    { date: '2026-08-12', capacityMinutes: 200 },
    { date: '2026-08-13', capacityMinutes: 200 },
  ]

  it('la capacité d’une période est la SOMME des jours, pas la somme des cumuls', () => {
    // Trois jours à 200 min : 600 min disponibles. Sommer des cumuls
    // (200 + 400 + 600 = 1200) doublait la capacité et déclarait faisables des
    // plans qui ne l'étaient pas.
    const [point] = computeDensities({
      tasks: [{ deadline: '2026-08-13', remainingMinutes: 600 }],
      dailyCapacity: capacity,
      today: '2026-08-11',
    })
    expect(point!.capacityMinutes).toBe(600)
    expect(point!.density).toBe(1)
    expect(point!.feasible).toBe(true)
  })

  it('densité > 1 → prouvé impossible', () => {
    const [point] = computeDensities({
      tasks: [{ deadline: '2026-08-13', remainingMinutes: 900 }],
      dailyCapacity: capacity,
      today: '2026-08-11',
    })
    expect(point!.density).toBe(1.5)
    expect(point!.feasible).toBe(false)
  })

  it('la charge d’une deadline inclut tout ce qui est dû AVANT elle', () => {
    const points = computeDensities({
      tasks: [
        { deadline: '2026-08-12', remainingMinutes: 300 },
        { deadline: '2026-08-13', remainingMinutes: 200 },
      ],
      dailyCapacity: capacity,
      today: '2026-08-11',
    })
    expect(points[0]).toMatchObject({ deadline: '2026-08-12', loadMinutes: 300, capacityMinutes: 400 })
    expect(points[1]).toMatchObject({ deadline: '2026-08-13', loadMinutes: 500, capacityMinutes: 600 })
  })

  it('aucune capacité mais du travail dû → densité infinie', () => {
    const [point] = computeDensities({
      tasks: [{ deadline: '2026-08-11', remainingMinutes: 60 }],
      dailyCapacity: [{ date: '2026-08-11', capacityMinutes: 0 }],
      today: '2026-08-11',
    })
    expect(point!.feasible).toBe(false)
  })
})

describe('C.3 — diagnostic quantitatif', () => {
  it('déficit exact, période, et au moins deux options chiffrées', () => {
    const deficit = diagnoseDeficit(
      { deadline: '2026-08-13', loadMinutes: 900, capacityMinutes: 600, density: 1.5, feasible: false },
      [
        { title: 'Dossier', remainingMinutes: 600 },
        { title: 'Révisions', remainingMinutes: 300 },
      ],
    )
    expect(deficit!.deficitMinutes).toBe(300)
    expect(deficit!.options.length).toBeGreaterThanOrEqual(2)
    expect(deficit!.options[0]).toEqual({ action: 'Repousser « Dossier » après le 2026-08-13', minutesFreed: 600 })
    expect(deficit!.options[1]).toEqual({ action: 'Réduire « Dossier » de moitié', minutesFreed: 300 })
    expect(deficit!.options[2]).toEqual({ action: 'Retirer « Révisions »', minutesFreed: 300 })
  })

  it('aucun diagnostic quand la densité tient', () => {
    expect(
      diagnoseDeficit({ deadline: '2026-08-13', loadMinutes: 100, capacityMinutes: 600, density: 0.16, feasible: true }, []),
    ).toBeNull()
  })
})

describe('C.3.3 — sévérité proportionnelle au déficit de densité', () => {
  it('< 10 % du travail demandé → passif seulement, non actif', () => {
    expect(severityFor(0.05)).toBe('info')
  })

  it('10 à 30 % → signal passif', () => {
    expect(severityFor(0.1)).toBe('passive')
    expect(severityFor(0.3)).toBe('passive')
  })

  it('> 30 % → sévérité haute', () => {
    expect(severityFor(0.31)).toBe('high')
  })

  it('la sévérité porte sur le déficit, jamais sur l’avancement d’une tâche', () => {
    // 900 demandées, 600 possibles : 300 manquantes = 33 % du DEMANDÉ.
    const d = diagnoseDeficit(
      { deadline: '2026-08-13', loadMinutes: 900, capacityMinutes: 600, density: 1.5, feasible: false },
      [{ title: 'Dossier', remainingMinutes: 900 }],
    )
    expect(d!.deficitRatio).toBeCloseTo(1 / 3, 5)
    expect(d!.severity).toBe('high')
  })
})

describe('C.3.4 + F.2 — signaux', () => {
  const deficit = {
    deadline: '2026-08-13',
    deficitMinutes: 300,
    deficitRatio: 0.33,
    severity: 'high' as const,
    options: [],
  }

  it('trois types de signaux, pas un de plus', () => {
    const signals = produceSignals({
      deficits: [deficit],
      anchorMissCounts: { 'ancre-1': 3 },
      objectives: [{ objectiveId: 'obj-1', name: 'Guitare', quotaMet: false, daysSinceLastService: 4 }],
      lastSignalAt: {},
      now: NOW,
    })
    expect(signals.map((s) => s.type).sort()).toEqual(['anchor_missed_3x', 'density_deficit', 'objective_stalled'])
  })

  it('un déficit sous 10 % ne produit aucun signal actif', () => {
    const signals = produceSignals({
      deficits: [{ ...deficit, severity: 'info', deficitRatio: 0.05 }],
      anchorMissCounts: {},
      objectives: [],
      lastSignalAt: {},
      now: NOW,
    })
    expect(signals).toHaveLength(0)
  })

  it('une ancre ratée 2 fois ne déclenche rien ; 3 fois, oui', () => {
    const two = produceSignals({ deficits: [], anchorMissCounts: { a: 2 }, objectives: [], lastSignalAt: {}, now: NOW })
    const three = produceSignals({ deficits: [], anchorMissCounts: { a: 3 }, objectives: [], lastSignalAt: {}, now: NOW })
    expect(two).toHaveLength(0)
    expect(three[0]).toMatchObject({ type: 'anchor_missed_3x', severity: 'passive' })
  })

  it('un objectif servi et à jour ne signale rien', () => {
    const signals = produceSignals({
      deficits: [],
      anchorMissCounts: {},
      objectives: [{ objectiveId: 'obj-1', name: 'Guitare', quotaMet: true, daysSinceLastService: 5 }],
      lastSignalAt: {},
      now: NOW,
    })
    expect(signals).toHaveLength(0)
  })

  it('F.2 : jamais deux signaux sur le même sujet dans les 72 h', () => {
    const recent = new Date(NOW.getTime() - 40 * 3_600_000).toISOString()
    const old = new Date(NOW.getTime() - 80 * 3_600_000).toISOString()

    expect(
      produceSignals({ deficits: [deficit], anchorMissCounts: {}, objectives: [], lastSignalAt: { 'density:2026-08-13': recent }, now: NOW }),
    ).toHaveLength(0)
    expect(
      produceSignals({ deficits: [deficit], anchorMissCounts: {}, objectives: [], lastSignalAt: { 'density:2026-08-13': old }, now: NOW }),
    ).toHaveLength(1)
  })

  it('F.2 : le plus sévère l’emporte sur un même sujet', () => {
    const signals = produceSignals({
      deficits: [
        { ...deficit, severity: 'passive' },
        { ...deficit, severity: 'high' },
      ],
      anchorMissCounts: {},
      objectives: [],
      lastSignalAt: {},
      now: NOW,
    })
    expect(signals).toHaveLength(1)
    expect(signals[0]!.severity).toBe('high')
  })
})

describe('C.4 — contrôle post-placement', () => {
  it('égalité → rien à signaler', () => {
    expect(postPlacementCheck(420, 420)).toBeUndefined()
  })

  it('écart → bug interne remonté, jamais absorbé', () => {
    expect(postPlacementCheck(400, 420)).toEqual({ expected: 420, actual: 400, diff: 20 })
  })
})

describe('C — assemblage', () => {
  it('faisable = toutes les densités tiennent', () => {
    const result = buildFeasibilityResult({
      tasks: [{ title: 'A', deadline: '2026-08-12', remainingMinutes: 100 }],
      dailyCapacity: [
        { date: '2026-08-11', capacityMinutes: 200 },
        { date: '2026-08-12', capacityMinutes: 200 },
      ],
      today: '2026-08-11',
    })
    expect(result.globallyFeasible).toBe(true)
    expect(result.deficits).toHaveLength(0)
  })
})
