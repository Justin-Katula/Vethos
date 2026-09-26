import { describe, it, expect } from 'vitest'
import { computePlan, PLANNING_HORIZON_DAYS } from './engine'
import { TASK_CONSTANTS } from './placement'
import { sleepScheduleEntries } from '@shared/sleep'
import type {
  AncreItem,
  LearningObservation,
  ObjectiveItem,
  PlacedBlock,
  PlanningInput,
  PlanningResult,
  ScheduleEntry,
  SessionEvent,
  TaskItem,
} from './types'
import { addDays } from './dates'

// Mardi 11 août 2026, 8 h du matin.
const NOW = new Date(2026, 7, 11, 8, 0)
const TODAY = '2026-08-11'
const RANGE_END = '2026-08-17'

const uuid = (n: number) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`

const task = (over: Partial<TaskItem> = {}): TaskItem => ({
  id: uuid(1),
  title: 'Dossier',
  plan: 'Plan de test pour tâche',
  deadline: '2026-08-15',
  importance: 5,
  category: 'général',
  workKind: 'routine',
  estimatedMinutes: 120,
  remainingMinutes: 120,
  correctionFactor: 1.4,
  parentTaskId: null,
  partOrder: null,
  extraMinutes: 0,
  status: 'active',
  appsToBlock: [],
  createdAt: '2026-08-01T10:00:00.000Z',
  ...over,
})

const objective = (over: Partial<ObjectiveItem> = {}): ObjectiveItem => ({
  id: uuid(9),
  name: 'Guitare',
  plan: 'Plan de test pour objectif',
  color: '#3ECF8E',
  weeklyTargetMinutes: 420,
  appsToBlock: [],
  createdAt: '2026-08-01T10:00:00.000Z',
  ...over,
})

const ancre = (over: Partial<AncreItem> = {}): AncreItem => ({
  id: uuid(7),
  name: 'Sport',
  plan: 'Plan de test pour ancre',
  color: '#EBCB8B',
  trigger: 'sport',
  anchorMinute: 1080, // 18 h
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  normalMaxMinutes: 60,
  minimumMinutes: 24,
  appsToBlock: [],
  createdAt: '2026-08-01T10:00:00.000Z',
  ...over,
})

/** École 8 h → 16 h du lundi au vendredi, sommeil 23 h → 7 h. */
const school: ScheduleEntry[] = [0, 1, 2, 3, 4].map((dayOfWeek) => ({
  dayOfWeek,
  startMinute: 480,
  endMinute: 960,
  categoryType: 'school',
  label: 'Cours',
  color: '#5E81AC',
}))

const input = (over: Partial<PlanningInput> = {}): PlanningInput => ({
  today: TODAY,
  rangeEnd: RANGE_END,
  tasks: [],
  objectives: [],
  ancres: [],
  schedule: [...sleepScheduleEntries('23:00', '07:00'), ...school],
  observations: [],
  anchorMissCounts: {},
  dailyUtilization: {},
  weeklyObjectiveServed: {},
  objectiveLastServed: {},
  lastSignalAt: {},
  tasksCreatedPerWeek: {},
  consecutiveDelays: {},
  ...over,
})

describe('capacité — le socle', () => {
  it('sept jours calculés, chacun avec sa capacité effective', () => {
    const plan = computePlan(input(), NOW)
    expect(plan.capacities).toHaveLength(7)
    // Un jour d'école : 1440 − 480 (sommeil) − 480 (cours) = 480 brutes.
    expect(plan.capacities[0]!.rawCapacityMinutes).toBe(480)
    // Un samedi : pas de cours.
    expect(plan.capacities[4]!.rawCapacityMinutes).toBe(960)
    expect(plan.capacities.every((c) => c.effectiveCapacityMinutes > 0)).toBe(true)
  })

  it('sans emploi du temps déclaré, la journée entière est disponible', () => {
    const plan = computePlan(input({ schedule: [] }), NOW)
    expect(plan.capacities[0]!.rawCapacityMinutes).toBe(1440)
  })
})

describe('A.1 — occurrence unique vs récurrente de l’emploi du temps', () => {
  const rendezVous = (over: Partial<ScheduleEntry> = {}): ScheduleEntry => ({
    dayOfWeek: 1, // mardi — le jour de NOW et de son homologue une semaine plus tard.
    startMinute: 600,
    endMinute: 720,
    categoryType: 'commitment',
    label: 'Rendez-vous',
    color: '#5E81AC',
    ...over,
  })

  it('une occurrence unique ne réduit la capacité que SA date, jamais la semaine suivante', () => {
    const plan = computePlan(
      input({
        rangeEnd: '2026-08-24', // deux mardis dans l'horizon : le 11 et le 18 août.
        schedule: [...sleepScheduleEntries('23:00', '07:00'), rendezVous({ date: '2026-08-11' })],
      }),
      NOW,
    )
    const premierMardi = plan.capacities.find((c) => c.date === '2026-08-11')!
    const secondMardi = plan.capacities.find((c) => c.date === '2026-08-18')!
    // 1440 − 480 (sommeil) − 120 (rendez-vous) = 840.
    expect(premierMardi.rawCapacityMinutes).toBe(840)
    // Le mardi suivant n'a jamais entendu parler de ce rendez-vous.
    expect(secondMardi.rawCapacityMinutes).toBe(960)
  })

  it('sans date, le comportement historique tient : récurrent chaque semaine', () => {
    const plan = computePlan(
      input({
        rangeEnd: '2026-08-24',
        schedule: [...sleepScheduleEntries('23:00', '07:00'), rendezVous()],
      }),
      NOW,
    )
    const premierMardi = plan.capacities.find((c) => c.date === '2026-08-11')!
    const secondMardi = plan.capacities.find((c) => c.date === '2026-08-18')!
    expect(premierMardi.rawCapacityMinutes).toBe(840)
    expect(secondMardi.rawCapacityMinutes).toBe(840)
  })
})

describe('CRITÈRE 1 — jamais « faisable » avec 0 minute placée', () => {
  it('une tâche faisable reçoit vraiment des blocs', () => {
    const plan = computePlan(input({ tasks: [task({ remainingMinutes: 120 })] }), NOW)
    expect(plan.feasibility.globallyFeasible).toBe(true)
    expect(plan.totalMinutesPlaced).toBeGreaterThan(0)
    expect(plan.blocks.filter((b) => b.kind === 'task').length).toBeGreaterThan(0)
  })

  it('un plan déclaré faisable place tout ce qu’il a promis', () => {
    const plan = computePlan(input({ tasks: [task({ remainingMinutes: 120 })] }), NOW)
    const verdict = plan.verdicts[0]!
    expect(verdict.status).toBe('placed')
    expect(verdict.placedMinutes).toBeGreaterThanOrEqual(verdict.neededMinutes)
  })
})

describe('CRITÈRE 2 — un déficit partiel ne bloque jamais le reste', () => {
  it('une tâche impossible est placée autant que possible, pas abandonnée', () => {
    const plan = computePlan(
      input({ tasks: [task({ remainingMinutes: 5000, deadline: '2026-08-13' })] }),
      NOW,
    )
    expect(plan.feasibility.globallyFeasible).toBe(false)
    expect(plan.totalMinutesPlaced).toBeGreaterThan(0)
    expect(plan.verdicts[0]!.status).toBe('partial')
  })

  it('une tâche impossible n’empêche pas les autres d’être placées entièrement', () => {
    const plan = computePlan(
      input({
        tasks: [
          task({
            id: uuid(1),
            title: 'Impossible',
            remainingMinutes: 5000,
            deadline: '2026-08-13',
          }),
          task({ id: uuid(2), title: 'Faisable', remainingMinutes: 60, deadline: '2026-08-16' }),
        ],
      }),
      NOW,
    )
    const faisable = plan.verdicts.find((v) => v.title === 'Faisable')!
    expect(faisable.status).toBe('placed')
    expect(plan.verdicts.find((v) => v.title === 'Impossible')!.placedMinutes).toBeGreaterThan(0)
  })

  it('le déficit est chiffré avec ses options, jamais un statut vague', () => {
    const plan = computePlan(
      input({ tasks: [task({ remainingMinutes: 5000, deadline: '2026-08-13' })] }),
      NOW,
    )
    const deficit = plan.feasibility.deficits[0]!
    expect(deficit.deficitMinutes).toBeGreaterThan(0)
    expect(deficit.options.length).toBeGreaterThanOrEqual(2)
    expect(deficit.options.every((o) => o.minutesFreed > 0)).toBe(true)
  })
})

describe('CRITÈRE 5 — un objectif ne peut jamais avoir de deadline', () => {
  it('la forme d’un objectif ne porte aucune date d’échéance', () => {
    expect(objective()).not.toHaveProperty('deadline')
  })

  it('les objectifs ne passent jamais par le test de charge des deadlines', () => {
    const plan = computePlan(input({ objectives: [objective()] }), NOW)
    expect(plan.feasibility.densities).toHaveLength(0)
    expect(plan.blocks.filter((b) => b.kind === 'objective').length).toBeGreaterThan(0)
  })

  it('un objectif est servi par quota hebdomadaire, jamais par urgence', () => {
    const plan = computePlan(input({ objectives: [objective({ weeklyTargetMinutes: 420 })] }), NOW)
    const served = plan.blocks
      .filter((b) => b.kind === 'objective')
      .reduce((s, b) => s + b.workMinutes, 0)
    expect(served).toBeGreaterThan(0)
    expect(served).toBeLessThanOrEqual(420)
  })
})

describe('D.4/E.3 — semaine calendaire et rythme fixe', () => {
  const guitare = objective({ weeklyTargetMinutes: 420 }) // 60 min par jour

  const servedOn = (plan: ReturnType<typeof computePlan>, date: string) =>
    plan.blocks
      .filter((b) => b.kind === 'objective' && b.date === date)
      .reduce((s, b) => s + b.workMinutes, 0)

  it('le quota du jour vient du rythme fixe, pas des jours qui restent', () => {
    const plan = computePlan(input({ objectives: [guitare] }), NOW)
    // Mardi et mercredi sont deux jours d'école de capacité identique : le
    // rythme ne monte pas parce que la semaine avance.
    expect(servedOn(plan, '2026-08-12')).toBe(servedOn(plan, TODAY))
    // Un samedi, deux fois plus libre, en porte plus — mais toujours dérivé du
    // même rythme, jamais du rattrapage de la semaine.
    expect(servedOn(plan, '2026-08-15')).toBeGreaterThan(servedOn(plan, TODAY))
  })

  it('une semaine entamée un vendredi donne un total plus bas, jamais rattrapé', () => {
    // Vendredi → dimanche : trois jours sur sept, donc environ 3 × 60 min.
    const partielle = computePlan(
      input({ today: '2026-08-14', rangeEnd: '2026-08-16', objectives: [guitare] }),
      new Date(2026, 7, 14, 8, 0),
    )
    const total = partielle.blocks
      .filter((b) => b.kind === 'objective')
      .reduce((s, b) => s + b.workMinutes, 0)

    expect(total).toBeGreaterThan(0)
    // Très en dessous des 420 min de la cible : le manque n'est pas rattrapé.
    expect(total).toBeLessThanOrEqual(3 * 60 + 15)
  })

  it('une semaine partielle n’est jamais signalée comme un déficit', () => {
    // Objectif créé le vendredi : lundi à jeudi ne lui appartiennent pas.
    const cree = objective({
      weeklyTargetMinutes: 420,
      createdAt: new Date(2026, 7, 14, 9, 0).toISOString(),
    })
    const plan = computePlan(
      input({
        today: '2026-08-14',
        rangeEnd: '2026-08-16',
        objectives: [cree],
        objectiveLastServed: { [cree.id]: '2026-08-10' },
      }),
      new Date(2026, 7, 14, 8, 0),
    )
    expect(plan.signals.filter((s) => s.type === 'objective_stalled')).toEqual([])
  })

  it('un dimanche isolé n’absorbe jamais la semaine qui s’achève', () => {
    const plan = computePlan(
      input({ today: '2026-08-16', rangeEnd: '2026-08-18', objectives: [guitare] }),
      new Date(2026, 7, 16, 8, 0),
    )
    // Le rythme tient : jamais les 420 min de la semaine écrasées sur un jour.
    expect(servedOn(plan, '2026-08-16')).toBeLessThanOrEqual(180)
  })

  it('la cadence normale revient dès le lundi suivant', () => {
    // La semaine en cours est déjà servie en entier : plus rien le dimanche.
    const plan = computePlan(
      input({
        today: '2026-08-16',
        rangeEnd: '2026-08-18',
        objectives: [guitare],
        weeklyObjectiveServed: { [guitare.id]: 420 },
      }),
      new Date(2026, 7, 16, 8, 0),
    )
    expect(servedOn(plan, '2026-08-16')).toBe(0)
    // Lundi ouvre une semaine calendaire neuve : le compteur repart de zéro.
    expect(servedOn(plan, '2026-08-17')).toBeGreaterThan(0)
  })
})

describe('CRITÈRE 6 — deux ancres ne peuvent pas occuper le même créneau', () => {
  it('une ancre est posée à son heure exacte, tous les jours concernés', () => {
    const plan = computePlan(input({ ancres: [ancre()] }), NOW)
    const blocks = plan.blocks.filter((b) => b.kind === 'ancre')
    expect(blocks).toHaveLength(7)
    expect(blocks.every((b) => b.startMinute === 1080 && b.durationMinutes === 60)).toBe(true)
  })

  it('rien d’autre ne vient se poser sur le créneau d’une ancre', () => {
    const plan = computePlan(
      input({ ancres: [ancre()], tasks: [task({ remainingMinutes: 600 })] }),
      NOW,
    )
    const overlaps = plan.blocks.filter(
      (b) => b.kind !== 'ancre' && b.startMinute < 1140 && b.endMinute > 1080,
    )
    expect(overlaps).toEqual([])
  })
})

describe('CRITÈRE 8 — cascade : deadline → importance → SRPT → création', () => {
  it('la deadline la plus proche est servie en premier, même avec une importance basse', () => {
    const plan = computePlan(
      input({
        tasks: [
          task({
            id: uuid(1),
            title: 'Urgente',
            deadline: '2026-08-12',
            importance: 1,
            remainingMinutes: 90,
          }),
          task({
            id: uuid(2),
            title: 'Importante',
            deadline: '2026-08-17',
            importance: 10,
            remainingMinutes: 90,
          }),
        ],
      }),
      NOW,
    )
    const first = plan.blocks.find((b) => b.kind === 'task')!
    expect(first.label).toBe('Urgente')
  })

  it('à deadline égale, l’importance déclarée passe devant', () => {
    const plan = computePlan(
      input({
        tasks: [
          task({
            id: uuid(1),
            title: 'Basse',
            deadline: '2026-08-15',
            importance: 2,
            remainingMinutes: 60,
          }),
          task({
            id: uuid(2),
            title: 'Haute',
            deadline: '2026-08-15',
            importance: 9,
            remainingMinutes: 60,
          }),
        ],
      }),
      NOW,
    )
    expect(plan.blocks.find((b) => b.kind === 'task')!.label).toBe('Haute')
  })
})

describe('D.5 — forme des blocs', () => {
  it('aucun bloc sous 25 minutes de travail', () => {
    const plan = computePlan(input({ tasks: [task({ remainingMinutes: 400 })] }), NOW)
    expect(
      plan.blocks
        .filter((b) => b.kind === 'task')
        .every((b) => b.workMinutes >= TASK_CONSTANTS.minBlockMinutes),
    ).toBe(true)
  })

  it('aucun bloc de travail au-delà de 90 minutes', () => {
    const plan = computePlan(
      input({ tasks: [task({ remainingMinutes: 900, deadline: '2026-08-17' })] }),
      NOW,
    )
    expect(
      plan.blocks
        .filter((b) => b.kind === 'task')
        .every((b) => b.workMinutes <= TASK_CONSTANTS.targetBlockMinutes),
    ).toBe(true)
  })

  it('la pause est INCLUSE dans l’empreinte du bloc, jamais ajoutée après', () => {
    const plan = computePlan(input({ tasks: [task({ remainingMinutes: 400 })] }), NOW)
    for (const b of plan.blocks.filter((b) => b.kind === 'task')) {
      expect(b.workMinutes + b.breakMinutes).toBe(b.durationMinutes)
      expect(b.endMinute - b.startMinute).toBe(b.durationMinutes)
    }
  })

  it('sans crise, une tâche ne dépasse pas 40 % de la capacité d’un jour', () => {
    const plan = computePlan(
      input({ tasks: [task({ remainingMinutes: 600, deadline: '2026-08-17' })] }),
      NOW,
    )
    for (const capacity of plan.capacities) {
      const dayMinutes = plan.blocks
        .filter((b) => b.kind === 'task' && b.date === capacity.date)
        .reduce((s, b) => s + b.workMinutes, 0)
      expect(dayMinutes).toBeLessThanOrEqual(Math.ceil(capacity.effectiveCapacityMinutes * 0.4) + 1)
    }
  })

  it('le travail est découpé sur plusieurs jours plutôt qu’entassé', () => {
    const plan = computePlan(
      input({ tasks: [task({ remainingMinutes: 600, deadline: '2026-08-17' })] }),
      NOW,
    )
    const days = new Set(plan.blocks.filter((b) => b.kind === 'task').map((b) => b.date))
    expect(days.size).toBeGreaterThan(1)
  })

  it('rien n’est jamais placé après la deadline', () => {
    const plan = computePlan(
      input({ tasks: [task({ remainingMinutes: 5000, deadline: '2026-08-13' })] }),
      NOW,
    )
    expect(plan.blocks.filter((b) => b.kind === 'task').every((b) => b.date <= '2026-08-13')).toBe(
      true,
    )
  })
})

describe('D.5/A.4 — budget de travail profond', () => {
  /** G.2 : cinq blocs menés à terme sur une heure la font passer PROFONDE. */
  const deepHours = (...hours: number[]): LearningObservation[] =>
    hours.flatMap((startHour) =>
      Array.from({ length: 5 }, () => ({
        startHour,
        completed: true,
        createdAt: '2026-08-01T10:00:00.000Z',
      })),
    )

  /** Journées entièrement libres, 16 h → 21 h apprises comme profondes. */
  const journeeLibre = (over: Partial<PlanningInput> = {}) =>
    input({
      schedule: sleepScheduleEntries('23:00', '07:00'),
      observations: deepHours(16, 17, 18, 19, 20),
      ...over,
    })

  const deepMinutes = (plan: ReturnType<typeof computePlan>, date: string) =>
    plan.blocks
      .filter((b) => b.date === date && b.kind !== 'ancre' && b.cognitiveWindow === 'PROFONDE')
      .reduce((s, b) => s + b.workMinutes, 0)

  it('2 blocs de 90 min par jour, partagés entre tâches ET objectifs', () => {
    const plan = computePlan(
      journeeLibre({
        objectives: [objective({ weeklyTargetMinutes: 1260 })], // 180 min par jour
        tasks: [task({ remainingMinutes: 900, deadline: '2026-08-17' })],
      }),
      NOW,
    )
    // Le budget profond du jour ne dépasse jamais 180, tâches et objectifs
    // confondus. L'objectif n'en prend qu'un bloc : ses deux séances sont à
    // 3 h l'une de l'autre, la seconde tombe hors de la fenêtre profonde, et
    // la tâche prend le reste du budget.
    for (const c of plan.capacities) {
      expect(deepMinutes(plan, c.date)).toBeLessThanOrEqual(
        TASK_CONSTANTS.maxDeepBlocksPerDay * TASK_CONSTANTS.targetBlockMinutes,
      )
    }
    expect(deepMinutes(plan, TODAY)).toBe(180)
    const obj = plan.blocks
      .filter((b) => b.date === TODAY && b.kind === 'objective')
      .sort((a, b) => a.startMinute - b.startMinute)
    expect(obj).toHaveLength(2)
    expect(obj[1]!.startMinute - obj[0]!.endMinute).toBeGreaterThanOrEqual(180)
  })

  it('au-delà du budget, le travail part en fenêtre NORMALE/BASSE — jamais bloqué', () => {
    const plan = computePlan(
      journeeLibre({
        objectives: [objective({ weeklyTargetMinutes: 1260 })],
        tasks: [task({ remainingMinutes: 900, deadline: '2026-08-17' })],
      }),
      NOW,
    )
    const horsProfond = plan.blocks
      .filter((b) => b.date === TODAY && b.kind !== 'ancre' && b.cognitiveWindow !== 'PROFONDE')
      .reduce((s, b) => s + b.workMinutes, 0)
    expect(horsProfond).toBeGreaterThan(0)
    expect(plan.verdicts[0]!.placedMinutes).toBeGreaterThan(0)
  })

  it('les ancres ne consomment jamais le budget profond', () => {
    const plan = computePlan(
      journeeLibre({
        // 16 h → 17 h, en pleine fenêtre profonde : placée par immobilité (D.1).
        ancres: [ancre({ anchorMinute: 960, normalMaxMinutes: 60 })],
        objectives: [objective({ weeklyTargetMinutes: 1260 })],
        tasks: [task({ remainingMinutes: 900, deadline: '2026-08-17' })],
      }),
      NOW,
    )
    expect(plan.blocks.some((b) => b.kind === 'ancre' && b.date === TODAY)).toBe(true)
    // L'ancre occupe une heure profonde sans rien retirer au budget.
    expect(deepMinutes(plan, TODAY)).toBe(180)
  })

  it('ADDENDUM 4 — beaucoup d’étalement disponible : deux blocs de 90 min sont espacés, pas collés', () => {
    const plan = computePlan(
      journeeLibre({ tasks: [task({ remainingMinutes: 180, deadline: TODAY })] }),
      NOW,
    )
    const blocs = plan.blocks
      .filter((b) => b.date === TODAY && b.kind === 'task')
      .sort((a, b) => a.startMinute - b.startMinute)

    expect(blocs.length).toBeGreaterThanOrEqual(2)
    expect(blocs[1]!.startMinute - blocs[0]!.endMinute).toBeGreaterThanOrEqual(
      TASK_CONSTANTS.minBlockMinutes,
    )
  })

  it('si toutes les fenêtres sont profondes, le budget cède — le travail passe quand même', () => {
    const plan = computePlan(
      journeeLibre({
        observations: deepHours(...Array.from({ length: 24 }, (_, hour) => hour)),
        tasks: [task({ remainingMinutes: 900, deadline: '2026-08-12' })],
      }),
      NOW,
    )
    const blocs = plan.blocks.filter((b) => b.date === TODAY && b.kind === 'task')
    // « Jamais bloqué » passe avant le budget : faute d'autre fenêtre, le
    // travail va quand même dans la fenêtre profonde.
    expect(blocs.length).toBeGreaterThan(TASK_CONSTANTS.maxDeepBlocksPerDay)
    expect(deepMinutes(plan, TODAY)).toBeGreaterThan(180)
  })

  it('ADDENDUM 4 — un objectif ET une tâche demandent chacun 1 bloc profond : le compteur partagé les compte ensemble (1 + 1 = 2), et un 3e est refusé', () => {
    // Aucune des deux tâches n'est en crise (échéance large) : l'objectif n'est
    // donc jamais préempté (D.2) et les deux sources se disputent le MÊME
    // budget du jour, dans des conditions normales.
    const plan = computePlan(
      journeeLibre({
        objectives: [objective({ weeklyTargetMinutes: 630 })], // rythme = 90 min/jour
        tasks: [
          task({ id: uuid(1), title: 'T1', remainingMinutes: 90, deadline: '2026-08-17' }),
          task({
            id: uuid(2),
            title: 'T2',
            remainingMinutes: 90,
            deadline: '2026-08-17',
            createdAt: '2026-08-02T10:00:00.000Z',
          }),
        ],
      }),
      NOW,
    )
    const dayBlocks = plan.blocks.filter((b) => b.date === TODAY && b.kind !== 'ancre')
    const profondObjectif = dayBlocks
      .filter((b) => b.kind === 'objective' && b.cognitiveWindow === 'PROFONDE')
      .reduce((s, b) => s + b.workMinutes, 0)
    const profondTaches = dayBlocks
      .filter((b) => b.kind === 'task' && b.cognitiveWindow === 'PROFONDE')
      .reduce((s, b) => s + b.workMinutes, 0)

    // Les deux SOURCES contribuent réellement — ni l'une ni l'autre ne rafle
    // tout le budget pendant que l'autre reste à 0.
    expect(profondObjectif).toBe(90)
    expect(profondTaches).toBe(90)
    // Ensemble, elles ne dépassent JAMAIS 180 : un seul compteur partagé —
    // jamais 2 blocs pour les objectifs PLUS 2 blocs pour les tâches.
    expect(deepMinutes(plan, TODAY)).toBe(180)
    // Les deux tâches sont pourtant bien placées en entier : le 3e bloc
    // demandé (T2) n'a pas été bloqué, seulement refusé en fenêtre PROFONDE.
    const t1 = plan.verdicts.find((v) => v.title === 'T1')!
    const t2 = plan.verdicts.find((v) => v.title === 'T2')!
    expect(t1.status).toBe('placed')
    expect(t2.status).toBe('placed')
    // Placement par score : laquelle des deux passe hors fenêtre profonde
    // dépend du créneau (le pic du matin attire T1) — mais l'une des deux y va.
    expect(
      dayBlocks.some((b) => b.kind === 'task' && b.cognitiveWindow !== 'PROFONDE'),
    ).toBe(true)
  })

  it('ADDENDUM 4 — journée très contrainte : quand la place manque, les blocs restent consécutifs, sans erreur', () => {
    // Une seule vraie plage libre le soir (obligation fixe 07h10 → 13h40,
    // suivie de son buffer de retour A.2.3, réduit à 10 min par la crise
    // prouvée). Le budget du jour n'autorise qu'un bloc plein plus un reliquat
    // — la preuve que rien n'essaie de forcer un espacement impossible : le
    // reliquat se colle immédiatement après le premier bloc.
    const contrainte: ScheduleEntry[] = [
      ...sleepScheduleEntries('23:00', '07:00'),
      {
        dayOfWeek: 1,
        startMinute: 430,
        endMinute: 820,
        categoryType: 'work',
        label: 'Travail',
        color: '#5E81AC',
      },
    ]
    const plan = computePlan(
      input({
        schedule: contrainte,
        tasks: [task({ remainingMinutes: 5000, deadline: TODAY })],
      }),
      NOW,
    )
    expect(plan.feasibility.globallyFeasible).toBe(false)

    const blocs = plan.blocks
      .filter((b) => b.date === TODAY && b.kind === 'task')
      .sort((a, b) => a.startMinute - b.startMinute)
    expect(blocs.length).toBeGreaterThanOrEqual(2)
    // Aucune erreur interne (C.4), et le second bloc touche la fin du premier
    // — jamais de trou artificiel forcé faute de place pour espacer.
    expect(plan.internalError).toBeUndefined()
    expect(blocs[1]!.startMinute).toBe(blocs[0]!.endMinute)
  })
})

describe('invariants de placement', () => {
  const busy = input({
    tasks: [
      task({ id: uuid(1), title: 'A', remainingMinutes: 300, deadline: '2026-08-14' }),
      task({
        id: uuid(2),
        title: 'B',
        remainingMinutes: 240,
        deadline: '2026-08-16',
        importance: 8,
      }),
      task({ id: uuid(3), title: 'C', remainingMinutes: 120, deadline: '2026-08-17' }),
    ],
    objectives: [objective()],
    ancres: [ancre()],
  })

  it('aucun bloc ne chevauche un autre, aucun jour confondu', () => {
    const plan = computePlan(busy, NOW)
    const byDay = new Map<string, typeof plan.blocks>()
    for (const b of plan.blocks) byDay.set(b.date, [...(byDay.get(b.date) ?? []), b])

    for (const blocks of byDay.values()) {
      const sorted = [...blocks].sort((a, b) => a.startMinute - b.startMinute)
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i]!.startMinute).toBeGreaterThanOrEqual(sorted[i - 1]!.endMinute)
      }
    }
  })

  it('aucun bloc ne tombe dans le sommeil ni dans les cours', () => {
    const plan = computePlan(busy, NOW)
    for (const b of plan.blocks) {
      expect(b.startMinute).toBeGreaterThanOrEqual(420) // après le réveil
      expect(b.endMinute).toBeLessThanOrEqual(1380) // avant le coucher
      const isWeekday = b.date <= '2026-08-14'
      if (isWeekday && b.kind !== 'ancre') {
        expect(b.startMinute >= 960 || b.endMinute <= 480).toBe(true)
      }
    }
  })

  it('le total placé par jour ne dépasse jamais la capacité effective', () => {
    const plan = computePlan(busy, NOW)
    for (const capacity of plan.capacities) {
      const used = plan.blocks
        .filter((b) => b.date === capacity.date && b.kind !== 'ancre')
        .reduce((s, b) => s + b.durationMinutes, 0)
      expect(used).toBeLessThanOrEqual(capacity.effectiveCapacityMinutes)
    }
  })

  it('C.4 : les minutes posées égalent les minutes débitées des sources', () => {
    const plan = computePlan(busy, NOW)
    expect(plan.internalError).toBeUndefined()
    expect(plan.totalMinutesPlaced).toBe(plan.totalMinutesPlanned)
    // Le total n'est pas trivialement zéro : le contrôle porte sur du vrai
    // travail placé, pas sur deux compteurs vides.
    expect(plan.totalMinutesPlaced).toBeGreaterThan(0)
  })

  it('C.4 : le total débité se recalcule bien depuis les SOURCES, pas depuis les blocs', () => {
    const plan = computePlan(busy, NOW)

    // Côté sources : ce que les tâches ont perdu de leur besoin restant.
    const debiteTaches = plan.verdicts.reduce((s, v) => s + v.placedMinutes, 0)
    // Côté calendrier : ce que les blocs de tâches portent réellement.
    const blocsTaches = plan.blocks
      .filter((b) => b.kind === 'task')
      .reduce((s, b) => s + b.workMinutes, 0)
    expect(debiteTaches).toBe(blocsTaches)

    // Et les objectifs complètent exactement la différence avec le total.
    const blocsObjectifs = plan.blocks
      .filter((b) => b.kind === 'objective')
      .reduce((s, b) => s + b.workMinutes, 0)
    expect(plan.totalMinutesPlanned).toBe(debiteTaches + blocsObjectifs)
    expect(blocsObjectifs).toBeGreaterThan(0)
  })

  it('le plan est déterministe : mêmes entrées, même résultat', () => {
    const a = computePlan(busy, NOW)
    const b = computePlan(busy, NOW)
    expect(b.blocks).toEqual(a.blocks)
  })
})

describe('E — repos réservé avant distribution', () => {
  it('le plancher de repos est retiré de la capacité, pas de ce qui reste', () => {
    const plan = computePlan(input(), NOW)
    const day = plan.capacities[0]!
    // 20 % de 480 = 96, au-dessus du plancher d'une heure.
    expect(day.restReservedMinutes).toBe(96)
    expect(day.effectiveCapacityMinutes).toBe(
      day.rawCapacityMinutes -
        day.unusableMinutes -
        day.restReservedMinutes -
        day.fatiguePenaltyMinutes,
    )
  })

  it('E.4 : trois jours mesurés au-dessus de 85 % réduisent la capacité du jour suivant', () => {
    const withFatigue = computePlan(
      input({
        dailyUtilization: { '2026-08-08': 90, '2026-08-09': 92, '2026-08-10': 95 },
      }),
      NOW,
    )
    const without = computePlan(input(), NOW)
    expect(withFatigue.capacities[0]!.fatiguePenaltyMinutes).toBeGreaterThan(0)
    expect(withFatigue.capacities[0]!.effectiveCapacityMinutes).toBeLessThan(
      without.capacities[0]!.effectiveCapacityMinutes,
    )
  })

  it('E.4 : une crise prouvée rogne la protection de fatigue sans jamais l’annuler', () => {
    const fatigue = {
      '2026-08-08': 90,
      '2026-08-09': 92,
      '2026-08-10': 95,
    }
    // Même historique de fatigue, avec et sans crise prouvée le jour même.
    const sansCrise = computePlan(input({ dailyUtilization: fatigue }), NOW)
    const enCrise = computePlan(
      input({
        dailyUtilization: fatigue,
        tasks: [task({ remainingMinutes: 5000, deadline: '2026-08-12' })],
      }),
      NOW,
    )
    expect(enCrise.feasibility.globallyFeasible).toBe(false)

    const jourSansCrise = sansCrise.capacities.find((c) => c.date === TODAY)!
    const jourEnCrise = enCrise.capacities.find((c) => c.date === TODAY)!

    // 3 jours consécutifs >85 % → réduction de 60 % hors crise, plafonnée à
    // 40 % quand la crise est prouvée : la protection cède, elle ne disparaît
    // jamais (plancher absolu 60 % de la capacité normale).
    expect(jourSansCrise.fatiguePenaltyMinutes).toBeGreaterThan(jourEnCrise.fatiguePenaltyMinutes)
    expect(jourEnCrise.fatiguePenaltyMinutes).toBeGreaterThan(0)

    // C.3 : l'écart rendu par le plancher de crise est chiffré, jamais silencieux.
    expect(jourEnCrise.fatigueCrisisReliefMinutes).toBeGreaterThan(0)
    // Hors crise, rien n'est rendu — le chiffre reste à zéro.
    expect(jourSansCrise.fatigueCrisisReliefMinutes).toBe(0)

    // Plancher absolu, mesuré sur le socle du jour en crise lui-même (les deux
    // jours n'ont pas le même socle : la crise libère aussi la zone de réveil,
    // comparer les pénalités d'un plan à l'autre mélangerait deux effets).
    // La réduction passe de 60 % à 40 % du socle : la pénalité retenue vaut
    // donc les deux tiers de celle qui se serait appliquée sans crise.
    const penaliteSansPlancher =
      jourEnCrise.fatiguePenaltyMinutes + jourEnCrise.fatigueCrisisReliefMinutes
    expect(jourEnCrise.fatiguePenaltyMinutes / penaliteSansPlancher).toBeCloseTo(40 / 60, 2)
  })

  it('sans mesure, aucune pénalité inventée', () => {
    const plan = computePlan(input(), NOW)
    expect(plan.capacities[0]!.fatiguePenaltyMinutes).toBe(0)
  })
})

describe('A.2 — zone de réveil', () => {
  it('rien ne se planifie dans les 30 minutes qui suivent le lever', () => {
    const plan = computePlan(
      input({
        tasks: [task({ remainingMinutes: 600, deadline: '2026-08-17' })],
        objectives: [objective()],
      }),
      NOW,
    )
    // Lever à 7 h : le premier travail possible est à 7 h 30.
    expect(plan.blocks.filter((b) => b.kind !== 'ancre').every((b) => b.startMinute >= 450)).toBe(
      true,
    )
    expect(plan.capacities.every((c) => c.wakeZoneMinutes === 30)).toBe(true)
    expect(plan.capacities.every((c) => c.wakeZoneSacrificedMinutes === 0)).toBe(true)
  })

  it('crise prouvée : la zone tombe à 10 min, jamais plus bas, et le chiffre est dit', () => {
    const plan = computePlan(
      input({ tasks: [task({ remainingMinutes: 5000, deadline: '2026-08-13' })] }),
      NOW,
    )
    expect(plan.feasibility.globallyFeasible).toBe(false)

    const enCrise = plan.capacities.find((c) => c.date === TODAY)!
    expect(enCrise.wakeZoneMinutes).toBe(10)
    expect(enCrise.wakeZoneSacrificedMinutes).toBe(20)
    expect(plan.blocks.filter((b) => b.kind !== 'ancre').every((b) => b.startMinute >= 430)).toBe(
      true,
    )

    // Passée la deadline prouvée en déficit, la protection revient entière.
    const apres = plan.capacities.find((c) => c.date === '2026-08-16')!
    expect(apres.wakeZoneMinutes).toBe(30)
    expect(apres.wakeZoneSacrificedMinutes).toBe(0)
  })

  it('sans crise prouvée, aucune minute de réveil n’est jamais prise', () => {
    // Une journée simplement bien remplie n'est pas une crise : densité ≤ 1.
    const plan = computePlan(
      input({ tasks: [task({ remainingMinutes: 900, deadline: '2026-08-17' })] }),
      NOW,
    )
    expect(plan.feasibility.globallyFeasible).toBe(true)
    expect(plan.capacities.every((c) => c.wakeZoneSacrificedMinutes === 0)).toBe(true)
  })
})

describe('A.2.3 — buffer de retour après une obligation fixe', () => {
  /** Trajet 16 h 40 → 17 h 10, après l'école (16 h) et avant le reste du soir. */
  const withCommute = (over: Partial<ScheduleEntry> = {}): ScheduleEntry => ({
    dayOfWeek: 1, // mardi — le jour de NOW.
    startMinute: 1000,
    endMinute: 1030,
    categoryType: 'commute',
    label: 'Trajet',
    color: '#5E81AC',
    ...over,
  })

  it('École/Travail/Engagement/Autre : aucun bloc dans les 30 min qui suivent la fin, jour normal', () => {
    const plan = computePlan(
      input({ tasks: [task({ remainingMinutes: 600, deadline: '2026-08-17' })] }),
      NOW,
    )
    // École finit à 16 h (960 min) : rien avant 16 h 30 (990 min).
    const apresEcole = plan.blocks.filter(
      (b) => b.date === TODAY && b.kind !== 'ancre' && b.startMinute >= 960,
    )
    expect(apresEcole.length).toBeGreaterThan(0) // du travail est bien placé ce soir-là.
    expect(apresEcole.every((b) => b.startMinute >= 990)).toBe(true)
    expect(plan.capacities.find((c) => c.date === TODAY)!.postObligationBufferMinutes).toBe(30)
  })

  it('Trajet : aucun bloc dans les 5 min qui suivent la fin, jour normal', () => {
    const schedule = [...sleepScheduleEntries('23:00', '07:00'), ...school, withCommute()]
    const plan = computePlan(
      input({ schedule, tasks: [task({ remainingMinutes: 200, deadline: '2026-08-17' })] }),
      NOW,
    )
    const apresTrajet = plan.blocks.filter(
      (b) => b.date === TODAY && b.kind !== 'ancre' && b.startMinute >= 1030,
    )
    expect(apresTrajet.length).toBeGreaterThan(0)
    expect(apresTrajet.every((b) => b.startMinute >= 1035)).toBe(true)
    expect(plan.capacities.find((c) => c.date === TODAY)!.commuteBufferMinutes).toBe(5)
  })

  it('crise prouvée : le buffer réductible tombe à 10 min, le Trajet reste à 5 — même scénario', () => {
    const schedule = [...sleepScheduleEntries('23:00', '07:00'), ...school, withCommute()]
    const plan = computePlan(
      input({ schedule, tasks: [task({ remainingMinutes: 5000, deadline: '2026-08-13' })] }),
      NOW,
    )
    expect(plan.feasibility.globallyFeasible).toBe(false)

    const enCrise = plan.capacities.find((c) => c.date === TODAY)!
    // École : chiffré et visible (C.3) — réduit, jamais sous 10.
    expect(enCrise.postObligationBufferMinutes).toBe(10)
    expect(enCrise.postObligationSacrificedMinutes).toBe(20)
    // Trajet, MÊME scénario de crise : jamais réduit, aucun sacrifice.
    expect(enCrise.commuteBufferMinutes).toBe(5)

    const dayBlocks = plan.blocks.filter((b) => b.date === TODAY && b.kind !== 'ancre')
    // Rien avant 16 h 10 après l'école (960 + 10, buffer réduit).
    expect(dayBlocks.filter((b) => b.startMinute >= 960).every((b) => b.startMinute >= 970)).toBe(
      true,
    )
    // Rien avant 17 h 15 après le trajet (1030 + 5, buffer inchangé).
    expect(dayBlocks.filter((b) => b.startMinute >= 1030).every((b) => b.startMinute >= 1035)).toBe(
      true,
    )
  })

  it('plusieurs obligations le même jour, types différents : chaque instance reçoit son propre buffer', () => {
    // École (réductible) + Trajet (fixe) le même jour — déjà démontré séparé et
    // chiffré indépendamment côté capacity.ts ; ici, la preuve au niveau du
    // plan complet : aucun des deux buffers ne contamine l'autre.
    const schedule = [...sleepScheduleEntries('23:00', '07:00'), ...school, withCommute()]
    const plan = computePlan(
      input({ schedule, tasks: [task({ remainingMinutes: 300, deadline: '2026-08-17' })] }),
      NOW,
    )
    const day = plan.capacities.find((c) => c.date === TODAY)!
    expect(day.postObligationBufferMinutes).toBe(30) // l'école, seule.
    expect(day.commuteBufferMinutes).toBe(5) // le trajet, seul.
  })
})

describe('D.3 — version minimale des ancres', () => {
  it('journée saturée → l’ancre passe à sa version minimale, sans disparaître', () => {
    const plan = computePlan(
      input({
        ancres: [ancre()],
        tasks: [task({ remainingMinutes: 5000, deadline: '2026-08-13' })],
      }),
      NOW,
    )
    const today = plan.blocks.find((b) => b.kind === 'ancre' && b.date === TODAY)!
    expect(today.durationMinutes).toBe(24)
    expect(today.reducedToMinimum).toBe(true)
  })

  it('journée normale → l’ancre garde sa durée pleine', () => {
    const plan = computePlan(input({ ancres: [ancre()] }), NOW)
    expect(plan.blocks.find((b) => b.kind === 'ancre')!.durationMinutes).toBe(60)
  })
})

describe('D.2 — préemption', () => {
  const objectiveMinutesOn = (plan: PlanningResult, date: string): number =>
    plan.blocks
      .filter((b) => b.kind === 'objective' && b.date === date)
      .reduce((s, b) => s + b.workMinutes, 0)

  it('une tâche à marge négative décale le quota d’un objectif, sans le supprimer', () => {
    const crisis = computePlan(
      input({
        objectives: [objective()],
        tasks: [task({ remainingMinutes: 5000, deadline: '2026-08-12' })],
      }),
      NOW,
    )
    const todayObjective = crisis.blocks.filter((b) => b.kind === 'objective' && b.date === TODAY)
    expect(todayObjective).toHaveLength(0)
    // Décalé, pas supprimé : l'objectif est servi une fois la crise passée.
    expect(crisis.blocks.filter((b) => b.kind === 'objective').length).toBeGreaterThan(0)
  })

  it('entre 85 % et 100 % de tension, l’objectif cède une part croissante — jamais tout ou rien', () => {
    // Quota du jour sous un bloc (80 min), mais bien au-dessus du bloc minimum
    // (25 min, A.2/D.5) une fois la part volée retranchée. Au-delà d'un bloc,
    // la limite de 2 séances à 3 h d'écart plafonnerait déjà la journée, et le
    // test ne prouverait plus rien sur la PROGRESSIVITÉ du vol.
    const gros = () => objective({ weeklyTargetMinutes: 560 })

    const base = computePlan(input({ objectives: [gros()] }), NOW)
    const baseObjective = objectiveMinutesOn(base, TODAY)
    expect(baseObjective).toBeGreaterThan(TASK_CONSTANTS.minBlockMinutes * 2)

    // Deadline = aujourd'hui, 240 min dues sur ~264 min de capacité effective
    // d'un jour d'école (480 brutes − 120 inutilisables − 96 de repos) : la
    // densité C.2 avoisine 240/264 ≈ 0,91, dans la zone 85-100 %. Le retard au
    // sens de C.1 (marge calendaire) reste pourtant largement positif (960 min
    // calendaires restantes ce jour contre 240 dues) : l'ANCIEN mécanisme
    // (déclenché sur `marginMinutes < 0`) n'aurait ABSOLUMENT rien cédé ici —
    // c'est exactement le trou que ce test ferme.
    const tendu = computePlan(
      input({
        tasks: [task({ remainingMinutes: 240, deadline: TODAY })],
        objectives: [gros()],
      }),
      NOW,
    )
    expect(tendu.verdicts[0]!.status).not.toBe('unplaced')
    const tenduObjective = objectiveMinutesOn(tendu, TODAY)

    // Réduit, mais ni supprimé ni intact — la montée est progressive.
    expect(tenduObjective).toBeGreaterThan(0)
    expect(tenduObjective).toBeLessThan(baseObjective)
  })

  it('l’avertissement passif apparaît entre 85 et 100 % et disparaît sous 85 %', () => {
    const tendu = computePlan(input({ tasks: [task({ remainingMinutes: 240, deadline: TODAY })] }), NOW)
    expect(tendu.feasibility.tensionWarnings.some((w) => w.deadline === TODAY)).toBe(true)
    expect(tendu.feasibility.deficits).toHaveLength(0)

    // Tâche terminée pour l'essentiel : la tension retombe largement sous 85 %.
    const detendu = computePlan(input({ tasks: [task({ remainingMinutes: 60, deadline: TODAY })] }), NOW)
    expect(detendu.feasibility.tensionWarnings).toHaveLength(0)
  })

  it('l’avertissement actif (chiffre exact) couvre ≥ 100 %, jamais en double avec le passif', () => {
    const enDeficit = computePlan(
      input({ tasks: [task({ remainingMinutes: 5000, deadline: '2026-08-12' })] }),
      NOW,
    )
    const deficit = enDeficit.feasibility.deficits[0]
    expect(deficit).toBeDefined()
    expect(deficit!.deficitMinutes).toBeGreaterThan(0)
    // La même échéance ne produit jamais aussi un avertissement passif.
    expect(enDeficit.feasibility.tensionWarnings.some((w) => w.deadline === deficit!.deadline)).toBe(
      false,
    )
  })
})

describe('B.5.1 — les parties se font DANS L’ORDRE, une à la fois', () => {
  const GROUP = uuid(19)

  /** Un découpage en `count` parties de 120 min, échéance lointaine. */
  const splitInto = (count: number, done: number[] = []): TaskItem[] => [
    // La tâche d'origine : un regroupement visuel, zéro minute propre (B.5).
    task({ id: GROUP, title: 'Dossier', remainingMinutes: 0, deadline: '2026-08-17' }),
    ...Array.from({ length: count }, (_, i) =>
      task({
        id: uuid(20 + i),
        title: `Dossier — Partie ${i + 1}`,
        parentTaskId: GROUP,
        partOrder: i + 1,
        estimatedMinutes: 120,
        remainingMinutes: 120,
        deadline: '2026-08-17',
        status: done.includes(i + 1) ? 'history' : 'active',
      }),
    ),
  ]

  const blocksOfPart = (plan: PlanningResult, n: number): PlacedBlock[] =>
    plan.blocks.filter((b) => b.refId === uuid(20 + n - 1))

  const realBlocks = (plan: PlanningResult): PlacedBlock[] =>
    plan.blocks.filter((b) => b.kind === 'task' && b.preview !== true)

  it('une seule partie est ACTIONNABLE : la 1, les autres ne sont que des aperçus', () => {
    const plan = computePlan(input({ tasks: splitInto(3) }), NOW)

    expect(blocksOfPart(plan, 1).length).toBeGreaterThan(0)
    expect(blocksOfPart(plan, 1).every((b) => b.preview !== true)).toBe(true)

    // Les parties 2 et 3 existent bien sur le calendrier — c'est voulu, il
    // faut voir où elles tomberont — mais AUCUNE n'est actionnable.
    expect(blocksOfPart(plan, 2).length).toBeGreaterThan(0)
    expect(blocksOfPart(plan, 2).every((b) => b.preview === true)).toBe(true)
    expect(blocksOfPart(plan, 3).every((b) => b.preview === true)).toBe(true)

    // La preuve qui compte : tout ce qui est actionnable appartient à UNE
    // seule partie. Jamais deux parties travaillables en même temps.
    expect(new Set(realBlocks(plan).map((b) => b.refId)).size).toBe(1)
  })

  it('la partie 2 ne commence JAMAIS avant que la partie 1 soit entièrement placée', () => {
    const plan = computePlan(input({ tasks: splitInto(3) }), NOW)

    const end = (b: PlacedBlock) => `${b.date}T${String(b.endMinute).padStart(4, '0')}`
    const start = (b: PlacedBlock) => `${b.date}T${String(b.startMinute).padStart(4, '0')}`

    const lastOfPart1 = blocksOfPart(plan, 1).map(end).sort().at(-1)!
    const firstOfPart2 = blocksOfPart(plan, 2).map(start).sort()[0]!
    const lastOfPart2 = blocksOfPart(plan, 2).map(end).sort().at(-1)!
    const firstOfPart3 = blocksOfPart(plan, 3).map(start).sort()[0]!

    expect(firstOfPart2 >= lastOfPart1).toBe(true)
    expect(firstOfPart3 >= lastOfPart2).toBe(true)
  })

  it('l’ordre est 1, 2, 3 — jamais l’ordre arbitraire du 2026-08-23 (1, 4, 2, 5, 3)', () => {
    // Les cinq parties partagent leurs QUATRE clés de cascade, `createdAt`
    // compris. Sans le rang, le comparateur renvoyait 0 partout et l'ordre
    // dépendait de l'implémentation du tri.
    const plan = computePlan(input({ tasks: splitInto(5) }), NOW)

    const chronological = [...plan.blocks]
      .filter((b) => b.kind === 'task')
      .sort((a, b) => a.date.localeCompare(b.date) || a.startMinute - b.startMinute)
      .map((b) => b.label)

    // Première apparition de chaque partie, dans l'ordre du calendrier.
    const firstSeen = [...new Set(chronological)]
    expect(firstSeen).toEqual([
      'Dossier — Partie 1',
      'Dossier — Partie 2',
      'Dossier — Partie 3',
      'Dossier — Partie 4',
      'Dossier — Partie 5',
    ])
  })

  it('partie 1 terminée → la partie 2 devient actionnable, la 3 reste un aperçu', () => {
    const plan = computePlan(input({ tasks: splitInto(3, [1]) }), NOW)

    expect(blocksOfPart(plan, 1)).toHaveLength(0) // terminée : plus rien à placer
    expect(blocksOfPart(plan, 2).length).toBeGreaterThan(0)
    expect(blocksOfPart(plan, 2).every((b) => b.preview !== true)).toBe(true)
    expect(blocksOfPart(plan, 3).every((b) => b.preview === true)).toBe(true)
    expect(new Set(realBlocks(plan).map((b) => b.refId)).size).toBe(1)
  })

  it('partie 2 terminée à son tour → la partie 3 se déverrouille', () => {
    const plan = computePlan(input({ tasks: splitInto(3, [1, 2]) }), NOW)

    expect(blocksOfPart(plan, 3).length).toBeGreaterThan(0)
    expect(blocksOfPart(plan, 3).every((b) => b.preview !== true)).toBe(true)
  })

  it('une partie déverrouillée est placée DÈS AUJOURD’HUI si la capacité le permet', () => {
    const plan = computePlan(input({ tasks: splitInto(3, [1]) }), NOW)
    expect(blocksOfPart(plan, 2).some((b) => b.date === TODAY)).toBe(true)
  })

  it('le travail encore verrouillé compte dans la faisabilité — jamais sous-estimé', () => {
    // 3 parties de 120 min : la charge de l'échéance vaut les 360 minutes
    // ENTIÈRES, pas seulement celles de la partie actionnable. Sans ça, l'app
    // dirait « tout va bien » avec 240 minutes cachées derrière le verrou.
    const plan = computePlan(input({ tasks: splitInto(3) }), NOW)
    const point = plan.feasibility.densities.find((d) => d.deadline === '2026-08-17')!
    expect(point.loadMinutes).toBe(360)
  })

  it('même avec énormément de place libre, aucune partie verrouillée n’est actionnable', () => {
    // Aucun emploi du temps : 1440 minutes brutes par jour, toute la semaine.
    // La tentation de tout placer d'un coup est maximale — le verrou tient.
    const plan = computePlan(input({ tasks: splitInto(3), schedule: [] }), NOW)

    expect(realBlocks(plan).length).toBeGreaterThan(0)
    expect(new Set(realBlocks(plan).map((b) => b.refId)).size).toBe(1)
    expect(realBlocks(plan).every((b) => b.refId === uuid(20))).toBe(true)
  })

  it('DÉFAUT DU 2026-08-23 (trouvé dans le navigateur) : une MIETTE ne bloque jamais les parties suivantes', () => {
    // Le cas exact observé : 600 min estimées × 1,4 = 840, découpées en 3
    // parties de 280. Avec des blocs de 90, une partie reçoit 90+90+90 = 270
    // et garde 10 minutes increvables — sous le bloc minimum de 25, elles ne
    // sont PLUS JAMAIS plaçables. Son besoin ne retombant jamais à zéro, le
    // verrouillage séquentiel condamnait les parties 2 et 3 pour toujours.
    const group = uuid(30)
    const tasks: TaskItem[] = [
      task({ id: group, title: 'Memoire', remainingMinutes: 0, deadline: '2026-08-17' }),
      ...[1, 2, 3].map((n) =>
        task({
          id: uuid(30 + n),
          title: `Memoire — Partie ${n}`,
          parentTaskId: group,
          partOrder: n,
          estimatedMinutes: 280,
          remainingMinutes: 280, // 3 × 90 = 270 : il reste 10 minutes.
          deadline: '2026-08-17',
        }),
      ),
    ]

    const plan = computePlan(input({ tasks, schedule: [] }), NOW)

    const placedFor = (n: number) =>
      plan.blocks.filter((b) => b.refId === uuid(30 + n)).reduce((s, b) => s + b.workMinutes, 0)

    // La partie 1 reçoit ses 280 minutes ENTIÈRES : le dernier bloc a avalé
    // la miette au lieu de l'abandonner.
    expect(placedFor(1)).toBe(280)
    // Et la partie 2 a donc pu commencer — la preuve que rien n'est condamné.
    expect(placedFor(2)).toBeGreaterThan(0)
  })

  it('une tâche NON découpée n’est jamais mise en aperçu', () => {
    const plan = computePlan(input({ tasks: [task({ remainingMinutes: 120 })] }), NOW)
    expect(plan.blocks.filter((b) => b.kind === 'task').length).toBeGreaterThan(0)
    expect(plan.blocks.every((b) => b.preview !== true)).toBe(true)
  })
})

describe('CRITÈRE 7 — aucune question posée', () => {
  it('computePlan est une fonction pure : elle décide, elle ne demande rien', () => {
    const plan = computePlan(
      input({
        tasks: [
          task({ remainingMinutes: 5000, deadline: '2026-08-12' }),
          task({ id: uuid(2), remainingMinutes: 200 }),
        ],
        objectives: [objective()],
        ancres: [ancre()],
      }),
      NOW,
    )
    // Tout est décidé : des blocs, des verdicts, des signaux — aucun état
    // « en attente d'une réponse » n'existe dans le résultat.
    expect(plan.blocks.length).toBeGreaterThan(0)
    expect(plan.verdicts.every((v) => ['placed', 'partial', 'unplaced'].includes(v.status))).toBe(
      true,
    )
    expect(JSON.stringify(plan)).not.toMatch(/question|confirm|choisis|veux-tu/i)
  })

  it('les signaux sont des faits, jamais des demandes', () => {
    const plan = computePlan(
      input({
        tasks: [task({ remainingMinutes: 5000, deadline: '2026-08-12' })],
        anchorMissCounts: { [uuid(7)]: 3 },
      }),
      NOW,
    )
    expect(
      plan.signals.every((s) =>
        ['density_deficit', 'anchor_missed_3x', 'objective_stalled'].includes(s.type),
      ),
    ).toBe(true)
  })
})

describe('D.6 — limite de travail en cours', () => {
  it('au-delà de la limite, un encouragement — jamais un blocage', () => {
    const plan = computePlan(
      input({
        tasks: [1, 2, 3, 4, 5].map((n) =>
          task({ id: uuid(n), title: `T${n}`, remainingMinutes: 60 }),
        ),
      }),
      NOW,
    )
    expect(plan.wip).toMatchObject({ activeCount: 5, limit: 4, overLimit: true })
    // Rien n'est empêché pour autant.
    expect(plan.blocks.filter((b) => b.kind === 'task').length).toBeGreaterThan(0)
  })
})

describe('E.3 — respiration hebdomadaire mesurée, jamais inventée', () => {
  // Semaine du lundi 10 août 2026. Avec sommeil 23 h → 7 h et cours 8 h → 16 h :
  // 480 brutes les jours d'école, 960 le week-end.
  // Brut de la semaine entière = 5 × 480 + 2 × 960 = 4320 → cible 20 % = 864.
  const WEEK_RAW = 5 * 480 + 2 * 960
  // Un jour d'école : 480 brutes − 120 inutilisables (dont le buffer de
  // retour de 30 min après l'école, A.2.3) − 96 de plancher de repos.
  const SCHOOL_EFFECTIVE = 264

  it('la cible de repos vaut 20 % du brut réel, sommeil et cours déduits', () => {
    // Lundi écoulé, mesuré. Sa capacité brute est celle d'un jour d'école (480),
    // pas les 1440 minutes d'une journée dont on n'aurait rien retiré.
    const plan = computePlan(input({ dailyUtilization: { '2026-08-10': 60 } }), NOW)

    expect(plan.breathing.targetMinutes).toBe(Math.round(WEEK_RAW * 0.2))
  })

  it('le repos déjà pris se mesure sur la capacité effective du jour', () => {
    // 100 % d'utilisation = toute la capacité EFFECTIVE consommée, pas 1440 min.
    // Le repos du lundi est donc son brut moins son effectif, jamais zéro.
    const plan = computePlan(input({ dailyUtilization: { '2026-08-10': 100 } }), NOW)

    expect(plan.breathing.restTakenMinutes).toBe(480 - SCHOOL_EFFECTIVE)
  })

  it('un repos réellement suffisant n’est pas transformé en manque', () => {
    // Vendredi : lundi à jeudi sont écoulés, tenus à 80 % de leur capacité
    // effective. Repos réel = 4 × (480 − 211) = 1076, au-dessus de la cible 864.
    // Rien ne justifie de plafonner un jour restant.
    const plan = computePlan(
      input({
        today: '2026-08-14',
        rangeEnd: '2026-08-20',
        dailyUtilization: {
          '2026-08-10': 80,
          '2026-08-11': 80,
          '2026-08-12': 80,
          '2026-08-13': 80,
        },
      }),
      new Date(2026, 7, 14, 8, 0),
    )

    expect(plan.breathing.restTakenMinutes).toBe(4 * (480 - Math.round(0.8 * SCHOOL_EFFECTIVE)))
    expect(plan.breathing.adjustment).toBe('none')
    expect(plan.breathing.reducedDates).toEqual([])
    expect(plan.capacities.every((c) => c.breathingReductionMinutes === 0)).toBe(true)
  })
})

describe('D.7 — sacrifice par retard non confirmé', () => {
  /** Minutes de travail posées un jour donné, pour une nature de bloc. */
  const minutesFor = (plan: PlanningResult, date: string, kind: PlacedBlock['kind']): number =>
    plan.blocks
      .filter((b) => b.date === date && b.kind === kind)
      .reduce((s, b) => s + b.workMinutes, 0)

  /** Un retard mesuré sur `date`, et rien ailleurs. */
  const delayOn = (date: string, minutes: number) => ({
    getDelayMinutes: (d: string) => (d === date ? minutes : 0),
    wasNeverConfirmed: () => false,
  })

  it('sans composant de confirmation, aucun retard n’est supposé', () => {
    const plan = computePlan(input(), NOW)
    expect(plan.capacities.every((c) => c.delayMinutes === 0)).toBe(true)
    expect(plan.capacities.every((c) => c.delayExcessMinutes === 0)).toBe(true)
  })

  it('un retard sous la réserve de repos ne coûte AUCUNE minute de travail', () => {
    const base = computePlan(input({ tasks: [task({ remainingMinutes: 300 })] }), NOW)
    const reserve = base.capacities[0]!.restReservedMinutes

    const avecRetard = computePlan(
      input({
        tasks: [task({ remainingMinutes: 300 })],
        confirmationSource: delayOn(TODAY, reserve - 10),
      }),
      NOW,
    )

    expect(avecRetard.capacities[0]!.delayAbsorbedByRestMinutes).toBe(reserve - 10)
    expect(avecRetard.capacities[0]!.delayExcessMinutes).toBe(0)
    expect(avecRetard.capacities[0]!.effectiveCapacityMinutes).toBe(
      base.capacities[0]!.effectiveCapacityMinutes,
    )
    expect(avecRetard.totalMinutesPlaced).toBe(base.totalMinutesPlaced)
  })

  it('au-delà de la réserve, la capacité du jour baisse d’exactement l’excédent', () => {
    const base = computePlan(input(), NOW)
    const reserve = base.capacities[0]!.restReservedMinutes

    const plan = computePlan(input({ confirmationSource: delayOn(TODAY, reserve + 75) }), NOW)

    expect(plan.capacities[0]!.delayExcessMinutes).toBe(75)
    expect(plan.capacities[0]!.effectiveCapacityMinutes).toBe(
      base.capacities[0]!.effectiveCapacityMinutes - 75,
    )
  })

  it('le retard ne franchit JAMAIS le jour même — le lendemain est intact', () => {
    const base = computePlan(input(), NOW)
    const plan = computePlan(input({ confirmationSource: delayOn(TODAY, 1200) }), NOW)

    expect(plan.capacities[0]!.delayExcessMinutes).toBeGreaterThan(0)
    for (let i = 1; i < plan.capacities.length; i++) {
      expect(plan.capacities[i]!.delayMinutes).toBe(0)
      expect(plan.capacities[i]!.delayExcessMinutes).toBe(0)
      expect(plan.capacities[i]!.effectiveCapacityMinutes).toBe(
        base.capacities[i]!.effectiveCapacityMinutes,
      )
    }
  })

  it('l’objectif cède AVANT la tâche — l’inverse de l’ordre de placement (D.6)', () => {
    const withDelay = (delay: number) =>
      computePlan(
        input({
          tasks: [task({ deadline: '2026-08-17', remainingMinutes: 600 })],
          objectives: [objective({ weeklyTargetMinutes: 420 })],
          confirmationSource: delay > 0 ? delayOn(TODAY, delay) : undefined,
        }),
        NOW,
      )

    const base = withDelay(0)
    const reserve = base.capacities[0]!.restReservedMinutes
    const objectiveBase = minutesFor(base, TODAY, 'objective')
    const taskBase = minutesFor(base, TODAY, 'task')
    expect(objectiveBase).toBeGreaterThan(0)
    expect(taskBase).toBeGreaterThan(0)

    // Un excédent qui tient dans le quota du jour de l'objectif.
    const plan = withDelay(reserve + objectiveBase)

    // L'objectif a cédé tout son quota du jour ; la tâche n'a rien perdu.
    expect(minutesFor(plan, TODAY, 'objective')).toBe(0)
    expect(minutesFor(plan, TODAY, 'task')).toBe(taskBase)
  })

  it('le sacrifice s’arrête dès que le compte y est — jamais plus large que nécessaire', () => {
    // Quota du jour sous un bloc (100 min × la capacité de ce jour d'école) :
    // au-delà, la limite de 2 séances à 3 h d'écart plafonnerait déjà la
    // journée. Il reste au-dessus du bloc minimum (25 min, A.2/D.5) une fois
    // l'excédent retranché.
    const gros = () => objective({ weeklyTargetMinutes: 700 })
    const base = computePlan(
      input({
        tasks: [task({ deadline: '2026-08-17', remainingMinutes: 600 })],
        objectives: [gros()],
      }),
      NOW,
    )
    const reserve = base.capacities[0]!.restReservedMinutes
    const objectiveBase = minutesFor(base, TODAY, 'objective')
    expect(objectiveBase).toBeGreaterThan(60)

    // Excédent volontairement plus petit que le quota de l'objectif : il ne
    // doit céder QUE ce qu'il faut, pas la totalité de son quota.
    const plan = computePlan(
      input({
        tasks: [task({ deadline: '2026-08-17', remainingMinutes: 600 })],
        objectives: [gros()],
        confirmationSource: delayOn(TODAY, reserve + 30),
      }),
      NOW,
    )

    const objectiveAfter = minutesFor(plan, TODAY, 'objective')
    expect(objectiveAfter).toBeLessThan(objectiveBase)
    expect(objectiveAfter).toBeGreaterThan(0)
  })

  it('une ancre n’est JAMAIS débitée par un retard — durée pleine sur un jour retardé', () => {
    const plan = computePlan(
      input({
        ancres: [ancre({ normalMaxMinutes: 60 })],
        confirmationSource: delayOn(TODAY, 1200),
      }),
      NOW,
    )

    const ancreBlock = plan.blocks.find((b) => b.date === TODAY && b.kind === 'ancre')
    expect(ancreBlock).toBeDefined()
    expect(ancreBlock!.workMinutes).toBe(60)
    // Un retard ne prouve aucune saturation : seule la densité > 1 (C.2) ouvre
    // la version minimale (D.3), jamais un retard.
    expect(ancreBlock!.reducedToMinimum).toBe(false)
  })

  it('C.3.1 : un jour retardé ne fait jamais retomber le plan à zéro minute', () => {
    const plan = computePlan(
      input({
        tasks: [task({ deadline: '2026-08-17', remainingMinutes: 600 })],
        // Un retard énorme : la journée d'aujourd'hui est brûlée.
        confirmationSource: delayOn(TODAY, 1440),
      }),
      NOW,
    )

    expect(plan.capacities[0]!.effectiveCapacityMinutes).toBe(0)
    // Le reste de la semaine place quand même ce qui rentre.
    expect(plan.totalMinutesPlaced).toBeGreaterThan(0)
    expect(plan.internalError).toBeUndefined()
  })

  it('C.4 : la comptabilité en partie double tient sous un retard', () => {
    const plan = computePlan(
      input({
        tasks: [task({ deadline: '2026-08-17', remainingMinutes: 600 })],
        objectives: [objective()],
        confirmationSource: delayOn(TODAY, 300),
      }),
      NOW,
    )
    expect(plan.totalMinutesPlaced).toBe(plan.totalMinutesPlanned)
    expect(plan.internalError).toBeUndefined()
  })

  it('C.3.4 signal 4 : le retard répété est un signal PASSIF, jamais une action', () => {
    const plan = computePlan(
      input({
        tasks: [task()],
        consecutiveDelays: { [uuid(1)]: 3 },
      }),
      NOW,
    )

    const signal = plan.signals.find((s) => s.type === 'delay_repeated')
    expect(signal).toBeDefined()
    expect(signal!.severity).toBe('passive')
    expect(signal!.subject).toBe(`delay:${uuid(1)}`)
  })

  it('sous 3 retards consécutifs, aucun signal', () => {
    const plan = computePlan(input({ tasks: [task()], consecutiveDelays: { [uuid(1)]: 2 } }), NOW)
    expect(plan.signals.some((s) => s.type === 'delay_repeated')).toBe(false)
  })
})

describe('D.8 — le bloc porte ses applications à bloquer', () => {
  it('chaque bloc expose apps_à_bloquer, tâche, objectif et ancre', () => {
    const plan = computePlan(
      input({
        tasks: [task({ appsToBlock: ['discord.exe'] })],
        objectives: [objective({ appsToBlock: ['steam.exe'] })],
        ancres: [ancre({ appsToBlock: ['chrome.exe'] })],
      }),
      NOW,
    )

    const byKind = (kind: string) => plan.blocks.find((b) => b.kind === kind)
    expect(byKind('task')!.appsToBlock).toEqual(['discord.exe'])
    expect(byKind('objective')!.appsToBlock).toEqual(['steam.exe'])
    expect(byKind('ancre')!.appsToBlock).toEqual(['chrome.exe'])
  })

  it('une ancre jamais confirmée est un FAIT exposé, sans aucun débit (D.7)', () => {
    const base = computePlan(input({ ancres: [ancre()] }), NOW)
    const plan = computePlan(
      input({
        ancres: [ancre()],
        confirmationSource: {
          getDelayMinutes: () => 0,
          wasNeverConfirmed: (_d, kind) => kind === 'ancre',
        },
      }),
      NOW,
    )

    const ancreBlock = plan.blocks.find((b) => b.kind === 'ancre')!
    expect(ancreBlock.neverConfirmed).toBe(true)
    // Le fait est exposé, et RIEN d'autre : ni repos ni capacité n'ont bougé.
    expect(plan.capacities[0]!.delayMinutes).toBe(0)
    expect(plan.capacities[0]!.effectiveCapacityMinutes).toBe(
      base.capacities[0]!.effectiveCapacityMinutes,
    )
  })
})

describe('BUG RÉEL DU 2026-08-22 — un recalcul tardif ne replace jamais dans le passé', () => {
  // 21h00 le même jour : la majeure partie d'aujourd'hui est déjà vécue.
  const LATE = new Date(2026, 7, 11, 21, 0)

  it('aucun bloc tâche/objectif d’aujourd’hui ne démarre avant maintenant', () => {
    const plan = computePlan(
      input({
        tasks: [task({ deadline: '2026-08-15', remainingMinutes: 600 })],
        objectives: [objective({ weeklyTargetMinutes: 1200 })],
        // Beaucoup de retard aujourd'hui, exactement le scénario réel : le
        // budget du jour est réduit, mais ça ne doit JAMAIS pousser
        // l'allocateur à combler ce budget dans le passé.
        confirmationSource: { getDelayMinutes: () => 300, wasNeverConfirmed: () => false },
      }),
      LATE,
    )

    const todayBlocks = plan.blocks.filter((b) => b.date === TODAY && b.kind !== 'ancre')
    for (const b of todayBlocks) {
      expect(b.startMinute).toBeGreaterThanOrEqual(21 * 60)
    }
  })

  it('le reste réel de la soirée reçoit quand même du travail — le budget ne se perd pas, il se déplace', () => {
    const plan = computePlan(
      input({ tasks: [task({ deadline: '2026-08-15', remainingMinutes: 600 })] }),
      LATE,
    )

    const todayTaskMinutes = plan.blocks
      .filter((b) => b.date === TODAY && b.kind === 'task')
      .reduce((s, b) => s + b.workMinutes, 0)
    expect(todayTaskMinutes).toBeGreaterThan(0)
  })

  it('un jour FUTUR n’est jamais clippé — seul aujourd’hui l’est', () => {
    const plan = computePlan(
      input({ tasks: [task({ deadline: '2026-08-15', remainingMinutes: 600 })] }),
      LATE,
    )
    const tomorrow = plan.blocks.filter((b) => b.date === '2026-08-12' && b.kind === 'task')
    // Un jour futur garde son créneau normal, dès le matin s'il y a de la place.
    expect(tomorrow.some((b) => b.startMinute < 21 * 60)).toBe(true)
  })
})

describe('Placement par score (spec moteur 2026-09-25)', () => {
  const libre = (over: Partial<PlanningInput> = {}) =>
    input({ schedule: sleepScheduleEntries('23:00', '07:00'), ...over })
  const DEMAIN = '2026-08-12'

  it('ne colle plus le travail au réveil : rien dans la première heure quand la journée a de la place', () => {
    const plan = computePlan(
      libre({ objectives: [objective({ weeklyTargetMinutes: 1200 })] }),
      NOW,
    )
    const jour = plan.blocks.filter((b) => b.date === DEMAIN && b.kind !== 'ancre')
    expect(jour.length).toBeGreaterThan(0)
    for (const b of jour) expect(b.startMinute).toBeGreaterThanOrEqual(8 * 60)
  })

  it('20 h par semaine : deux séances par jour au plus, à 3 h d’écart au moins', () => {
    const plan = computePlan(
      libre({ objectives: [objective({ weeklyTargetMinutes: 1200 })] }),
      NOW,
    )
    const seances = plan.blocks
      .filter((b) => b.date === DEMAIN && b.kind === 'objective')
      .sort((a, b) => a.startMinute - b.startMinute)
    expect(seances).toHaveLength(2)
    expect(seances[1]!.startMinute - seances[0]!.endMinute).toBeGreaterThanOrEqual(180)
  })

  it('un quota qui tient en un bloc donne une seule séance', () => {
    const plan = computePlan(libre({ objectives: [objective({ weeklyTargetMinutes: 420 })] }), NOW)
    expect(plan.blocks.filter((b) => b.date === DEMAIN && b.kind === 'objective')).toHaveLength(1)
  })

  it('même heure d’un jour libre à l’autre : la constance', () => {
    const plan = computePlan(libre({ objectives: [objective({ weeklyTargetMinutes: 420 })] }), NOW)
    const departs = plan.blocks
      .filter((b) => b.kind === 'objective' && b.date > TODAY)
      .map((b) => b.startMinute)
    expect(departs.length).toBeGreaterThan(2)
    expect(new Set(departs).size).toBe(1)
  })
})

describe('Apprentissage branché sur le moteur (spec moteur 2026-09-25)', () => {
  const libre = (over: Partial<PlanningInput> = {}) =>
    input({ schedule: sleepScheduleEntries('23:00', '07:00'), ...over })
  const OBJ = objective({ weeklyTargetMinutes: 1200 })
  const evenement = (i: number, over: Partial<SessionEvent> = {}): SessionEvent => ({
    blockId: `b-${i}`,
    date: addDays(TODAY, -(i + 1)),
    kind: 'objective',
    refId: OBJ.id,
    category: `objectif:${OBJ.id}`,
    plannedStartMinute: 9 * 60,
    plannedMinutes: 60,
    started: true,
    delayMinutes: 0,
    spontaneous: false,
    heldMinutes: 60,
    stoppedEarly: false,
    blockedAttempts: 0,
    load48hMinutes: 0,
    createdAt: '2026-08-01T09:00:00.000Z',
    ...over,
  })
  const servi = (plan: ReturnType<typeof computePlan>, date: string) =>
    plan.blocks.filter((b) => b.kind === 'objective' && b.date === date).reduce((s, b) => s + b.workMinutes, 0)

  it('sans journal : la cible complète, comme avant', () => {
    const plan = computePlan(libre({ objectives: [OBJ] }), NOW)
    expect(plan.objectiveDoses[OBJ.id]).toEqual({ dose: 1200, cible: 1200 })
  })

  it('journal vide : la première semaine porte la dose plancher, pas les 20 h', () => {
    const plan = computePlan(libre({ objectives: [OBJ], sessionEvents: [] }), NOW)
    expect(plan.objectiveDoses[OBJ.id]).toEqual({ dose: 175, cible: 1200 })
    expect(servi(plan, '2026-08-12')).toBeLessThanOrEqual(Math.ceil(175 / 7) + 5)
  })

  it('tenu à plus de 90 % : la dose monte de 15 % — figée pour la semaine, mesurée avant le lundi', () => {
    // Lundi 10 août : la semaine d'avant compte, pas le lundi lui-même.
    const events = Array.from({ length: 7 }, (_, i) =>
      evenement(i, { date: addDays('2026-08-10', -(i + 1)), plannedMinutes: 50, heldMinutes: 50 }),
    )
    const plan = computePlan(libre({ objectives: [OBJ], sessionEvents: events }), NOW)
    expect(plan.objectiveDoses[OBJ.id]!.dose).toBe(Math.round(350 * 1.15))
  })

  it('la longueur des blocs s’apprend : on décroche vers 40 min → blocs de ~40 min', () => {
    const events = [
      ...Array.from({ length: 6 }, (_, i) =>
        evenement(i, { plannedMinutes: 90, heldMinutes: 40 + i, stoppedEarly: true, stop: { reason: 'tired', attemptsBefore: 0 } }),
      ),
      ...Array.from({ length: 6 }, (_, i) => evenement(i + 6, { plannedMinutes: 90, heldMinutes: 90 })),
    ]
    const plan = computePlan(
      libre({ objectives: [objective({ weeklyTargetMinutes: 6000 })].map((o) => ({ ...o, id: OBJ.id })), sessionEvents: events }),
      NOW,
    )
    const blocs = plan.blocks.filter((b) => b.kind === 'objective' && b.date === '2026-08-12')
    expect(blocs.length).toBeGreaterThan(0)
    for (const b of blocs) expect(b.workMinutes).toBeLessThanOrEqual(45)
  })

  it('reste déterministe : mêmes entrées, même plan — le hasard de Thompson est à graine', () => {
    const events = Array.from({ length: 12 }, (_, i) => evenement(i, { plannedStartMinute: (8 + (i % 6)) * 60 }))
    const a = computePlan(libre({ objectives: [OBJ], sessionEvents: events }), NOW)
    const b = computePlan(libre({ objectives: [OBJ], sessionEvents: events }), NOW)
    expect(a.blocks).toEqual(b.blocks)
  })

  it('phase 3 et volume modeste : des jours off sur les jours de plus faible capacité', () => {
    const events = Array.from({ length: 25 }, (_, i) => evenement(i, { plannedMinutes: 60, heldMinutes: 60 }))
    const entree = libre({
      objectives: [{ ...objective({ weeklyTargetMinutes: 360 }), id: OBJ.id }],
      sessionEvents: events,
      rangeEnd: '2026-08-23',
    })
    const plan = computePlan(entree, NOW)
    const semaine = ['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21', '2026-08-22', '2026-08-23']
    const actifs = semaine.filter((d) => servi(plan, d) > 0)
    // Jamais moins de 4 jours de contact (≥ 4 séances / semaine pour une habitude).
    expect(actifs.length).toBe(4)
    // Le choix des jours off ne bouge pas au fil de la journée.
    const tard = computePlan(entree, new Date(2026, 7, 11, 20, 0))
    expect(semaine.filter((d) => servi(tard, d) > 0)).toEqual(actifs)
  })
})

describe('Revue du moteur — correctifs (spec moteur 2026-09-25)', () => {
  const libre = (over: Partial<PlanningInput> = {}) => input({ schedule: sleepScheduleEntries('23:00', '07:00'), ...over })
  const OBJ = objective({ weeklyTargetMinutes: 1200 })
  const ev = (over: Partial<SessionEvent>): SessionEvent => ({
    blockId: `b-${Math.random()}`,
    date: TODAY,
    kind: 'objective',
    refId: OBJ.id,
    category: `objectif:${OBJ.id}`,
    plannedStartMinute: 9 * 60,
    plannedMinutes: 60,
    started: true,
    delayMinutes: 0,
    spontaneous: false,
    heldMinutes: 60,
    stoppedEarly: false,
    blockedAttempts: 0,
    load48hMinutes: 0,
    createdAt: '2026-08-11T09:00:00.000Z',
    ...over,
  })

  it('deux séances déjà faites aujourd’hui : plus aucune ce jour-là', () => {
    const events = [ev({ plannedStartMinute: 480 }), ev({ plannedStartMinute: 660, blockId: 'b2' })]
    const plan = computePlan(libre({ objectives: [OBJ], sessionEvents: events }), new Date(2026, 7, 11, 13, 0))
    expect(plan.blocks.filter((b) => b.kind === 'objective' && b.date === TODAY)).toHaveLength(0)
  })

  it('la première heure après le réveil est interdite, même face à une fenêtre PROFONDE', () => {
    const obs = Array.from({ length: 5 }, () => ({ startHour: 7, completed: true, createdAt: '2026-08-01T10:00:00.000Z' }))
    const plan = computePlan(libre({ objectives: [OBJ], observations: obs, sessionEvents: [] }), NOW)
    // « Exigeant » = 45 min et plus : ceux-là, jamais dans la première heure.
    for (const b of plan.blocks.filter((x) => x.date === '2026-08-12' && x.workMinutes >= 45))
      expect(b.startMinute).toBeGreaterThanOrEqual(8 * 60)
  })

  it('jours off stables avec l’horizon réel (7 jours) : aujourd’hui n’est pas choisi parce qu’il est rogné', () => {
    const OBJ2 = objective({ weeklyTargetMinutes: 360 })
    const hist = Array.from({ length: 25 }, (_, i) =>
      ev({ refId: OBJ2.id, category: `objectif:${OBJ2.id}`, date: addDays(TODAY, -(i + 1)), blockId: `j${i}` }),
    )
    const entree = libre({ objectives: [OBJ2], sessionEvents: hist, rangeEnd: addDays(TODAY, PLANNING_HORIZON_DAYS) })
    const actifs = (p: ReturnType<typeof computePlan>) =>
      [...new Set(p.blocks.filter((b) => b.kind === 'objective' && b.date > TODAY).map((b) => b.date))].sort()
    const matin = computePlan(entree, new Date(2026, 7, 11, 8, 0))
    const soir = computePlan(entree, new Date(2026, 7, 11, 21, 0))
    expect(actifs(soir)).toEqual(actifs(matin))
  })

  it('la constance vient de l’histoire : le plan ne bouge pas entre un calcul à 9 h et un à 20 h', () => {
    const events = Array.from({ length: 6 }, (_, i) =>
      ev({ date: addDays(TODAY, -(i + 1)), blockId: `h${i}`, plannedStartMinute: 10 * 60 }),
    )
    const demain = (p: ReturnType<typeof computePlan>) => p.blocks.filter((b) => b.date === '2026-08-12')
    const matin = computePlan(libre({ objectives: [OBJ], sessionEvents: events }), new Date(2026, 7, 11, 9, 0))
    const soir = computePlan(libre({ objectives: [OBJ], sessionEvents: events }), new Date(2026, 7, 11, 20, 0))
    expect(demain(soir)).toEqual(demain(matin))
  })

  it('en crise prouvée, pas d’exploration : deux graines différentes, le même plan', () => {
    const events = Array.from({ length: 8 }, (_, i) =>
      ev({ date: addDays(TODAY, -(i + 1)), blockId: `c${i}`, plannedStartMinute: (9 + (i % 4)) * 60 }),
    )
    const crise = [task({ remainingMinutes: 5000, deadline: '2026-08-12' })]
    const a = computePlan(libre({ objectives: [OBJ], tasks: crise, sessionEvents: events }), NOW)
    expect(a.feasibility.globallyFeasible).toBe(false)
    const b = computePlan(libre({ objectives: [OBJ], tasks: crise, sessionEvents: [...events].reverse() }), NOW)
    expect(b.blocks).toEqual(a.blocks)
  })
})

describe('Déclencheur-événement nommé (plan si-alors)', () => {
  it('phase 2+ : l’habitude part juste après l’événement nommé', () => {
    const OBJ = objective({ weeklyTargetMinutes: 420 })
    const cours: ScheduleEntry = { dayOfWeek: 2, startMinute: 600, endMinute: 780, categoryType: 'custom', label: 'Piano lesson', color: '#5E81AC' }
    const events: SessionEvent[] = Array.from({ length: 12 }, (_, i) => ({
      blockId: `t${i}`,
      date: addDays(TODAY, -(i + 1)),
      kind: 'objective',
      refId: OBJ.id,
      category: `objectif:${OBJ.id}`,
      plannedStartMinute: 900,
      plannedMinutes: 60,
      started: true,
      delayMinutes: 0,
      spontaneous: false,
      heldMinutes: 60,
      stoppedEarly: false,
      blockedAttempts: 0,
      load48hMinutes: 0,
      createdAt: '2026-08-01T09:00:00.000Z',
    }))
    const plan = computePlan(
      input({
        schedule: [...sleepScheduleEntries('23:00', '07:00'), cours],
        objectives: [OBJ],
        sessionEvents: events,
        triggerLabels: ['Piano lesson'],
      }),
      NOW,
    )
    // Mercredi 12 août (dayOfWeek 2) : après la leçon et son buffer de retour.
    const mercredi = plan.blocks.filter((b) => b.kind === 'objective' && b.date === '2026-08-12')
    expect(mercredi[0]!.startMinute).toBeGreaterThanOrEqual(780)
    expect(mercredi[0]!.startMinute).toBeLessThanOrEqual(840)
  })
})

describe('Revue 3 — longueur par tranche, et un gros journal', () => {
  const OBJ = objective({ weeklyTargetMinutes: 1200 })
  const ev = (i: number, over: Partial<SessionEvent>): SessionEvent => ({
    blockId: `r${i}`,
    date: addDays(TODAY, -((i % 40) + 1)),
    kind: 'objective',
    refId: OBJ.id,
    category: `objectif:${OBJ.id}`,
    plannedStartMinute: 9 * 60,
    plannedMinutes: 90,
    started: true,
    delayMinutes: 0,
    spontaneous: false,
    heldMinutes: 90,
    stoppedEarly: false,
    blockedAttempts: 0,
    load48hMinutes: 0,
    createdAt: '2026-08-01T09:00:00.000Z',
    ...over,
  })

  it('la longueur apprise suit la tranche horaire du départ : longue le matin, courte le soir', () => {
    const events = [
      ...Array.from({ length: 8 }, (_, i) => ev(i, { plannedStartMinute: 9 * 60, heldMinutes: 90 })),
      ...Array.from({ length: 8 }, (_, i) =>
        ev(100 + i, { plannedStartMinute: 19 * 60, heldMinutes: 30 + (i % 3), stoppedEarly: true, stop: { reason: 'tired', attemptsBefore: 0 } }),
      ),
    ]
    const plan = computePlan(input({ schedule: sleepScheduleEntries('23:00', '07:00'), objectives: [OBJ], sessionEvents: events }), NOW)
    const blocs = plan.blocks.filter((b) => b.kind === 'objective' && b.date === '2026-08-12')
    for (const b of blocs) {
      if (b.startMinute >= 18 * 60) expect(b.workMinutes).toBeLessThanOrEqual(35)
    }
    expect(blocs.some((b) => b.startMinute < 12 * 60 && b.workMinutes >= 60)).toBe(true)
  })

  it('3000 événements : un calcul reste sous la seconde', () => {
    const events = Array.from({ length: 3000 }, (_, i) =>
      ev(i, {
        blockId: `g${i}`,
        refId: i % 3 ? OBJ.id : 'autre',
        plannedStartMinute: (8 + (i % 12)) * 60,
        heldMinutes: i % 5 ? 90 : 20,
        stoppedEarly: i % 5 === 0,
        ...(i % 5 === 0 ? { stop: { reason: 'boring' as const, attemptsBefore: i % 2 } } : {}),
      }),
    )
    const t0 = performance.now()
    computePlan(input({ schedule: sleepScheduleEntries('23:00', '07:00'), objectives: [OBJ], sessionEvents: events }), NOW)
    expect(performance.now() - t0).toBeLessThan(1000)
  })
})

describe('D.5 — une tâche découpée ne s’empile pas sur son dernier jour', () => {
  it('la cible du jour se juge sur la tâche entière : 5 × 240 min en 7 jours, réparties, dans l’ordre des parties', () => {
    const GROUP = uuid(40)
    const tasks = [
      task({ id: GROUP, title: 'Devoir', remainingMinutes: 0, deadline: RANGE_END }),
      ...Array.from({ length: 5 }, (_, i) =>
        task({
          id: uuid(41 + i),
          title: `Devoir — Part ${i + 1}`,
          parentTaskId: GROUP,
          partOrder: i + 1,
          estimatedMinutes: 240,
          remainingMinutes: 240,
          deadline: RANGE_END,
        }),
      ),
    ]
    const plan = computePlan(input({ schedule: sleepScheduleEntries('23:30', '07:30'), tasks }), NOW)
    const parJour = new Map<string, number>()
    for (const b of plan.blocks) if (b.kind === 'task') parJour.set(b.date, (parJour.get(b.date) ?? 0) + b.workMinutes)
    const total = [...parJour.values()].reduce((s, m) => s + m, 0)
    expect(total).toBe(5 * 240)
    const moyenne = total / 7
    for (const m of parJour.values()) expect(m).toBeLessThanOrEqual(moyenne * 1.5)
    expect(parJour.get(RANGE_END) ?? 0).toBeLessThanOrEqual(moyenne * 1.5)
    // Dans une journée, une partie ne commence jamais avant la fin de la précédente.
    const rang = new Map(tasks.map((t) => [t.id, t.partOrder ?? 0]))
    for (const date of parJour.keys()) {
      const jour = plan.blocks.filter((b) => b.kind === 'task' && b.date === date).sort((x, y) => x.startMinute - y.startMinute)
      for (let k = 1; k < jour.length; k++) expect(rang.get(jour[k]!.refId)!).toBeGreaterThanOrEqual(rang.get(jour[k - 1]!.refId)!)
    }
  })
})

describe('D.5 — une échéance au-delà de l’horizon', () => {
  it('les jours après l’horizon comptent : 28 h dues dans 10 jours ne se tassent pas dans les 7 visibles', () => {
    const GROUP = uuid(60)
    const deadline = addDays(TODAY, 9)
    const tasks = [
      task({ id: GROUP, title: 'Devoir', remainingMinutes: 0, deadline }),
      ...Array.from({ length: 6 }, (_, i) =>
        task({ id: uuid(61 + i), title: `Devoir — Part ${i + 1}`, parentTaskId: GROUP, partOrder: i + 1, estimatedMinutes: 280, remainingMinutes: 280, deadline }),
      ),
    ]
    const plan = computePlan(input({ schedule: sleepScheduleEntries('23:30', '07:30'), tasks }), NOW)
    const parJour = new Map<string, number>()
    for (const b of plan.blocks) if (b.kind === 'task') parJour.set(b.date, (parJour.get(b.date) ?? 0) + b.workMinutes)
    const moyenne = 1680 / 10
    for (const m of parJour.values()) expect(m).toBeLessThanOrEqual(moyenne * 1.25)
  })
})
