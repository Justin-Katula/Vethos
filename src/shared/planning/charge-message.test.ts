import { describe, it, expect } from 'vitest'
import { computePlan } from './engine'
import { messagesCharge, formatHeures } from './charge-message'
import { sleepScheduleEntries } from '@shared/sleep'
import type { PlanningInput, ScheduleEntry, TaskItem } from './types'

const NOW = new Date(2026, 7, 11, 8, 0)
const fixe: ScheduleEntry[] = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
  dayOfWeek, startMinute: 480, endMinute: 630, categoryType: 'school', label: 'F', color: '#5E81AC',
}))
const tache = (heures: number, deadline = '2026-08-21'): TaskItem => ({
  id: '00000001-1111-4111-8111-111111111111', title: 'Projet', plan: 'x', deadline,
  importance: 5, category: 'général', workKind: 'routine', estimatedMinutes: heures * 60,
  remainingMinutes: heures * 60, correctionFactor: 1, parentTaskId: null, partOrder: null,
  extraMinutes: 0, status: 'active', appsToBlock: [], createdAt: '2026-08-01T10:00:00.000Z',
})
const plan = (t: TaskItem) => {
  const input: PlanningInput = {
    today: '2026-08-11', rangeEnd: t.deadline, tasks: [t], objectives: [], ancres: [],
    schedule: [...sleepScheduleEntries('23:00', '07:00'), ...fixe], observations: [],
    anchorMissCounts: {}, dailyUtilization: {}, weeklyObjectiveServed: {}, objectiveLastServed: {},
    lastSignalAt: {}, tasksCreatedPerWeek: {}, consecutiveDelays: {},
  }
  return computePlan(input, NOW)
}
const messages = (t: TaskItem) => messagesCharge({ result: plan(t), tasks: [t], today: '2026-08-11' })

describe('messages de charge — chiffrés, sans jugement, sans question', () => {
  it('formate les heures comme on les dit', () => {
    expect(formatHeures(6000)).toBe('100 h')
    expect(formatHeures(115)).toBe('1 h 55')
    expect(formatHeures(545)).toBe('9 h 05')
    expect(formatHeures(40)).toBe('40 min')
  })

  it('ça tient avec du jeu : aucun message', () => {
    expect(messages(tache(20))).toEqual([])
  })

  it('sous tension : ce que ça demande par jour, et le temps libre qui reste', () => {
    // 100 h tiennent (densité ≈ 0,8) : le message dit ce que ça coûte.
    const [m] = messages(tache(100))
    expect(m).toBeDefined()
    expect(m!.niveau).toBe('tension')
    expect(m!.texte).toContain('100 h before 21 Aug')
    expect(m!.texte).toMatch(/a day, \d+% of your capacity/)
    expect(m!.texte).toContain('Free time left')
    expect(m!.texte).toContain('Rest is cut to its minimum')
  })

  it('ça ne tient pas : ce qui est placé, ce qui manque, et que le reste est fait au mieux', () => {
    const [m] = messages(tache(170))
    expect(m!.niveau).toBe('deficit')
    expect(m!.texte).toContain('170 h asked')
    expect(m!.texte).toMatch(/\d+ h( \d+)? placed before 21 Aug/)
    expect(m!.texte).toMatch(/\d+ h( \d+)? missing/)
    expect(m!.texte).toContain('as well as it can be')
  })

  it('jamais une question, jamais un jugement', () => {
    for (const h of [100, 120, 170]) {
      for (const m of messages(tache(h))) {
        expect(m.texte).not.toContain('?')
        expect(m.texte.toLowerCase()).not.toMatch(/should|too much|unrealistic|you must/)
      }
    }
  })

  it('le plancher seul compte : un bonus libéré ne change ni le chiffre demandé ni le déficit', () => {
    const avec = { ...tache(170), bonusMinutes: 300 }
    expect(messages(avec)[0]!.texte).toContain('170 h asked')
  })
})
