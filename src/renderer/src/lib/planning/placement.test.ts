import { describe, it, expect } from 'vitest'
import {
  sortTasksByCascade,
  computeAncreMinimum,
  placeAncres,
  computeTargetBlockSize,
  computeProportionalShare,
  placeTaskBlocks,
  applyPreemption,
  computeWIPLimit,
  TASK_CONSTANTS,
} from './placement'
import type { Task } from '@shared/schemas'
import type { Ancre } from '@shared/schemas'
import type { TimeSlot, DayCapacity } from './types'

const makeTask = (over: Partial<Task> = {}): Task => ({
  id: 't1',
  title: 'Test',
  linkedObjectiveId: null,
  deadline: '2026-08-01',
  importance: 5,
  estimatedMinutes: 60,
  remainingMinutes: 60,
  correctionFactor: 1.4,
  status: 'active',
  createdAt: '2026-07-27T10:00:00Z',
  ...over,
})

const makeSlot = (start: number, dur: number): TimeSlot => ({
  startMinute: start,
  endMinute: start + dur,
  durationMinutes: dur,
  cognitiveWindow: 'NORMALE',
})

describe('Partie D — placement', () => {
  describe('D.6 sortTasksByCascade', () => {
    it('trie par deadline (EDF) en premier', () => {
      const tasks = [
        makeTask({ id: 't1', deadline: '2026-08-03', remainingMinutes: 60, importance: 3, createdAt: '2026-07-25T00:00:00Z' }),
        makeTask({ id: 't2', deadline: '2026-07-29', remainingMinutes: 60, importance: 8, createdAt: '2026-07-26T00:00:00Z' }),
      ]
      const deadlineMap = new Map([['t1', 5000], ['t2', 1000]])
      const sorted = sortTasksByCascade({ tasks, deadlineMinutesMap: deadlineMap })
      // t2 a moins de marge → passe en premier malgré importance plus haute de t1
      expect(sorted[0]?.id).toBe('t2')
    })

    it('même deadline → importance décroissante', () => {
      const tasks = [
        makeTask({ id: 't1', deadline: '2026-08-01', importance: 3, remainingMinutes: 60, createdAt: '2026-07-25T00:00:00Z' }),
        makeTask({ id: 't2', deadline: '2026-08-01', importance: 8, remainingMinutes: 60, createdAt: '2026-07-26T00:00:00Z' }),
      ]
      const deadlineMap = new Map([['t1', 2000], ['t2', 2000]])
      const sorted = sortTasksByCascade({ tasks, deadlineMinutesMap: deadlineMap })
      expect(sorted[0]?.id).toBe('t2') // importance 8 > 3
    })

    it('même deadline + même importance → SRPT (moins de travail restant)', () => {
      // ATTENTION : la marge = deadline - restant. Pour que les marges soient
      // égales (et que SRPT soit le critère de départage), il faut ajuster
      // deadlineMinutes pour compenser la différence de remainingMinutes.
      // t1 : remaining 120, deadline 2120 → marge 2000
      // t2 : remaining 40, deadline 2040 → marge 2000
      const tasks = [
        makeTask({ id: 't1', deadline: '2026-08-01', importance: 5, remainingMinutes: 120, createdAt: '2026-07-25T00:00:00Z' }),
        makeTask({ id: 't2', deadline: '2026-08-01', importance: 5, remainingMinutes: 40, createdAt: '2026-07-26T00:00:00Z' }),
      ]
      const deadlineMap = new Map([['t1', 2120], ['t2', 2040]])
      const sorted = sortTasksByCascade({ tasks, deadlineMinutesMap: deadlineMap })
      expect(sorted[0]?.id).toBe('t2') // 40 < 120 (SRPT)
    })

    it('égalité totale → ordre de création (plus ancien)', () => {
      const tasks = [
        makeTask({ id: 't1', deadline: '2026-08-01', importance: 5, remainingMinutes: 60, createdAt: '2026-07-25T00:00:00Z' }),
        makeTask({ id: 't2', deadline: '2026-08-01', importance: 5, remainingMinutes: 60, createdAt: '2026-07-26T00:00:00Z' }),
      ]
      const deadlineMap = new Map([['t1', 2000], ['t2', 2000]])
      const sorted = sortTasksByCascade({ tasks, deadlineMinutesMap: deadlineMap })
      expect(sorted[0]?.id).toBe('t1') // créé avant t2
    })

    it('tâche en crise (marge négative) passe toujours en premier', () => {
      const tasks = [
        makeTask({ id: 't1', deadline: '2026-07-28', importance: 10, remainingMinutes: 200, createdAt: '2026-07-20T00:00:00Z' }),
        makeTask({ id: 't2', deadline: '2026-07-29', importance: 1, remainingMinutes: 30, createdAt: '2026-07-26T00:00:00Z' }),
      ]
      // t1 : deadline dans 1 jour, 200 min restantes → marge négative
      // t2 : deadline dans 2 jours, 30 min restantes → marge positive
      const deadlineMap = new Map([['t1', 1440], ['t2', 2880]])
      const sorted = sortTasksByCascade({ tasks, deadlineMinutesMap: deadlineMap })
      expect(sorted[0]?.id).toBe('t1') // crise de deadline passe en premier
    })
  })

  describe('D.3 computeAncreMinimum', () => {
    it('MAX(20, 40% × 60) = 24', () => {
      expect(computeAncreMinimum(60)).toBe(24)
    })
    it('MAX(20, 40% × 30) = 20', () => {
      expect(computeAncreMinimum(30)).toBe(20)
    })
    it('MAX(20, 40% × 120) = 48', () => {
      expect(computeAncreMinimum(120)).toBe(48)
    })
  })

  describe('D.3 placeAncres', () => {
    it('place à heure fixe', () => {
      const ancres: Ancre[] = [{
        id: 'a1', name: 'Sport', color: '#ff0000', trigger: 'sport',
        anchorMinute: 1080, daysOfWeek: [0, 2, 4], normalMaxMinutes: 60, minimumMinutes: 24,
        createdAt: '2026-07-01T00:00:00Z',
      }]
      const blocks = placeAncres({ ancres, date: '2026-07-27', daySaturated: false })
      expect(blocks).toHaveLength(1)
      expect(blocks[0]?.startMinute).toBe(1080) // 18h00
      expect(blocks[0]?.durationMinutes).toBe(60) // version normale
      expect(blocks[0]?.kind).toBe('ancre')
    })

    it('version minimale si jour saturé', () => {
      const ancres: Ancre[] = [{
        id: 'a1', name: 'Sport', color: '#ff0000', trigger: 'sport',
        anchorMinute: 1080, daysOfWeek: [0], normalMaxMinutes: 60, minimumMinutes: 24,
        createdAt: '2026-07-01T00:00:00Z',
      }]
      const blocks = placeAncres({ ancres, date: '2026-07-27', daySaturated: true })
      expect(blocks[0]?.durationMinutes).toBe(24) // minimum
    })
  })

  describe('D.5 computeTargetBlockSize', () => {
    it('min(60 restant, 90, 40%×500=200) = 60', () => {
      expect(computeTargetBlockSize({ remainingMinutes: 60, effectiveCapacityMinutes: 500 })).toBe(60)
    })
    it('min(200 restant, 90, 40%×200=80) = 80', () => {
      expect(computeTargetBlockSize({ remainingMinutes: 200, effectiveCapacityMinutes: 200 })).toBe(80)
    })
    it('min(30 restant, 90, 40%×500=200) = 30', () => {
      expect(computeTargetBlockSize({ remainingMinutes: 30, effectiveCapacityMinutes: 500 })).toBe(30)
    })
  })

  describe('D.5 computeProportionalShare', () => {
    it('jour 200 min / total 1000 min × 400 besoin = 80', () => {
      expect(computeProportionalShare({
        todayEffectiveCapacity: 200,
        totalRemainingCapacities: 1000,
        totalRemainingWork: 400,
      })).toBe(80)
    })
  })

  describe('D.5 placeTaskBlocks', () => {
    it('génère un bloc de 60 min', () => {
      const result = placeTaskBlocks({
        task: { ...makeTask({ remainingMinutes: 60 }), marginMinutes: 200, urgency: 0.005, marginStatus: 'comfortable' },
        date: '2026-07-27',
        availableMinutes: 200,
        slots: [makeSlot(480, 200)],
        deepBlocksAlreadyToday: 0,
      })
      expect(result.blocks).toHaveLength(1)
      expect(result.blocks[0]?.durationMinutes).toBe(60)
      expect(result.minutesConsumed).toBe(60)
    })

    it('limite à 2 blocs profonds (90 min)', () => {
      const result = placeTaskBlocks({
        task: { ...makeTask({ remainingMinutes: 300 }), marginMinutes: 5000, urgency: 0.0002, marginStatus: 'comfortable' },
        date: '2026-07-27',
        availableMinutes: 500,
        slots: [makeSlot(480, 500)],
        deepBlocksAlreadyToday: 0,
      })
      const deepBlocks = result.blocks.filter((b) => b.durationMinutes >= 90).length
      expect(deepBlocks).toBeLessThanOrEqual(TASK_CONSTANTS.maxDeepBlocksPerDay)
    })
  })

  describe('D.2 applyPreemption', () => {
    it('prend sur le quota objectif en cas de crise', () => {
      const actions = applyPreemption({
        crisisTask: { ...makeTask(), marginMinutes: -50, urgency: Infinity, marginStatus: 'overdue' },
        objectiveQuotas: [{ objectiveId: 'o1', minutes: 100 }],
        restReservedMinutes: 120,
        restFloorMinutes: 60,
        deficitMinutes: 50,
      })
      expect(actions.length).toBeGreaterThan(0)
      expect(actions[0]?.source).toBe('objective_quota')
    })

    it('ne prend jamais sur le plancher de repos minimum', () => {
      const actions = applyPreemption({
        crisisTask: { ...makeTask(), marginMinutes: -200, urgency: Infinity, marginStatus: 'overdue' },
        objectiveQuotas: [],
        restReservedMinutes: 60, // = plancher
        restFloorMinutes: 60,
        deficitMinutes: 200,
      })
      // Pas d'excess_rest car restReserved == floor
      expect(actions.find((a) => a.source === 'excess_rest')).toBeUndefined()
    })
  })

  describe('D.6 computeWIPLimit', () => {
    it('démarrage à froid → 4', () => {
      expect(computeWIPLimit({ tasksCreatedPerWeek: 0, weeksToFinish: 2 })).toBe(4)
    })
    it('mesuré : 5 tâches/sem × 2 semaines = 10', () => {
      expect(computeWIPLimit({ tasksCreatedPerWeek: 5, weeksToFinish: 2 })).toBe(10)
    })
  })
})
