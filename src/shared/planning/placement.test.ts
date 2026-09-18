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
  maxTaskMinutesPerDay,
  sortTasksByCascade,
  TASK_CONSTANTS,
  WIP_COLD_START,
  type TaskWithMargin,
} from './placement'
import type { AncreItem, ObjectiveItem, TimeSlot } from './types'

const task = (over: Partial<TaskWithMargin>): TaskWithMargin => ({
  id: 't',
  title: 'Tâche',
  plan: 'Plan de travail pour la tâche',
  deadline: '2026-08-20',
  importance: 5,
  category: 'général',
  workKind: 'routine',
  estimatedMinutes: 60,
  remainingMinutes: 60,
  correctionFactor: 1.4,
  parentTaskId: null,
  partOrder: null,
  extraMinutes: 0,
  status: 'active',
  appsToBlock: [],
  createdAt: '2026-08-01T10:00:00.000Z',
  marginMinutes: 1000,
  urgency: 0.001,
  marginStatus: 'comfortable',
  ...over,
})

const ancre = (over: Partial<AncreItem>): AncreItem => ({
  id: 'a',
  name: 'Sport',
  plan: 'Plan d’action pour l’ancre',
  color: '#3ECF8E',
  trigger: 'sport',
  anchorMinute: 1080,
  daysOfWeek: [0, 2, 4],
  normalMaxMinutes: 60,
  minimumMinutes: 24,
  appsToBlock: [],
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

  describe('B.5.1 — le rang départage les sœurs d’un même découpage', () => {
    /** Cinq parties strictement identiques sur les quatre clés de la cascade. */
    const buildParts = () =>
      [4, 1, 5, 2, 3].map((n) =>
        task({
          id: `p${n}`,
          parentTaskId: 'groupe',
          partOrder: n,
          deadline: '2026-08-20',
          importance: 5,
          remainingMinutes: 84,
          createdAt: '2026-08-01T10:00:00.000Z',
        }),
      )

    it('DÉFAUT DU 2026-08-23 : sans rang, ces cinq parties sont indépartageables', () => {
      // La preuve du défaut, pas seulement du correctif : les quatre clés
      // historiques sont rigoureusement égales deux à deux, donc le
      // comparateur d'origine renvoyait 0 pour toutes les paires et l'ordre
      // final était celui, arbitraire, du tri de la plateforme.
      const [a, b] = buildParts()
      expect(a!.deadline).toBe(b!.deadline)
      expect(a!.importance).toBe(b!.importance)
      expect(a!.remainingMinutes).toBe(b!.remainingMinutes)
      expect(a!.createdAt).toBe(b!.createdAt)
    })

    it('avec le rang, l’ordre est 1, 2, 3, 4, 5 — quelle que soit l’entrée', () => {
      expect(sortTasksByCascade(buildParts()).map((t) => t.id)).toEqual([
        'p1',
        'p2',
        'p3',
        'p4',
        'p5',
      ])
      expect(sortTasksByCascade(buildParts().reverse()).map((t) => t.id)).toEqual([
        'p1',
        'p2',
        'p3',
        'p4',
        'p5',
      ])
    })

    it('le rang ne départage QUE des sœurs — jamais deux découpages différents', () => {
      // Une partie 1 d'un autre découpage ne double pas une deadline plus
      // proche : le rang reste sous la deadline dans la cascade.
      const sorted = sortTasksByCascade([
        task({ id: 'autre-p1', parentTaskId: 'autre-groupe', partOrder: 1, deadline: '2026-08-25' }),
        task({ id: 'proche-p9', parentTaskId: 'groupe', partOrder: 9, deadline: '2026-08-12' }),
      ])
      expect(sorted[0]!.id).toBe('proche-p9')
    })
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
    plan: 'Pratiquer la guitare au salon.',
    color: '#3ECF8E',
    weeklyTargetMinutes: 420, // 7 h par semaine
    appsToBlock: [],
    createdAt: '2026-08-01T10:00:00.000Z',
  }

  it('le rythme quotidien est la cible ÷ 7, toujours — jamais ÷ les jours restants', () => {
    // Un jour de capacité moyenne porte exactement le rythme : 420 / 7 = 60.
    expect(
      computeObjectiveQuota({
        objective,
        servedThisWeekMinutes: 0,
        todayCapacityMinutes: 300,
        averageDayCapacityMinutes: 300,
        daysSinceLastService: 0,
      }),
    ).toBe(60)
  })

  it('la capacité effective du jour module le rythme, sans jamais le remplacer', () => {
    // Deux fois plus libre que la moyenne → deux fois le rythme.
    expect(
      computeObjectiveQuota({
        objective,
        servedThisWeekMinutes: 0,
        todayCapacityMinutes: 600,
        averageDayCapacityMinutes: 300,
        daysSinceLastService: 0,
      }),
    ).toBe(120)
    // Deux fois plus chargé → moitié du rythme.
    expect(
      computeObjectiveQuota({
        objective,
        servedThisWeekMinutes: 0,
        todayCapacityMinutes: 150,
        averageDayCapacityMinutes: 300,
        daysSinceLastService: 0,
      }),
    ).toBe(30)
  })

  it('une semaine entamée tard ne rattrape jamais : le dernier jour reste au rythme', () => {
    // Dimanche, rien servi de la semaine, une seule journée devant soi.
    // L'ancien calcul lui donnait les 420 minutes entières ; le rythme reste 60.
    expect(
      computeObjectiveQuota({
        objective,
        servedThisWeekMinutes: 0,
        todayCapacityMinutes: 500,
        averageDayCapacityMinutes: 500,
        daysSinceLastService: 1,
      }),
    ).toBe(60)
  })

  it('ce qui est déjà servi cette semaine sort de la cible', () => {
    expect(
      computeObjectiveQuota({
        objective,
        servedThisWeekMinutes: 420,
        todayCapacityMinutes: 300,
        averageDayCapacityMinutes: 300,
        daysSinceLastService: 0,
      }),
    ).toBe(0)
  })

  it('le report est plafonné à deux jours — pas de dette infinie', () => {
    // Une journée cinq fois plus libre que la moyenne s'arrête à 3 × 60 = 180.
    expect(
      computeObjectiveQuota({
        objective,
        servedThisWeekMinutes: 0,
        todayCapacityMinutes: 1500,
        averageDayCapacityMinutes: 300,
        daysSinceLastService: 1,
      }),
    ).toBe(180)
  })

  it('jamais servi depuis 3 jours → l’application réajuste elle-même', () => {
    // Sans réajustement le quota tomberait à 60 × 10/300 = 2 min.
    expect(
      computeObjectiveQuota({
        objective,
        servedThisWeekMinutes: 0,
        todayCapacityMinutes: 10,
        averageDayCapacityMinutes: 300,
        daysSinceLastService: 3,
      }),
    ).toBe(60) // le rythme quotidien, 420 / 7
  })

  it('aucune capacité → aucun quota', () => {
    expect(
      computeObjectiveQuota({
        objective,
        servedThisWeekMinutes: 0,
        todayCapacityMinutes: 0,
        averageDayCapacityMinutes: 300,
        daysSinceLastService: 0,
      }),
    ).toBe(0)
  })

  it('sans moyenne connue, le rythme s’applique tel quel', () => {
    expect(
      computeObjectiveQuota({
        objective,
        servedThisWeekMinutes: 0,
        todayCapacityMinutes: 300,
        averageDayCapacityMinutes: 0,
        daysSinceLastService: 0,
      }),
    ).toBe(60)
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

describe('B.5 — seuil de déclenchement du découpage', () => {
  it('c’est le jour le plus large qui décide : 40 % de sa capacité effective', () => {
    // 40 % de 700 = 280 : tant qu'un jour peut absorber la tâche, on ne coupe pas.
    expect(
      maxTaskMinutesPerDay([
        { effectiveCapacityMinutes: 300 },
        { effectiveCapacityMinutes: 700 },
        { effectiveCapacityMinutes: 500 },
      ]),
    ).toBe(280)
  })

  it('sans plan encore calculé, le seuil vaut 0 — donc aucun découpage hasardeux', () => {
    expect(maxTaskMinutesPerDay([])).toBe(0)
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
    expect(a.take(60, { prefer: 'PROFONDE' })).toMatchObject({
      startMinute: 600,
      cognitiveWindow: 'PROFONDE',
    })
  })

  it('l’absence de fenêtre PROFONDE n’empêche jamais le placement', () => {
    const a = new DayAllocator([slot(480, 600, 'BASSE')], () => 'BASSE')
    expect(a.take(60, { prefer: 'PROFONDE' })).toMatchObject({
      startMinute: 480,
      cognitiveWindow: 'BASSE',
    })
  })

  it('D.5 : budget profond épuisé → le bloc évite la fenêtre PROFONDE', () => {
    // 8 h → 10 h profondes, 10 h → 12 h normales.
    const a = new DayAllocator([slot(480, 720)], (hour) => (hour < 10 ? 'PROFONDE' : 'NORMALE'))
    expect(a.take(60, { avoid: 'PROFONDE' })).toMatchObject({
      startMinute: 600,
      cognitiveWindow: 'NORMALE',
    })
  })

  it('la fenêtre évitée est quand même prise s’il ne reste qu’elle — jamais un blocage', () => {
    const a = new DayAllocator([slot(480, 600)], () => 'PROFONDE')
    expect(a.take(60, { avoid: 'PROFONDE' })).toMatchObject({
      startMinute: 480,
      cognitiveWindow: 'PROFONDE',
    })
  })

  it('D.5/A.4 : deux blocs longs s’espacent au lieu de se coller', () => {
    const a = new DayAllocator([slot(450, 1350)])
    const first = a.take(110)!
    const second = a.take(110, { spreadFrom: first.endMinute })!
    // Le second vise le milieu du temps restant : 560 + (1350 − 560 − 110)/2.
    expect(first.endMinute).toBe(560)
    expect(second.startMinute).toBe(900)
  })

  it('ADDENDUM 4 — journée très contrainte : sans assez d’étalement, rien ne se décale, pas de trou trop court pour servir', () => {
    // 250 minutes pour deux blocs de 110 : les décaler ne libérerait que 15 min,
    // moins qu'un bloc utile (25 min). Ils restent collés — jamais d'erreur,
    // jamais de placement forcé impossible.
    const a = new DayAllocator([slot(450, 700)])
    const first = a.take(110)!
    const second = a.take(110, { spreadFrom: first.endMinute })!
    expect(second.startMinute).toBe(first.endMinute)
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
