import { describe, it, expect } from 'vitest'
import {
  applyProtectedMargins,
  buildDayCapacity,
  buildFreeIntervals,
  classifyHour,
  computeEffectiveCapacity,
  computeRawCapacity,
  measureFragmentThreshold,
  mergeIntervals,
  splitUsable,
} from './capacity'
import type { AncreItem, LearningObservation, ScheduleEntry } from './types'

const entry = (start: number, end: number, categoryType: ScheduleEntry['categoryType'] = 'school'): ScheduleEntry => ({
  dayOfWeek: 0,
  startMinute: start,
  endMinute: end,
  categoryType,
  label: categoryType,
  color: '#333333',
})

const ancre = (anchorMinute: number, normalMaxMinutes: number): AncreItem => ({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Sport',
  color: '#3ECF8E',
  trigger: 'sport',
  anchorMinute,
  daysOfWeek: [0],
  normalMaxMinutes,
  minimumMinutes: 24,
  createdAt: '2026-08-01T10:00:00.000Z',
})

const obs = (o: Partial<LearningObservation>): LearningObservation => ({ createdAt: '2026-08-01T10:00:00.000Z', ...o })

describe('A.1 — capacité brute', () => {
  it('1440 − sommeil (23 h → 7 h) = 960', () => {
    const sommeil = [entry(0, 420, 'sleep'), entry(1380, 1440, 'sleep')]
    expect(computeRawCapacity(sommeil)).toBe(960)
  })

  it('les ancres sortent aussi de la capacité brute', () => {
    const sommeil = [entry(0, 420, 'sleep'), entry(1380, 1440, 'sleep')]
    // 960 − 60 min de sport = 900.
    expect(computeRawCapacity(sommeil, [ancre(1080, 60)])).toBe(900)
  })

  it('deux obligations qui se chevauchent ne sont comptées qu’une fois', () => {
    // 08 h → 12 h et 10 h → 16 h : 480 minutes occupées, pas 600.
    expect(computeRawCapacity([entry(480, 720), entry(600, 960)])).toBe(1440 - 480)
    expect(mergeIntervals([{ start: 0, end: 10 }, { start: 5, end: 20 }])).toEqual([{ start: 0, end: 20 }])
  })

  it('le sommeil n’est jamais compté comme charge de travail', () => {
    // Il sort de la capacité — il n'y entre pas. Une journée sans rien d'autre
    // que 8 h de sommeil laisse 16 h brutes, pas 16 h de travail dû.
    expect(computeRawCapacity([entry(0, 480, 'sleep')])).toBe(960)
  })
})

describe('A.2 — fragments et marges protégées', () => {
  it('les trous libres sont ceux que laissent obligations et ancres', () => {
    const free = buildFreeIntervals([entry(0, 420, 'sleep'), entry(480, 960), entry(1380, 1440, 'sleep')])
    expect(free).toEqual([
      { start: 420, end: 480 },
      { start: 960, end: 1380 },
    ])
  })

  it('30 min protégées avant le sommeil, 20 min avant une obligation', () => {
    const entries = [entry(0, 420, 'sleep'), entry(480, 960), entry(1380, 1440, 'sleep')]
    const trimmed = applyProtectedMargins(buildFreeIntervals(entries), entries)
    // 7 h → 8 h devient 7 h → 7 h 40 (20 min de préparation avant l'école).
    expect(trimmed[0]).toEqual({ start: 420, end: 460 })
    // 16 h → 23 h devient 16 h → 22 h 30 (30 min de transition avant le sommeil).
    expect(trimmed[1]).toEqual({ start: 960, end: 1350 })
  })

  it('un fragment sous le seuil est inutilisable', () => {
    const { usable, unusableMinutes } = splitUsable(
      [{ start: 0, end: 20 }, { start: 100, end: 200 }],
      25,
    )
    expect(usable).toEqual([{ start: 100, end: 200 }])
    expect(unusableMinutes).toBe(20)
  })
})

