import { describe, it, expect } from 'vitest'
import {
  BONUS_LIBERATION_MAX,
  bonusCible,
  bonusALiberer,
  loiTenue,
} from './bonus'
import type { SessionEvent } from '@shared/schemas'

const evt = (n: number, over: Partial<SessionEvent> = {}): SessionEvent => ({
  blockId: `b${n}`, date: `2026-08-${String(1 + n).padStart(2, '0')}`, kind: 'task', refId: 't', category: 'général',
  plannedStartMinute: 600, plannedMinutes: 60, started: true, delayMinutes: 0, spontaneous: false,
  heldMinutes: 60, stoppedEarly: false, stopsWaived: undefined, blockedAttempts: 0, load48hMinutes: 0,
  createdAt: `2026-08-${String(1 + n).padStart(2, '0')}T10:00:00.000Z`, ...over,
}) as SessionEvent

describe('bonus — un peu en plus, jamais un multiplicateur', () => {
  it('la cible est ADDITIVE : elle ne dépend pas de la taille de la tâche', () => {
    // 11 jours, beaucoup de jeu : 15 min par jour en routine, pas 25 % de 100 h.
    const petit = bonusCible({ workKind: 'routine', joursRestants: 11, jeuMinutes: 100_000, densite: 0.5 })
    expect(petit).toBe(165)
    expect(bonusCible({ workKind: 'novel', joursRestants: 11, jeuMinutes: 100_000, densite: 0.5 })).toBe(330)
  })

  it('jamais plus de 80 % du jeu : le bonus rétrécit avec le plan, jusqu’à zéro', () => {
    expect(bonusCible({ workKind: 'routine', joursRestants: 11, jeuMinutes: 100, densite: 0.7 })).toBe(80)
    expect(bonusCible({ workKind: 'routine', joursRestants: 11, jeuMinutes: 0, densite: 0.7 })).toBe(0)
  })

  it('dès 85 % de densité, plus aucun bonus : le plan est déjà serré', () => {
    expect(bonusCible({ workKind: 'routine', joursRestants: 11, jeuMinutes: 5000, densite: 0.85 })).toBe(0)
    expect(bonusCible({ workKind: 'routine', joursRestants: 11, jeuMinutes: 5000, densite: 1.4 })).toBe(0)
  })

  it('plafonné : jamais plus de 10 h de bonus, même sur une très longue échéance', () => {
    expect(bonusCible({ workKind: 'novel', joursRestants: 200, jeuMinutes: 1_000_000, densite: 0.1 })).toBe(600)
  })
})

describe('bonus — la tenue des blocs (Beta avec oubli)', () => {
  it('départ Beta(3, 1) : moyenne 0,75, rien n’est libéré', () => {
    const l = loiTenue([])
    expect(l).toEqual({ a: 3, b: 1 })
  })

  it('trois blocs tenus → la loi passe le seuil', () => {
    const l = loiTenue([evt(1), evt(2), evt(3)])
    expect(l.a / (l.a + l.b)).toBeGreaterThan(0.85)
  })

  it('un bloc raté ou démarré trop court compte comme manqué', () => {
    const l = loiTenue([evt(1), evt(2), evt(3, { heldMinutes: 30 })])
    expect(l.b).toBeGreaterThan(1)
  })

  it('les séances de rattrapage ne comptent pas', () => {
    const l = loiTenue([evt(1, { promiseId: 'p' }), evt(2, { forced: true })])
    expect(l).toEqual({ a: 3, b: 1 })
  })

  it('une séance encore ouverte ne compte pas', () => {
    expect(loiTenue([evt(1, { heldMinutes: null })])).toEqual({ a: 3, b: 1 })
  })
})

describe('bonus — libération', () => {
  const base = {
    cible: 300, dejaLibere: 0, minutesPlancher7j: 1200, libere7j: 0,
    plancherPlace: true, retardAujourdhui: false,
  }
  const tenus = [evt(1), evt(2), evt(3)]

  it('trois blocs tenus → du bonus est libérable', () => {
    expect(bonusALiberer({ ...base, events: tenus })).toBeGreaterThan(0)
  })

  it('au départ, sans bloc tenu, rien', () => {
    expect(bonusALiberer({ ...base, events: [] })).toBe(0)
  })

  it('un bloc raté ensuite → plus rien', () => {
    expect(bonusALiberer({ ...base, events: [...tenus, evt(4, { started: false, heldMinutes: null, delayMinutes: null })] })).toBe(0)
  })

  it('jamais tant que le plancher n’est pas entièrement placé', () => {
    expect(bonusALiberer({ ...base, events: tenus, plancherPlace: false })).toBe(0)
  })

  it('jamais un jour de retard', () => {
    expect(bonusALiberer({ ...base, events: tenus, retardAujourdhui: true })).toBe(0)
  })

  it('au plus 90 min par libération, et 15 % du plancher travaillé sur 7 jours', () => {
    expect(bonusALiberer({ ...base, events: tenus, cible: 5000, minutesPlancher7j: 100_000 })).toBe(BONUS_LIBERATION_MAX)
    // 15 % de 1200 = 180 ; 100 déjà libérés cette semaine → 80 restent.
    expect(bonusALiberer({ ...base, events: tenus, minutesPlancher7j: 1200, libere7j: 100 })).toBe(80)
  })

  it('jamais plus que ce qui reste de la cible', () => {
    expect(bonusALiberer({ ...base, events: tenus, cible: 300, dejaLibere: 280 })).toBe(20)
    expect(bonusALiberer({ ...base, events: tenus, cible: 300, dejaLibere: 300 })).toBe(0)
  })
})
