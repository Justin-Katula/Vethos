import { describe, it, expect } from 'vitest'
import {
  autoSplit,
  computeCorrectionFactor,
  computePlannedDuration,
  DEFAULT_FACTORS,
  estimateTask,
  median,
  percentile,
  pertEstimate,
  planningFactor,
} from './estimation'
import type { LearningObservation, TaskItem } from './types'

/** Ratios 1.0, 1.2, 1.4, 1.6, 1.8 sur la catégorie « maths ». */
const mathsObservations: LearningObservation[] = [100, 120, 140, 160, 180].map(
  (actualMinutes, i) => ({
    category: 'maths',
    estimatedMinutes: 100,
    actualMinutes,
    createdAt: `2026-08-0${i + 1}T10:00:00.000Z`,
  }),
)

const task = (over: Partial<TaskItem> = {}): TaskItem => ({
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Devoir de maths',
  deadline: '2026-08-20',
  importance: 5,
  category: 'maths',
  workKind: 'routine',
  estimatedMinutes: 100,
  remainingMinutes: 100,
  correctionFactor: 1.4,
  parentTaskId: null,
  status: 'active',
  createdAt: '2026-08-01T10:00:00.000Z',
  ...over,
})

describe('B.1 — facteur de correction', () => {
  it('médiane des ratios réel/estimé = 1.4', () => {
    const r = computeCorrectionFactor({
      observations: mathsObservations,
      category: 'maths',
      workKind: 'routine',
    })
    expect(r.factor).toBe(1.4)
    expect(r.sampleSize).toBe(5)
    expect(r.confidence).toBe('medium')
  })

  it('dès 10 observations, la confiance passe haute', () => {
    const ten = [
      ...mathsObservations,
      ...mathsObservations.map((o, i) => ({ ...o, createdAt: `2026-08-1${i}T10:00:00.000Z` })),
    ]
    expect(
      computeCorrectionFactor({ observations: ten, category: 'maths', workKind: 'routine' })
        .confidence,
    ).toBe('high')
  })

  it('B.3 — sous 5 tâches complétées, le défaut tient : ×1.4 connu, ×1.7 nouveau', () => {
    const four = mathsObservations.slice(0, 4)
    expect(
      computeCorrectionFactor({ observations: four, category: 'maths', workKind: 'routine' }),
    ).toMatchObject({
      factor: DEFAULT_FACTORS.routine,
      confidence: 'low',
    })
    expect(
      computeCorrectionFactor({ observations: [], category: 'dessin', workKind: 'novel' }),
    ).toMatchObject({
      factor: DEFAULT_FACTORS.novel,
      confidence: 'none',
    })
  })

  it('une autre catégorie n’emprunte jamais les mesures de la première', () => {
    expect(
      computeCorrectionFactor({
        observations: mathsObservations,
        category: 'rédaction',
        workKind: 'novel',
      }).factor,
    ).toBe(DEFAULT_FACTORS.novel)
  })
})

describe('B.3 — démarrage à froid', () => {
  it('PERT : (30 + 4×60 + 120) / 6 = 65', () => {
    expect(pertEstimate(30, 60, 120)).toBe(65)
  })
})

describe('B.4 — percentile de planification', () => {
  it('médiane et 75e percentile de [1.0, 1.2, 1.4, 1.6, 1.8]', () => {
    const ratios = [1.0, 1.2, 1.4, 1.6, 1.8]
    expect(median(ratios)).toBe(1.4)
    expect(percentile(ratios, 0.75)).toBeCloseTo(1.6, 5)
  })

  it('une tâche à deadline réserve au 75e percentile, pas à la médiane', () => {
    const withDeadline = planningFactor({
      observations: mathsObservations,
      category: 'maths',
      workKind: 'routine',
      hasDeadline: true,
    })
    const without = planningFactor({
      observations: mathsObservations,
      category: 'maths',
      workKind: 'routine',
      hasDeadline: false,
    })
    expect(withDeadline.factor).toBeCloseTo(1.6, 5)
    expect(without.factor).toBe(1.4)
  })

  it('durée planifiée = estimation × facteur : 100 × 1.4 = 140', () => {
    expect(computePlannedDuration(100, 1.4)).toBe(140)
    expect(computePlannedDuration(45, 1.7)).toBe(77)
  })
})

describe('B.2 — durée réelle mesurée', () => {
  it('le temps de session déjà mesuré diminue ce qu’il reste à placer', () => {
    const e = estimateTask({
      task: task(),
      observations: mathsObservations,
      durationSource: { getActualMinutes: () => 90 },
    })
    // 100 × 1.6 (75e percentile) = 160 planifiées, dont 90 déjà mesurées.
    expect(e.plannedDuration).toBe(160)
    expect(e.measuredMinutes).toBe(90)
    expect(e.remainingMinutes).toBe(70)
  })

  it('sans mesure, rien n’est retranché — on n’invente pas du temps passé', () => {
    const e = estimateTask({ task: task(), observations: mathsObservations })
    expect(e.measuredMinutes).toBeNull()
    expect(e.remainingMinutes).toBe(160)
  })

  it('produit le fait brut : facteur, raison, confiance (B.6)', () => {
    const e = estimateTask({ task: task(), observations: mathsObservations })
    expect(e.confidence).toBe('medium')
    expect(e.reason).toContain('maths')
  })
})

describe('B.5 — découpage automatique', () => {
  it('rien à découper tant que la tâche tient dans un jour', () => {
    expect(autoSplit({ totalMinutes: 80, maxPerDayMinutes: 90 })).toEqual([])
  })

  it('300 min avec 90 min par jour → 4 parts de 75, ordonnées', () => {
    const parts = autoSplit({ totalMinutes: 300, maxPerDayMinutes: 90 })
    expect(parts).toHaveLength(4)
    expect(parts.map((p) => p.minutes)).toEqual([75, 75, 75, 75])
    expect(parts.map((p) => p.label)).toEqual(['Partie 1', 'Partie 2', 'Partie 3', 'Partie 4'])
    expect(parts.reduce((s, p) => s + p.minutes, 0)).toBe(300)
  })

  it('aucune sous-partie ne descend sous le seuil de fragment', () => {
    const parts = autoSplit({ totalMinutes: 60, maxPerDayMinutes: 20, minPartMinutes: 25 })
    expect(parts).toHaveLength(2)
    expect(parts.every((p) => p.minutes >= 25)).toBe(true)
  })

  it('avec accès IA, les sous-parties sont nommées et ordonnées', () => {
    const parts = autoSplit({
      totalMinutes: 180,
      maxPerDayMinutes: 90,
      labeller: (n) => Array.from({ length: n }, (_, i) => `Chapitre ${i + 1}`),
    })
    expect(parts.map((p) => p.label)).toEqual(['Chapitre 1', 'Chapitre 2'])
  })

  it('le reliquat va sur la première part, jamais perdu', () => {
    const parts = autoSplit({ totalMinutes: 305, maxPerDayMinutes: 90 })
    expect(parts.reduce((s, p) => s + p.minutes, 0)).toBe(305)
  })
})
