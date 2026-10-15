import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@shared/schemas'
import { propositionCible } from './ajuster-cible'

const TODAY = '2026-10-14'
const T = new Date(2026, 9, 14, 12, 0).getTime()
const jour = (k: number) => {
  const d = new Date(2026, 9, 14 - k)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const ev = (k: number, held: number, planned = 45): SessionEvent =>
  ({ blockId: `b${k}`, date: jour(k), kind: 'objective', refId: 'o', category: 'objectif:o', plannedStartMinute: 600, plannedMinutes: planned, started: held > 0, heldMinutes: held, stoppedEarly: held < planned }) as unknown as SessionEvent

describe('proposer d’ajuster une cible — jamais d’office', () => {
  it('on peine (40 % tenu) : proposer de baisser vers ce qui tient vraiment', () => {
    const events = Array.from({ length: 10 }, (_, k) => ev(k + 1, k % 5 < 2 ? 45 : 0))
    const p = propositionCible({ objectifId: 'o', cibleMinutes: 300, events, today: TODAY, maintenantMs: T })
    expect(p).toMatchObject({ sens: 'baisser', tenuPourcent: 40 })
    expect(p!.minutes).toBe(135) // 40 % de 5 h × 1,1 → 2 h 15
  })

  it('tout tenu, en entier : proposer de monter de 15 %', () => {
    const events = Array.from({ length: 10 }, (_, k) => ev(k + 1, 45))
    expect(propositionCible({ objectifId: 'o', cibleMinutes: 300, events, today: TODAY, maintenantMs: T })).toEqual({ sens: 'monter', minutes: 345, tenuPourcent: 100 })
  })

  it('entre les deux, trop tôt, ou déjà répondu cette semaine : rien', () => {
    const moyen = Array.from({ length: 10 }, (_, k) => ev(k + 1, 35))
    expect(propositionCible({ objectifId: 'o', cibleMinutes: 300, events: moyen, today: TODAY, maintenantMs: T })).toBeNull()
    const peu = Array.from({ length: 3 }, (_, k) => ev(k + 1, 0))
    expect(propositionCible({ objectifId: 'o', cibleMinutes: 300, events: peu, today: TODAY, maintenantMs: T })).toBeNull()
    const tout = Array.from({ length: 10 }, (_, k) => ev(k + 1, 45))
    const hier = new Date(T - 86_400_000).toISOString()
    expect(propositionCible({ objectifId: 'o', cibleMinutes: 300, events: tout, today: TODAY, derniereReponse: hier, maintenantMs: T })).toBeNull()
  })
})
