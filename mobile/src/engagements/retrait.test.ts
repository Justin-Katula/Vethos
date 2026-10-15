import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@shared/schemas'
import { demandesValides, faitsPourGarder, minutesRestantes, type DemandeRetrait } from './retrait'

const T0 = new Date(2026, 9, 14, 15, 0).getTime()
const demande = (minutesAvant: number): DemandeRetrait => ({
  id: `d${minutesAvant}`,
  nature: 'TASK',
  refId: 't',
  nom: 'Portfolio',
  texte: 'I no longer need it',
  a: new Date(T0 - minutesAvant * 60_000).toISOString(),
})
const ev = (refId: string, held: number, started = true) =>
  ({ refId, started, heldMinutes: held, kind: 'task', date: '2026-10-10' }) as unknown as SessionEvent

describe('retirer un engagement', () => {
  it('une demande vit une heure, puis disparaît sans rien retirer', () => {
    expect(demandesValides([demande(10), demande(59), demande(61)], T0).map((d) => d.id)).toEqual(['d10', 'd59'])
    expect(minutesRestantes(demande(10), T0)).toBe(50)
  })

  it('ce qu’on perdrait : le temps mis dedans, les séances, la part faite', () => {
    const f = faitsPourGarder({
      ids: ['t', 't-p2'],
      events: [ev('t', 40), ev('t-p2', 30), ev('t', 0, false), ev('autre', 90)],
      travaille: { t: 260, 't-p2': 120 },
      total: 600,
      creeLe: new Date(T0 - 5 * 86_400_000).toISOString(),
      maintenantMs: T0,
    })
    expect(f).toEqual({ fait: 380, seances: 2, pourcent: 63, jours: 5 })
  })

  it('une ancre : son temps est celui de ses séances tenues', () => {
    const f = faitsPourGarder({ ids: ['a'], events: [ev('a', 30), ev('a', 30)], travaille: {}, total: null, creeLe: new Date(T0).toISOString(), maintenantMs: T0 })
    expect(f).toMatchObject({ fait: 60, seances: 2, pourcent: null })
  })
})
