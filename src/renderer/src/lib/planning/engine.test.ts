import { describe, it, expect } from 'vitest'
import { computePlan } from './engine'
import { TASK_CONSTANTS } from './placement'
import { sleepScheduleEntries } from '@shared/sleep'
import type { AncreItem, ObjectiveItem, PlanningInput, ScheduleEntry, TaskItem } from './types'

// Mardi 11 août 2026, 8 h du matin.
const NOW = new Date(2026, 7, 11, 8, 0)
const TODAY = '2026-08-11'
const RANGE_END = '2026-08-17'

const uuid = (n: number) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`

const task = (over: Partial<TaskItem> = {}): TaskItem => ({
  id: uuid(1),
  title: 'Dossier',
  deadline: '2026-08-15',
  importance: 5,
  category: 'général',
  workKind: 'routine',
  estimatedMinutes: 120,
  remainingMinutes: 120,
  correctionFactor: 1.4,
  parentTaskId: null,
  status: 'active',
  createdAt: '2026-08-01T10:00:00.000Z',
  ...over,
})

const objective = (over: Partial<ObjectiveItem> = {}): ObjectiveItem => ({
  id: uuid(9),
  name: 'Guitare',
  color: '#3ECF8E',
  weeklyTargetMinutes: 420,
  createdAt: '2026-08-01T10:00:00.000Z',
  ...over,
})

const ancre = (over: Partial<AncreItem> = {}): AncreItem => ({
  id: uuid(7),
  name: 'Sport',
  color: '#EBCB8B',
  trigger: 'sport',
  anchorMinute: 1080, // 18 h
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  normalMaxMinutes: 60,
  minimumMinutes: 24,
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
    const plan = computePlan(input({ tasks: [task({ remainingMinutes: 5000, deadline: '2026-08-13' })] }), NOW)
    expect(plan.feasibility.globallyFeasible).toBe(false)
    expect(plan.totalMinutesPlaced).toBeGreaterThan(0)
    expect(plan.verdicts[0]!.status).toBe('partial')
  })

  it('une tâche impossible n’empêche pas les autres d’être placées entièrement', () => {
    const plan = computePlan(
      input({
        tasks: [
          task({ id: uuid(1), title: 'Impossible', remainingMinutes: 5000, deadline: '2026-08-13' }),
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
    const plan = computePlan(input({ tasks: [task({ remainingMinutes: 5000, deadline: '2026-08-13' })] }), NOW)
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
    const served = plan.blocks.filter((b) => b.kind === 'objective').reduce((s, b) => s + b.workMinutes, 0)
    expect(served).toBeGreaterThan(0)
    expect(served).toBeLessThanOrEqual(420)
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
    const plan = computePlan(input({ ancres: [ancre()], tasks: [task({ remainingMinutes: 600 })] }), NOW)
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
          task({ id: uuid(1), title: 'Urgente', deadline: '2026-08-12', importance: 1, remainingMinutes: 90 }),
          task({ id: uuid(2), title: 'Importante', deadline: '2026-08-17', importance: 10, remainingMinutes: 90 }),
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
          task({ id: uuid(1), title: 'Basse', deadline: '2026-08-15', importance: 2, remainingMinutes: 60 }),
          task({ id: uuid(2), title: 'Haute', deadline: '2026-08-15', importance: 9, remainingMinutes: 60 }),
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
    expect(plan.blocks.filter((b) => b.kind === 'task').every((b) => b.workMinutes >= TASK_CONSTANTS.minBlockMinutes)).toBe(true)
  })

  it('aucun bloc de travail au-delà de 90 minutes', () => {
    const plan = computePlan(input({ tasks: [task({ remainingMinutes: 900, deadline: '2026-08-17' })] }), NOW)
    expect(plan.blocks.filter((b) => b.kind === 'task').every((b) => b.workMinutes <= TASK_CONSTANTS.targetBlockMinutes)).toBe(true)
  })

  it('la pause est INCLUSE dans l’empreinte du bloc, jamais ajoutée après', () => {
    const plan = computePlan(input({ tasks: [task({ remainingMinutes: 400 })] }), NOW)
    for (const b of plan.blocks.filter((b) => b.kind === 'task')) {
      expect(b.workMinutes + b.breakMinutes).toBe(b.durationMinutes)
      expect(b.endMinute - b.startMinute).toBe(b.durationMinutes)
    }
  })

  it('sans crise, une tâche ne dépasse pas 40 % de la capacité d’un jour', () => {
    const plan = computePlan(input({ tasks: [task({ remainingMinutes: 600, deadline: '2026-08-17' })] }), NOW)
    for (const capacity of plan.capacities) {
      const dayMinutes = plan.blocks
        .filter((b) => b.kind === 'task' && b.date === capacity.date)
        .reduce((s, b) => s + b.workMinutes, 0)
      expect(dayMinutes).toBeLessThanOrEqual(Math.ceil(capacity.effectiveCapacityMinutes * 0.4) + 1)
    }
  })

  it('le travail est découpé sur plusieurs jours plutôt qu’entassé', () => {
    const plan = computePlan(input({ tasks: [task({ remainingMinutes: 600, deadline: '2026-08-17' })] }), NOW)
    const days = new Set(plan.blocks.filter((b) => b.kind === 'task').map((b) => b.date))
    expect(days.size).toBeGreaterThan(1)
  })

  it('rien n’est jamais placé après la deadline', () => {
    const plan = computePlan(input({ tasks: [task({ remainingMinutes: 5000, deadline: '2026-08-13' })] }), NOW)
    expect(plan.blocks.filter((b) => b.kind === 'task').every((b) => b.date <= '2026-08-13')).toBe(true)
  })
})

describe('invariants de placement', () => {
  const busy = input({
    tasks: [
      task({ id: uuid(1), title: 'A', remainingMinutes: 300, deadline: '2026-08-14' }),
      task({ id: uuid(2), title: 'B', remainingMinutes: 240, deadline: '2026-08-16', importance: 8 }),
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

  it('C.4 : les minutes posées égalent les minutes décidées', () => {
    const plan = computePlan(busy, NOW)
    expect(plan.internalError).toBeUndefined()
    expect(plan.totalMinutesPlaced).toBe(plan.totalMinutesPlanned)
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
      day.rawCapacityMinutes - day.unusableMinutes - day.restReservedMinutes - day.fatiguePenaltyMinutes,
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

  it('sans mesure, aucune pénalité inventée', () => {
    const plan = computePlan(input(), NOW)
    expect(plan.capacities[0]!.fatiguePenaltyMinutes).toBe(0)
  })
})

describe('D.3 — version minimale des ancres', () => {
  it('journée saturée → l’ancre passe à sa version minimale, sans disparaître', () => {
    const plan = computePlan(
      input({ ancres: [ancre()], tasks: [task({ remainingMinutes: 5000, deadline: '2026-08-13' })] }),
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
})

describe('CRITÈRE 7 — aucune question posée', () => {
  it('computePlan est une fonction pure : elle décide, elle ne demande rien', () => {
    const plan = computePlan(
      input({
        tasks: [task({ remainingMinutes: 5000, deadline: '2026-08-12' }), task({ id: uuid(2), remainingMinutes: 200 })],
        objectives: [objective()],
        ancres: [ancre()],
      }),
      NOW,
    )
    // Tout est décidé : des blocs, des verdicts, des signaux — aucun état
    // « en attente d'une réponse » n'existe dans le résultat.
    expect(plan.blocks.length).toBeGreaterThan(0)
    expect(plan.verdicts.every((v) => ['placed', 'partial', 'unplaced'].includes(v.status))).toBe(true)
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
    expect(plan.signals.every((s) => ['density_deficit', 'anchor_missed_3x', 'objective_stalled'].includes(s.type))).toBe(true)
  })
})

describe('D.6 — limite de travail en cours', () => {
  it('au-delà de la limite, un encouragement — jamais un blocage', () => {
    const plan = computePlan(
      input({ tasks: [1, 2, 3, 4, 5].map((n) => task({ id: uuid(n), title: `T${n}`, remainingMinutes: 60 })) }),
      NOW,
    )
    expect(plan.wip).toMatchObject({ activeCount: 5, limit: 4, overLimit: true })
    // Rien n'est empêché pour autant.
    expect(plan.blocks.filter((b) => b.kind === 'task').length).toBeGreaterThan(0)
  })
})
