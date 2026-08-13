import { describe, it, expect } from 'vitest'
import {
  anchorHoldRate,
  buildWindowMap,
  createObservation,
  dataConfidence,
  groupByHour,
  hasEnoughData,
  objectivePostponementRate,
  windowLookup,
} from './learning'
import type { LearningObservation } from './types'

const at = (startHour: number, completed: boolean): LearningObservation => ({
  startHour,
  completed,
  createdAt: '2026-08-01T10:00:00.000Z',
})

describe('G.1 — mesurer, jamais déclarer', () => {
  it('l’horodatage est injecté : le moteur reste déterministe', () => {
    const o = createObservation(
      { startHour: 9, completed: true },
      new Date(Date.UTC(2026, 7, 11, 10, 0)),
    )
    expect(o.createdAt).toBe('2026-08-11T10:00:00.000Z')
  })

  it('regroupe les blocs par heure de démarrage', () => {
    const map = groupByHour([at(9, true), at(9, false), at(14, true)])
    expect(map.get(9)).toHaveLength(2)
    expect(map.get(14)).toHaveLength(1)
    expect(map.get(20)).toBeUndefined()
  })

  it('une observation sans mesure d’heure ou de complétion est ignorée', () => {
    const map = groupByHour([{ createdAt: '2026-08-01T10:00:00.000Z', startHour: 9 }])
    expect(map.size).toBe(0)
  })
})

describe('G.2 — reclassement des fenêtres cognitives', () => {
  it('un créneau tenu 4 fois sur 5 devient PROFONDE', () => {
    const obs = [at(9, true), at(9, true), at(9, true), at(9, true), at(9, false)]
    expect(windowLookup(buildWindowMap(obs))(9)).toBe('PROFONDE')
  })

  it('un créneau en échec systématique tombe en BASSE et cesse d’être proposé', () => {
    const obs = [at(22, false), at(22, false), at(22, false), at(22, false), at(22, true)]
    expect(windowLookup(buildWindowMap(obs))(22)).toBe('BASSE')
  })

  it('les 24 heures existent, NORMALE par défaut', () => {
    const map = buildWindowMap([])
    expect(map.size).toBe(24)
    expect([...map.values()].every((w) => w === 'NORMALE')).toBe(true)
  })
})

describe('G.3 — prudence sur données faibles', () => {
  it('aucune conclusion sous 5 observations', () => {
    expect(hasEnoughData(4)).toBe(false)
    expect(hasEnoughData(5)).toBe(true)
    // 4 réussites sur 4 : ce n'est PAS une tendance, ça reste NORMALE.
    expect(
      windowLookup(buildWindowMap([at(9, true), at(9, true), at(9, true), at(9, true)]))(9),
    ).toBe('NORMALE')
  })

  it('l’absence de données se dit explicitement', () => {
    expect(dataConfidence(0)).toBe('none')
    expect(dataConfidence(4)).toBe('low')
    expect(dataConfidence(9)).toBe('medium')
    expect(dataConfidence(10)).toBe('high')
  })
})

describe('G.1 — taux mesurés', () => {
  it('taux de tenue des ancres par heure d’ancrage', () => {
    const obs = [
      { anchorHour: 18, held: true },
      { anchorHour: 18, held: false },
      { anchorHour: 7, held: true },
    ]
    expect(anchorHoldRate(obs, 18)).toEqual({ rate: 0.5, confidence: 'low' })
    expect(anchorHoldRate(obs, 12)).toEqual({ rate: 0, confidence: 'none' })
  })

  it('taux de report des objectifs', () => {
    const obs = [
      { objectiveId: 'o1', postponed: true },
      { objectiveId: 'o1', postponed: false },
      { objectiveId: 'o1', postponed: false },
      { objectiveId: 'o1', postponed: false },
    ]
    expect(objectivePostponementRate(obs, 'o1').rate).toBe(0.25)
    expect(objectivePostponementRate(obs, 'o2').confidence).toBe('none')
  })
})
