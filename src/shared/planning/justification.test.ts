import { describe, expect, it } from 'vitest'
import { LearningStateSchema, SessionConfirmationsStateSchema } from '@shared/schemas'
import { exclureDuTravail, historiquePourJuge, noterJustification, recompenserRefus, reglesFixes } from './justification'
import { confiance } from './trust'

const l0 = LearningStateSchema.parse({})
const j = (date: string, over: Record<string, unknown> = {}) => ({
  date, sorte: 'stop' as const, blockId: `task-a-${date}-600`, reason: 'tired' as const, text: 'I slept badly, 4 hours.', answers: ['Since 11 pm'], verdict: 'accepte' as const, incoherence: false, rules: false, ...over,
})

describe('La justification d’un Stop ou d’un Later', () => {
  it('le juge relit 30 jours, du plus récent au plus ancien, et oublie au-delà', () => {
    let l = l0
    for (const d of ['2026-09-10', '2026-09-20', '2026-10-12', '2026-10-01']) l = noterJustification(l, j(d))
    const h = historiquePourJuge(l, '2026-10-13')
    expect(h.map((x) => x.joursPasses)).toEqual([1, 12, 23])
    expect(h[0]).toMatchObject({ sorte: 'stop', raison: 'tired', texte: 'I slept badly, 4 hours.', reponses: ['Since 11 pm'] })
  })

  it('règles fixes : quelques mots ET une confiance d’au moins 2', () => {
    expect(reglesFixes({ texte: 'My boss called me in.', niveau: 2 })).toBe('accepte')
    expect(reglesFixes({ texte: 'meh', niveau: 4 })).toBe('refuse')
    expect(reglesFixes({ texte: 'My boss called me in.', niveau: 1 })).toBe('refuse')
  })

  it('une incohérence citée fait baisser la confiance fort ; un simple refus ne la bouge pas', () => {
    const avant = confiance(l0.trust)
    expect(confiance(noterJustification(l0, j('2026-10-13', { verdict: 'refuse' })).trust)).toBe(avant)
    expect(confiance(noterJustification(l0, j('2026-10-13', { verdict: 'refuse', incoherence: true })).trust)).toBeLessThan(avant)
  })

  it('refusé puis tenu quand même : la confiance monte un peu, une seule fois', () => {
    const l = noterJustification(l0, j('2026-10-13', { sorte: 'later', verdict: 'refuse', blockId: 'task-b' }))
    const pasEncore = recompenserRefus(l, SessionConfirmationsStateSchema.parse({ date: '2026-10-13' }), '2026-10-13')
    expect(pasEncore).toBe(l)
    const c = SessionConfirmationsStateSchema.parse({ date: '2026-10-13', confirmedAt: { 'task-b': 1 } })
    const r = recompenserRefus(l, c, '2026-10-13')
    expect(confiance(r.trust)).toBeGreaterThan(confiance(l.trust))
    expect(recompenserRefus(r, c, '2026-10-13')).toBe(r)
  })

  it('le temps passé à se justifier ne compte pas comme du travail', () => {
    const c = exclureDuTravail(SessionConfirmationsStateSchema.parse({ date: '2026-10-13', workCreditedRanges: [{ start: 600, end: 610 }] }), 615, 622)
    expect(c.workCreditedRanges).toEqual([{ start: 600, end: 610 }, { start: 615, end: 622 }])
  })
})