describe('A.2.1 — seuil personnalisé', () => {
  it('sous 5 observations, le défaut tient et la confiance reste basse', () => {
    const few = [30, 40, 50, 60].map((actualMinutes) => obs({ workKind: 'routine', actualMinutes, completed: true }))
    expect(measureFragmentThreshold(few, 'routine')).toEqual({ threshold: 25, confidence: 'low' })
  })

  it('dès 5 observations, le plus petit bloc réellement mené à terme remplace le défaut', () => {
    const five = [32, 45, 60, 90, 120].map((actualMinutes) => obs({ workKind: 'routine', actualMinutes, completed: true }))
    // 32 arrondi au multiple de 5 inférieur = 30.
    expect(measureFragmentThreshold(five, 'routine')).toEqual({ threshold: 30, confidence: 'measured' })
  })

  it('les blocs abandonnés ne comptent pas comme un seuil utilisable', () => {
    const mixed = [
      ...[10, 12].map((actualMinutes) => obs({ workKind: 'novel', actualMinutes, completed: false })),
      ...[45, 50, 60, 70, 80].map((actualMinutes) => obs({ workKind: 'novel', actualMinutes, completed: true })),
    ]
    expect(measureFragmentThreshold(mixed, 'novel').threshold).toBe(45)
  })
})

describe('A.3 — capacité effective', () => {
  it('brute − inutilisables − repos − fatigue', () => {
    expect(computeEffectiveCapacity(960, 40, 192, 0)).toBe(728)
    expect(computeEffectiveCapacity(960, 40, 192, 100)).toBe(628)
  })

  it('jamais négative', () => {
    expect(computeEffectiveCapacity(100, 50, 60, 60)).toBe(0)
  })

  it('assemble un jour complet et cohérent', () => {
    const entries = [entry(0, 420, 'sleep'), entry(480, 960), entry(1380, 1440, 'sleep')]
    const day = buildDayCapacity({
      date: '2026-08-11',
      dayOfWeek: 1,
      entries,
      ancres: [],
      restReservedMinutes: 96,
      fatiguePenaltyMinutes: 0,
    })
    // Brute : 1440 − 480 (sommeil) − 480 (école) = 480.
    expect(day.rawCapacityMinutes).toBe(480)
    // Trous bruts : 60 + 420 = 480. Après marges protégées : 40 + 390 = 430.
    // Les 50 minutes retirées sont indisponibles au même titre qu'un fragment.
    expect(day.unusableMinutes).toBe(50)
    expect(day.effectiveCapacityMinutes).toBe(480 - 50 - 96)
    expect(day.slots).toEqual([
      { startMinute: 420, endMinute: 460, durationMinutes: 40, cognitiveWindow: 'NORMALE' },
      { startMinute: 960, endMinute: 1350, durationMinutes: 390, cognitiveWindow: 'NORMALE' },
    ])
  })
})

describe('A.4 / G.2 — fenêtres cognitives', () => {
  const at = (completed: boolean[]) => new Map([[9, completed.map((c) => ({ completed: c }))]])

  it('sous 5 observations : NORMALE, aucune conclusion', () => {
    expect(classifyHour(9, at([true, true, true, true]))).toBe('NORMALE')
    expect(classifyHour(9, new Map())).toBe('NORMALE')
  })

  it('4 complétions sur 5 (80 %) → PROFONDE', () => {
    expect(classifyHour(9, at([true, true, true, true, false]))).toBe('PROFONDE')
  })

  it('3 sur 5 (60 %) → NORMALE', () => {
    expect(classifyHour(9, at([true, true, true, false, false]))).toBe('NORMALE')
  })

  it('1 sur 5 (20 %) → BASSE : le créneau cesse d’être proposé', () => {
    expect(classifyHour(9, at([true, false, false, false, false]))).toBe('BASSE')
  })
})
