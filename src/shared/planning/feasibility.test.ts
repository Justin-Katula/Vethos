import { describe, it, expect } from 'vitest'
import {
  buildFeasibilityResult,
  computeDensities,
  computeMargin,
  diagnoseDeficit,
  postPlacementCheck,
  produceSignals,
  severityFor,
  stolenFraction,
  tensionFor,
  tensionWarningFor,
  validateImportance,
} from './feasibility'

const NOW = new Date(2026, 7, 11, 10, 0)

describe('C.1 — marge et urgence', () => {
  it('marge > 0 → du jeu', () => {
    expect(computeMargin(300, 120)).toMatchObject({
      marginMinutes: 180,
      marginStatus: 'comfortable',
    })
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
    expect(points[0]).toMatchObject({
      deadline: '2026-08-12',
      loadMinutes: 300,
      capacityMinutes: 400,
    })
    expect(points[1]).toMatchObject({
      deadline: '2026-08-13',
      loadMinutes: 500,
      capacityMinutes: 600,
    })
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

describe('D.2 — vol de temps progressif (tension)', () => {
  // Les cinq paliers exacts de la spec, testés un par un — pas de tolérance
  // approximative là où le calcul est censé être exact.
  it('70 % — sous le plancher, rien n’est volé', () => {
    expect(stolenFraction(0.7)).toBe(0)
  })

  it('85 % pile — inclus dans la zone « rien ne change »', () => {
    expect(stolenFraction(0.85)).toBe(0)
  })

  it('92.5 % — montée linéaire à 50 %, exemple chiffré de la spec (90 → 45 min)', () => {
    expect(stolenFraction(0.925)).toBeCloseTo(0.5, 10)
    const quotaNormal = 90
    const quotaApresVol = Math.round(quotaNormal * (1 - stolenFraction(0.925)))
    expect(quotaApresVol).toBe(45)
  })

  it('100 % — tout le quota du jour est volé', () => {
    expect(stolenFraction(1)).toBe(1)
  })

  it('115 % — plafonné à 100 % volé, jamais plus', () => {
    expect(stolenFraction(1.15)).toBe(1)
  })

  it('la montée est bien linéaire entre 85 et 100 %', () => {
    // À mi-chemin entre 85 et 100 (92.5), part_volée doit être exactement 0.5.
    expect(stolenFraction(0.85 + 0.15 / 2)).toBeCloseTo(0.5, 10)
    // Au quart du chemin (88.75 %), part_volée doit être 0.25.
    expect(stolenFraction(0.85 + 0.15 / 4)).toBeCloseTo(0.25, 10)
  })

  describe('tensionFor — tension d’un jour = pire densité qui le couvre encore', () => {
    const densities = [
      { deadline: '2026-08-12', loadMinutes: 100, capacityMinutes: 200, density: 0.5, feasible: true },
      { deadline: '2026-08-14', loadMinutes: 300, capacityMinutes: 250, density: 1.2, feasible: false },
    ]

    it('un jour couvert par plusieurs échéances retient la PLUS haute densité', () => {
      expect(tensionFor('2026-08-11', densities)).toBe(1.2)
    })

    it('un jour après toutes les échéances a une tension nulle', () => {
      expect(tensionFor('2026-08-15', densities)).toBe(0)
    })

    it('sans aucune échéance active, tension nulle — jamais de vol inventé', () => {
      expect(tensionFor('2026-08-11', [])).toBe(0)
    })
  })

  describe('tensionWarningFor — avertissement passif, jamais sur une échéance déjà en déficit actif', () => {
    it('sous 85 % : aucun avertissement', () => {
      expect(
        tensionWarningFor({
          deadline: '2026-08-13',
          loadMinutes: 100,
          capacityMinutes: 200,
          density: 0.5,
          feasible: true,
        }),
      ).toBeNull()
    })

    it('entre 85 et 100 % : avertissement passif avec le ratio exact', () => {
      expect(
        tensionWarningFor({
          deadline: '2026-08-13',
          loadMinutes: 185,
          capacityMinutes: 200,
          density: 0.925,
          feasible: true,
        }),
      ).toEqual({ deadline: '2026-08-13', tensionRatio: 0.925 })
    })

    it('≥ 100 % (déjà infeasible) : jamais un doublon avec le déficit actif', () => {
      expect(
        tensionWarningFor({
          deadline: '2026-08-13',
          loadMinutes: 250,
          capacityMinutes: 200,
          density: 1.25,
          feasible: false,
        }),
      ).toBeNull()
    })
  })

  describe('buildFeasibilityResult expose tensionWarnings', () => {
    it('une échéance à 90 % de densité produit un avertissement, pas un déficit', () => {
      const result = buildFeasibilityResult({
        tasks: [{ title: 'Dossier', deadline: '2026-08-12', remainingMinutes: 180 }],
        dailyCapacity: [
          { date: '2026-08-11', capacityMinutes: 100 },
          { date: '2026-08-12', capacityMinutes: 100 },
        ],
        today: '2026-08-11',
      })
      expect(result.deficits).toHaveLength(0)
      expect(result.tensionWarnings).toEqual([{ deadline: '2026-08-12', tensionRatio: 0.9 }])
    })

    it('l’avertissement disparaît dès que la charge redescend sous 85 %', () => {
      const result = buildFeasibilityResult({
        tasks: [{ title: 'Dossier', deadline: '2026-08-12', remainingMinutes: 100 }],
        dailyCapacity: [
          { date: '2026-08-11', capacityMinutes: 100 },
          { date: '2026-08-12', capacityMinutes: 100 },
        ],
        today: '2026-08-11',
      })
      expect(result.tensionWarnings).toHaveLength(0)
      expect(result.deficits).toHaveLength(0)
    })
  })
})

describe('C.3 — diagnostic quantitatif', () => {
  it('déficit exact, période, et au moins deux options chiffrées', () => {
    const deficit = diagnoseDeficit(
      {
        deadline: '2026-08-13',
        loadMinutes: 900,
        capacityMinutes: 600,
        density: 1.5,
        feasible: false,
      },
      [
        { title: 'Dossier', remainingMinutes: 600 },
        { title: 'Révisions', remainingMinutes: 300 },
      ],
    )
    expect(deficit!.deficitMinutes).toBe(300)
    expect(deficit!.options.length).toBeGreaterThanOrEqual(2)
    expect(deficit!.options[0]).toEqual({
      action: 'Push “Dossier” past 2026-08-13',
      minutesFreed: 600,
    })
    expect(deficit!.options[1]).toEqual({
      action: 'Halve “Dossier”',
      minutesFreed: 300,
    })
    expect(deficit!.options[2]).toEqual({ action: 'Drop “Révisions”', minutesFreed: 300 })
  })

  it('aucun diagnostic quand la densité tient', () => {
    expect(
      diagnoseDeficit(
        {
          deadline: '2026-08-13',
          loadMinutes: 100,
          capacityMinutes: 600,
          density: 0.16,
          feasible: true,
        },
        [],
      ),
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
      {
        deadline: '2026-08-13',
        loadMinutes: 900,
        capacityMinutes: 600,
        density: 1.5,
        feasible: false,
      },
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
      objectives: [
        { objectiveId: 'obj-1', name: 'Guitare', quotaMet: false, daysSinceLastService: 4 },
      ],
      lastSignalAt: {},
      now: NOW,
    })
    expect(signals.map((s) => s.type).sort()).toEqual([
      'anchor_missed_3x',
      'density_deficit',
      'objective_stalled',
    ])
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
    const two = produceSignals({
      deficits: [],
      anchorMissCounts: { a: 2 },
      objectives: [],
      lastSignalAt: {},
      now: NOW,
    })
    const three = produceSignals({
      deficits: [],
      anchorMissCounts: { a: 3 },
      objectives: [],
      lastSignalAt: {},
      now: NOW,
    })
    expect(two).toHaveLength(0)
    expect(three[0]).toMatchObject({ type: 'anchor_missed_3x', severity: 'passive' })
  })

  it('un objectif servi et à jour ne signale rien', () => {
    const signals = produceSignals({
      deficits: [],
      anchorMissCounts: {},
      objectives: [
        { objectiveId: 'obj-1', name: 'Guitare', quotaMet: true, daysSinceLastService: 5 },
      ],
      lastSignalAt: {},
      now: NOW,
    })
    expect(signals).toHaveLength(0)
  })

  it('F.2 : jamais deux signaux sur le même sujet dans les 72 h', () => {
    const recent = new Date(NOW.getTime() - 40 * 3_600_000).toISOString()
    const old = new Date(NOW.getTime() - 80 * 3_600_000).toISOString()

    expect(
      produceSignals({
        deficits: [deficit],
        anchorMissCounts: {},
        objectives: [],
        lastSignalAt: { 'density:2026-08-13': recent },
        now: NOW,
      }),
    ).toHaveLength(0)
    expect(
      produceSignals({
        deficits: [deficit],
        anchorMissCounts: {},
        objectives: [],
        lastSignalAt: { 'density:2026-08-13': old },
        now: NOW,
      }),
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
