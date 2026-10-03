import { describe, expect, it } from 'vitest'
import { liberationsDuJour } from './bonus-tache'
import { calculerPlan } from './moteur'
import type { Tache } from '@/donnees/magasin'
import type { SessionEvent } from '@shared/schemas'
import type { Reglages } from '@/donnees/magasin'

const REGLAGES_DEFAUT: Reglages = { prenom: '', apparence: 'system', clairDes: '07:00', sombreDes: '19:00', introductionFaite: true, coucher: '23:30', lever: '07:00' }

const LUNDI = new Date(2026, 8, 21, 8, 0, 0)
const AUJOURDHUI = '2026-09-21'

const tache = (p: Partial<Tache> = {}): Tache => ({
  id: 't1', titre: 'Dossier', intention: '', echeance: '2026-10-05', importance: 5,
  minutesEstimees: 1200, minutesRestantes: 1200, facteurCorrection: 1, minutesSupplementaires: 0,
  minutesBonus: 0, bonusLibere: [], parentId: null, rangPartie: null, nature: 'routine',
  terminee: false, creeeLe: '2026-09-20T10:00:00.000Z', ...p,
}) as Tache

const evt = (n: number, over: Partial<SessionEvent> = {}): SessionEvent => ({
  blockId: `b${n}`, date: `2026-09-${String(14 + n).padStart(2, '0')}`, kind: 'task', refId: 't1', category: 'général',
  plannedStartMinute: 600, plannedMinutes: 60, started: true, delayMinutes: 0, spontaneous: false,
  heldMinutes: 60, stoppedEarly: false, blockedAttempts: 0, load48hMinutes: 0,
  createdAt: `2026-09-${String(14 + n).padStart(2, '0')}T10:00:00.000Z`, ...over,
}) as SessionEvent

const resultat = (t: Tache) =>
  calculerPlan({ taches: [t], objectifs: [], ancres: [], obligations: [], reglages: REGLAGES_DEFAUT, maintenant: LUNDI })

const args = (t: Tache, over: Record<string, unknown> = {}) => ({
  taches: [t], resultat: resultat(t), events: [evt(1), evt(2), evt(3)], fait: { t1: 360 },
  today: AUJOURDHUI, retardAujourdhui: false, ...over,
})

describe('libération du bonus sur iPhone', () => {
  it('trois blocs tenus et du jeu : du bonus est libéré, sur la tâche, aujourd’hui', () => {
    const l = liberationsDuJour(args(tache()))
    expect(l).toHaveLength(1)
    expect(l[0]).toMatchObject({ id: 't1', date: AUJOURDHUI })
    expect(l[0]!.minutes).toBeGreaterThan(0)
    expect(l[0]!.minutes).toBeLessThanOrEqual(90)
  })

  it('sans bloc tenu, rien', () => {
    expect(liberationsDuJour(args(tache(), { events: [] }))).toEqual([])
  })

  it('une seule libération par jour et par tâche', () => {
    const t = tache({ minutesBonus: 30, bonusLibere: [{ date: AUJOURDHUI, minutes: 30 }] })
    expect(liberationsDuJour(args(t))).toEqual([])
  })

  it('un plan serré (charge qui remplit presque la capacité) ne reçoit aucun bonus', () => {
    const lourde = tache({ minutesEstimees: 20000, minutesRestantes: 20000 })
    expect(liberationsDuJour(args(lourde, { fait: {} }))).toEqual([])
  })

  it('un retard aujourd’hui : rien', () => {
    expect(liberationsDuJour(args(tache(), { retardAujourdhui: true }))).toEqual([])
  })

  it('une tâche terminée ne reçoit rien', () => {
    expect(liberationsDuJour(args(tache({ terminee: true })))).toEqual([])
  })
})
