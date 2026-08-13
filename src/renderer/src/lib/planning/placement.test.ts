import { describe, it, expect } from 'vitest'
import {
  computeAncreMinimum,
  computeObjectiveQuota,
  computeProportionalShare,
  computeTargetBlockSize,
  computeTaskDayTarget,
  computeWIPLimit,
  DayAllocator,
  findAncreConflict,
  sortTasksByCascade,
  TASK_CONSTANTS,
  WIP_COLD_START,
  type TaskWithMargin,
} from './placement'
import type { AncreItem, ObjectiveItem, TimeSlot } from './types'

const task = (over: Partial<TaskWithMargin>): TaskWithMargin => ({
  id: 't',
  title: 'Tâche',
  deadline: '2026-08-20',
  importance: 5,
  category: 'général',
  workKind: 'routine',
  estimatedMinutes: 60,
  remainingMinutes: 60,
  correctionFactor: 1.4,
  parentTaskId: null,
  status: 'active',
  createdAt: '2026-08-01T10:00:00.000Z',
  marginMinutes: 1000,
  urgency: 0.001,
  marginStatus: 'comfortable',
  ...over,
})

const ancre = (over: Partial<AncreItem>): AncreItem => ({
  id: 'a',
  name: 'Sport',
  color: '#3ECF8E',
  trigger: 'sport',
  anchorMinute: 1080,
  daysOfWeek: [0, 2, 4],
  normalMaxMinutes: 60,
  minimumMinutes: 24,
  createdAt: '2026-08-01T10:00:00.000Z',
  ...over,
})

const slot = (
  start: number,
  end: number,
  cognitiveWindow: TimeSlot['cognitiveWindow'] = 'NORMALE',
): TimeSlot => ({
  startMinute: start,
  endMinute: end,
  durationMinutes: end - start,
  cognitiveWindow,
})

