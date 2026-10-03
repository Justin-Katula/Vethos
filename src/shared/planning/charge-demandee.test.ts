import { describe, it, expect } from 'vitest'
import { computePlan } from './engine'
import { sleepScheduleEntries } from '@shared/sleep'
import type { PlanningInput, PlanningResult, ScheduleEntry, TaskItem } from './types'

/**
 * « 100 h, c'est 100 h. » L'application ne discute pas le chiffre demandé : elle
 * place tout ce qui peut l'être, le mieux possible, et dit ce qui ne tient pas.
 * Jamais un plan à moitié vide présenté comme normal.
 *
 * Scénario mesuré le 2026-10-02 : 100 h avant le 21 août (11 jours, aujourd'hui
 * compris), environ 9,6 h de capacité effective par jour — 106 h en tout. Le
 * moteur n'en plaçait que 42 : le plafond de 40 % par jour ne sautait que sur
 * une marge d'HORLOGE négative, ce qui n'arrive presque jamais.
 */

const NOW = new Date(2026, 7, 11, 8, 0)
const DEADLINE = '2026-08-21'

const fixeChaqueJour: ScheduleEntry[] = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
  dayOfWeek, startMinute: 480, endMinute: 630, categoryType: 'school', label: 'Fixe', color: '#5E81AC',
}))

const tache = (heures: number, over: Partial<TaskItem> = {}): TaskItem => ({
  id: '00000001-1111-4111-8111-111111111111', title: 'Gros projet', plan: 'x', deadline: DEADLINE,
  importance: 5, category: 'général', workKind: 'routine',
  estimatedMinutes: heures * 60, remainingMinutes: heures * 60,
  correctionFactor: 1, parentTaskId: null, partOrder: null, extraMinutes: 0, status: 'active',
  appsToBlock: [], createdAt: '2026-08-01T10:00:00.000Z', ...over,
})

const entree = (tasks: TaskItem[], over: Partial<PlanningInput> = {}): PlanningInput => ({
  today: '2026-08-11', rangeEnd: DEADLINE, tasks, objectives: [], ancres: [],
  schedule: [...sleepScheduleEntries('23:00', '07:00'), ...fixeChaqueJour], observations: [],
  anchorMissCounts: {}, dailyUtilization: {}, weeklyObjectiveServed: {}, objectiveLastServed: {},
  lastSignalAt: {}, tasksCreatedPerWeek: {}, consecutiveDelays: {}, ...over,
})

const heuresPlacees = (p: PlanningResult): number =>
  p.blocks.filter((b) => b.kind === 'task').reduce((s, b) => s + b.workMinutes, 0) / 60
const capaciteTotale = (p: PlanningResult): number =>
  p.capacities.reduce((s, c) => s + c.effectiveCapacityMinutes, 0) / 60

describe('100 h demandées = 100 h placées', () => {
  it('une charge qui tient dans la capacité est placée EN ENTIER (plus de 42 h sur 100)', () => {
    const p = computePlan(entree([tache(100)]), NOW)
    expect(p.feasibility.globallyFeasible).toBe(true)
    expect(heuresPlacees(p)).toBeGreaterThanOrEqual(99.5)
    expect(p.verdicts[0]!.status).toBe('placed')
  })

  it('le plafond de 40 % saute dès que la tâche ne tient pas dessous, sans attendre une « crise »', () => {
    const p = computePlan(entree([tache(100)]), NOW)
    expect(p.blocks.some((b) => b.kind === 'task' && b.capOverride === true)).toBe(true)
  })

  it('une charge qui ne tient pas : l’application place le MAXIMUM, et dit ce qu’il en manque', () => {
    const p = computePlan(entree([tache(140)]), NOW)
    expect(p.feasibility.globallyFeasible).toBe(false)
    expect(p.feasibility.deficits[0]!.deficitMinutes).toBeGreaterThan(0)
    // Elle ne s'arrête pas à 40 % (42 h) : elle remplit la capacité, pauses comprises
    // (20 min toutes les 90 min de travail, donc ~82 % de la capacité en travail).
    expect(heuresPlacees(p)).toBeGreaterThan(capaciteTotale(p) * 0.78)
    expect(p.verdicts[0]!.status).toBe('partial')
  })

  it('une charge confortable garde son plafond de 40 % : on n’entasse pas sans raison', () => {
    const p = computePlan(entree([tache(20)]), NOW)
    expect(heuresPlacees(p)).toBeGreaterThanOrEqual(19.5)
    expect(p.blocks.some((b) => b.kind === 'task' && b.capOverride === true)).toBe(false)
  })

  it('invariant : toute échéance faisable est entièrement placée (pauses comprises)', () => {
    // Les pauses de 20 min par bloc de 90 sont du temps de la capacité : au-delà de
    // ~82 % de densité, « faisable » ne suffit plus à garantir la place (voir
    // Informations/Probleme_charge_et_multiplicateur.md, à trancher).
    for (const heures of [10, 30, 60, 80, 100]) {
      const p = computePlan(entree([tache(heures)]), NOW)
      if (!p.feasibility.globallyFeasible) continue
      expect(heuresPlacees(p), `${heures} h`).toBeGreaterThanOrEqual(heures - 0.5)
    }
  })

  it('en déficit, la fatigue ne retire pas de capacité : le maximum possible est travaillé', () => {
    // Trois jours de suite à plus de 85 % : sans crise, le jour suivant perd 60 %.
    const dailyUtilization = { '2026-08-08': 95, '2026-08-09': 95, '2026-08-10': 95 }
    const p = computePlan(entree([tache(140)], { dailyUtilization }), NOW)
    expect(p.capacities[0]!.fatiguePenaltyMinutes).toBe(0)
  })

  it('en déficit, le repos descend à son plancher absolu de 60 min', () => {
    const calme = computePlan(entree([tache(20)]), NOW)
    const serre = computePlan(entree([tache(140)]), NOW)
    expect(serre.capacities[1]!.restReservedMinutes).toBe(60)
    expect(calme.capacities[1]!.restReservedMinutes).toBeGreaterThan(60)
  })
})

describe('bonus libéré : du travail en plus, jamais un déficit', () => {
  it('la faisabilité ne voit que le plancher : 100 h + 3 h de bonus ont la même densité que 100 h', () => {
    const sans = computePlan(entree([tache(100)]), NOW)
    const avec = computePlan(entree([tache(100, { bonusMinutes: 180 })]), NOW)
    expect(avec.feasibility.densities[0]!.loadMinutes).toBe(sans.feasibility.densities[0]!.loadMinutes)
    expect(avec.feasibility.densities[0]!.density).toBeCloseTo(sans.feasibility.densities[0]!.density, 5)
    expect(avec.feasibility.deficits).toEqual(sans.feasibility.deficits)
  })

  it('le bonus libéré est placé comme un bloc normal de la tâche, quand il y a de la place', () => {
    const sans = computePlan(entree([tache(20)]), NOW)
    const avec = computePlan(entree([tache(20, { bonusMinutes: 120 })]), NOW)
    expect(heuresPlacees(avec) - heuresPlacees(sans)).toBeCloseTo(2, 0)
  })

  it('un bonus qui ne tient pas ne crée aucun déficit', () => {
    const p = computePlan(entree([tache(140, { bonusMinutes: 600 })]), NOW)
    const seul = computePlan(entree([tache(140)]), NOW)
    expect(p.feasibility.deficits[0]!.deficitMinutes).toBe(seul.feasibility.deficits[0]!.deficitMinutes)
  })
})