describe('D.6 — cascade : deadline → importance → SRPT → création', () => {
  it('1. la deadline la plus proche passe toujours en premier', () => {
    const sorted = sortTasksByCascade([
      task({ id: 'plus-tard', deadline: '2026-08-20', importance: 10, remainingMinutes: 30 }),
      task({ id: 'urgent', deadline: '2026-08-12', importance: 1, remainingMinutes: 600 }),
    ])
    expect(sorted.map((t) => t.id)).toEqual(['urgent', 'plus-tard'])
  })

  it('2. à deadline égale, l’importance déclarée tranche', () => {
    const sorted = sortTasksByCascade([
      task({ id: 'basse', importance: 3, remainingMinutes: 30 }),
      task({ id: 'haute', importance: 9, remainingMinutes: 600 }),
    ])
    expect(sorted.map((t) => t.id)).toEqual(['haute', 'basse'])
  })

  it('3. à importance égale, SRPT : le moins de travail restant d’abord', () => {
    const sorted = sortTasksByCascade([
      task({ id: 'longue', importance: 5, remainingMinutes: 600 }),
      task({ id: 'courte', importance: 5, remainingMinutes: 45 }),
    ])
    expect(sorted.map((t) => t.id)).toEqual(['courte', 'longue'])
  })

  it('4. égalité totale : la plus ancienne d’abord, jamais aléatoire', () => {
    const sorted = sortTasksByCascade([
      task({ id: 'recente', createdAt: '2026-08-05T10:00:00.000Z' }),
      task({ id: 'ancienne', createdAt: '2026-08-01T10:00:00.000Z' }),
    ])
    expect(sorted.map((t) => t.id)).toEqual(['ancienne', 'recente'])
  })

  it('la marge n’ordonne jamais directement : une marge plus faible ne double pas une deadline plus proche', () => {
    const sorted = sortTasksByCascade([
      task({
        id: 'marge-negative',
        deadline: '2026-08-25',
        marginMinutes: -500,
        marginStatus: 'overdue',
      }),
      task({ id: 'deadline-proche', deadline: '2026-08-12', marginMinutes: 900 }),
    ])
    expect(sorted[0]!.id).toBe('deadline-proche')
  })

  it('l’ordre est stable et reproductible sur 4 tâches', () => {
    const build = () => [
      task({
        id: 'd',
        deadline: '2026-08-20',
        importance: 5,
        remainingMinutes: 100,
        createdAt: '2026-08-02T00:00:00.000Z',
      }),
      task({
        id: 'c',
        deadline: '2026-08-20',
        importance: 5,
        remainingMinutes: 100,
        createdAt: '2026-08-01T00:00:00.000Z',
      }),
      task({ id: 'b', deadline: '2026-08-20', importance: 5, remainingMinutes: 50 }),
      task({ id: 'a', deadline: '2026-08-15', importance: 1, remainingMinutes: 900 }),
    ]
    expect(sortTasksByCascade(build()).map((t) => t.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(sortTasksByCascade(build().reverse()).map((t) => t.id)).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('D.3 — ancres', () => {
  it('minimum = MAX(20 min, 40 % de la durée normale)', () => {
    expect(computeAncreMinimum(60)).toBe(24) // 40 % de 60 = 24 > 20
    expect(computeAncreMinimum(30)).toBe(20) // 40 % de 30 = 12 → le plancher de 20 gagne
    expect(computeAncreMinimum(120)).toBe(48)
  })

  it('CRITÈRE 6 : deux ancres ne peuvent jamais occuper le même créneau', () => {
    const existing = [
      ancre({ id: 'sport', anchorMinute: 1080, normalMaxMinutes: 60, daysOfWeek: [0, 2] }),
    ]
    // 18 h 30 chevauche 18 h → 19 h le lundi.
    const conflict = findAncreConflict(
      { anchorMinute: 1110, normalMaxMinutes: 30, daysOfWeek: [0], trigger: 'lecture' },
      existing,
    )
    expect(conflict?.id).toBe('sport')
  })

  it('pas de conflit un jour où l’autre ancre n’existe pas', () => {
    const existing = [ancre({ anchorMinute: 1080, daysOfWeek: [0, 2] })]
    expect(
      findAncreConflict(
        { anchorMinute: 1080, normalMaxMinutes: 60, daysOfWeek: [1, 3], trigger: 'lecture' },
        existing,
      ),
    ).toBeNull()
  })

  it('une seule ancre par déclencheur, même à une autre heure', () => {
    const existing = [ancre({ trigger: 'sport', anchorMinute: 1080, daysOfWeek: [0] })]
    expect(
      findAncreConflict(
        { anchorMinute: 420, normalMaxMinutes: 30, daysOfWeek: [3], trigger: 'Sport' },
        existing,
      ),
    ).not.toBeNull()
  })
})

describe('D.4 — quota d’objectif', () => {
  const objective: ObjectiveItem = {
    id: 'o1',
    name: 'Guitare',
    color: '#3ECF8E',
    weeklyTargetMinutes: 420, // 7 h par semaine
    createdAt: '2026-08-01T10:00:00.000Z',
  }

  it('pondéré par la capacité du jour, jamais un partage égal', () => {
    // Il reste 420 min à servir, le jour porte 300 des 1500 min restantes :
    // 420 × 300/1500 = 84.
    expect(
      computeObjectiveQuota({
        objective,
        servedThisWeekMinutes: 0,
        todayCapacityMinutes: 300,
        remainingWeekCapacityMinutes: 1500,
        daysSinceLastService: 0,
      }),
    ).toBe(84)
  })

  it('ce qui est déjà servi cette semaine sort de la cible', () => {
    expect(
      computeObjectiveQuota({
        objective,
        servedThisWeekMinutes: 420,
        todayCapacityMinutes: 300,
        remainingWeekCapacityMinutes: 1500,
        daysSinceLastService: 0,
      }),
    ).toBe(0)
  })

  it('le report est plafonné à deux jours — pas de dette infinie', () => {
    // Journée seule en fin de semaine : sans plafond, elle absorberait les
    // 420 min restantes. Plafond = 3 × (420 / 7) = 180.
    expect(
      computeObjectiveQuota({
        objective,
        servedThisWeekMinutes: 0,
        todayCapacityMinutes: 500,
        remainingWeekCapacityMinutes: 500,
        daysSinceLastService: 1,
      }),
    ).toBe(180)
  })

  it('jamais servi depuis 3 jours → l’application réajuste elle-même', () => {
    // Sans réajustement le quota tomberait à 420 × 10/1500 = 3 min.
    expect(
      computeObjectiveQuota({
        objective,
        servedThisWeekMinutes: 0,
        todayCapacityMinutes: 10,
        remainingWeekCapacityMinutes: 1500,
        daysSinceLastService: 3,
      }),
    ).toBe(60) // la part quotidienne moyenne, 420 / 7
  })

  it('aucune capacité → aucun quota', () => {
    expect(
      computeObjectiveQuota({
        objective,
        servedThisWeekMinutes: 0,
        todayCapacityMinutes: 0,
        remainingWeekCapacityMinutes: 1500,
        daysSinceLastService: 0,
      }),
    ).toBe(0)
  })
})

describe('D.5 — tailles de bloc', () => {
  it('bloc cible = min(besoin, 90, 40 % du jour)', () => {
    expect(computeTargetBlockSize(200, 500)).toBe(90) // 40 % de 500 = 200 → 90 gagne
    expect(computeTargetBlockSize(30, 500)).toBe(30) // le besoin gagne
    expect(computeTargetBlockSize(200, 100)).toBe(40) // 40 % de 100 → le plafond gagne
  })

  it('répartition proportionnelle : 120 / 600 × 300 = 60', () => {
    expect(computeProportionalShare(120, 600, 300)).toBe(60)
    expect(computeProportionalShare(120, 0, 300)).toBe(0)
  })

  it('quand l’idéal suffit, le plafond de 40 % est respecté', () => {
    // 3 jours à 500 min : idéal = 3 × 90 = 270 ≥ 200 de besoin.
    const r = computeTaskDayTarget({
      remainingNeed: 200,
      dayCapacity: 500,
      remainingDayCapacities: [500, 500, 500],
      isCrisis: false,
    })
    expect(r).toEqual({ target: 90, capOverride: false })
  })

  it('sous pression, la charge se répartit sur tous les jours restants', () => {
    // Besoin 600, idéal 3 × 90 = 270 < 600 → part = 600 × 500/1500 = 200,
    // sous le plafond de 40 % (200).
    const r = computeTaskDayTarget({
      remainingNeed: 600,
      dayCapacity: 500,
      remainingDayCapacities: [500, 500, 500],
      isCrisis: false,
    })
    expect(r).toEqual({ target: 200, capOverride: false })
  })

  it('sans crise, le plafond de 40 % tient même si la part le dépasse', () => {
    // Besoin 900 sur 2 jours de 500 : part = 450 > plafond 200.
    const r = computeTaskDayTarget({
      remainingNeed: 900,
      dayCapacity: 500,
      remainingDayCapacities: [500, 500],
      isCrisis: false,
    })
    expect(r).toEqual({ target: 200, capOverride: false })
  })

  it('crise prouvée : le dépassement du plafond est autorisé, et signalé', () => {
    const r = computeTaskDayTarget({
      remainingNeed: 900,
      dayCapacity: 500,
      remainingDayCapacities: [500, 500],
      isCrisis: true,
    })
    expect(r).toEqual({ target: 450, capOverride: true })
  })
})

describe('D.6 — limite de travail en cours', () => {
  it('démarrage à froid : 4 tâches actives', () => {
    expect(computeWIPLimit({ tasksCreatedPerWeek: {}, targetWeeks: 2 })).toBe(WIP_COLD_START)
    expect(computeWIPLimit({ tasksCreatedPerWeek: { '2026-08-03': 5 }, targetWeeks: 2 })).toBe(4)
  })

  it('L = λ × W dès que λ est mesuré : (3 + 5) / 2 × 2 = 8', () => {
    expect(
      computeWIPLimit({
        tasksCreatedPerWeek: { '2026-08-03': 3, '2026-08-10': 5 },
        targetWeeks: 2,
      }),
    ).toBe(8)
  })
})

describe('allocateur — deux blocs n’occupent jamais la même minute', () => {
  it('take() avance dans le créneau et ne se recouvre jamais', () => {
    const a = new DayAllocator([slot(480, 720)])
    const first = a.take(90)
    const second = a.take(90)
    expect(first).toMatchObject({ startMinute: 480, endMinute: 570 })
    expect(second).toMatchObject({ startMinute: 570, endMinute: 660 })
    expect(a.totalFree()).toBe(60)
  })

  it('reserve() retire une plage précise et coupe le créneau en deux', () => {
    const a = new DayAllocator([slot(480, 720)])
    a.reserve(540, 600)
    expect(a.totalFree()).toBe(180)
    expect(a.largestFree()).toBe(120)
    expect(a.take(90)).toMatchObject({ startMinute: 600 })
  })

  it('rend null plutôt que de forcer un bloc qui ne rentre pas', () => {
    const a = new DayAllocator([slot(480, 520)])
    expect(a.take(90)).toBeNull()
    expect(a.take(40)).toMatchObject({ startMinute: 480, endMinute: 520 })
  })

  it('D.1.4 : la fenêtre PROFONDE est préférée quand elle existe', () => {
    const a = new DayAllocator([slot(480, 600, 'BASSE'), slot(600, 720, 'PROFONDE')], (hour) =>
      hour >= 10 ? 'PROFONDE' : 'BASSE',
    )
    expect(a.take(60, 'PROFONDE')).toMatchObject({ startMinute: 600, cognitiveWindow: 'PROFONDE' })
  })

  it('l’absence de fenêtre PROFONDE n’empêche jamais le placement', () => {
    const a = new DayAllocator([slot(480, 600, 'BASSE')], () => 'BASSE')
    expect(a.take(60, 'PROFONDE')).toMatchObject({ startMinute: 480, cognitiveWindow: 'BASSE' })
  })

  it('les constantes de D.5 sont celles du document', () => {
    expect(TASK_CONSTANTS).toEqual({
      maxPercentPerDay: 0.4,
      targetBlockMinutes: 90,
      minBlockMinutes: 25,
      maxDeepBlocksPerDay: 2,
    })
  })
})
