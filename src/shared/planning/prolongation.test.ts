import { describe, it, expect } from 'vitest'
import { LearningStateSchema, SessionConfirmationsStateSchema, type SessionEvent } from '@shared/schemas'
import { accepterProlongation, marquerOffre, offresMaxJour, proposerProlongation, survieA, type ProlongationArgs } from './prolongation'
import { applyStop } from './clock'
import { tenue } from './habitudes'

const TODAY = '2026-09-26'
const ev = (over: Partial<SessionEvent> = {}): SessionEvent => ({
  blockId: 'b',
  date: TODAY,
  kind: 'task',
  refId: 't',
  category: 'général',
  plannedStartMinute: 9 * 60,
  plannedMinutes: 50,
  started: true,
  delayMinutes: 0,
  spontaneous: false,
  heldMinutes: null,
  stoppedEarly: false,
  blockedAttempts: 0,
  load48hMinutes: 0,
  createdAt: '2026-09-26T09:00:00.000Z',
  ...over,
})
/** Des séances passées tenues jusqu'au bout, de 90 min, le matin. */
const passe = (n: number, minutes = 90) =>
  Array.from({ length: n }, (_, i) => ev({ blockId: `p${i}`, date: `2026-09-${String(10 + i).padStart(2, '0')}`, heldMinutes: minutes, plannedMinutes: minutes }))

const base = (over: Partial<ProlongationArgs> = {}): ProlongationArgs => ({
  event: ev(),
  session: { blockId: 'b', startMinute: 9 * 60, workMinutes: 50 },
  nowMinute: 9 * 60 + 49,
  nowMs: Date.parse('2026-09-26T09:49:00Z'),
  today: TODAY,
  events: passe(8),
  historique: [],
  dejaOfferte: false,
  prochainDebut: null,
  coucher: 23 * 60,
  travailDuJour: 120,
  capaciteDuJour: 600,
  ...over,
})

describe('Prolongation — quand proposer', () => {
  it('propose la plus longue durée tenable : 50 min prévues, 90 tenues d’habitude → +45', () => {
    expect(proposerProlongation(base())).toBe(45)
  })

  it('seulement dans les 2 dernières minutes du travail', () => {
    expect(proposerProlongation(base({ nowMinute: 9 * 60 + 40 }))).toBeNull()
    expect(proposerProlongation(base({ nowMinute: 9 * 60 + 50 }))).toBeNull()
  })

  it('jamais sous 5 observations (règle G)', () => {
    expect(proposerProlongation(base({ events: passe(4) }))).toBeNull()
  })

  it('jamais après une tentative d’app bloquée dans les 15 min', () => {
    const recente = ev({ blockedAttempts: 1, lastAttemptAt: Date.parse('2026-09-26T09:40:00Z') })
    expect(proposerProlongation(base({ event: recente }))).toBeNull()
    const ancienne = ev({ blockedAttempts: 1, lastAttemptAt: Date.parse('2026-09-26T09:20:00Z') })
    expect(proposerProlongation(base({ event: ancienne }))).toBe(45)
  })

  it('une seule par bloc, et une offre par jour au départ', () => {
    expect(proposerProlongation(base({ dejaOfferte: true }))).toBeNull()
    expect(proposerProlongation(base({ historique: [{ date: TODAY, accepted: false }] }))).toBeNull()
  })

  it('la suite doit laisser la place : la pause compte si elle vient dans les 30 min', () => {
    // Suite à 10:25 : +30 finit à 10:20, 5 min d'écart < pause de 10 → non ; +15 finit à 10:05, 20 min ≥ 10 → oui.
    expect(proposerProlongation(base({ prochainDebut: 10 * 60 + 25 }))).toBe(15)
  })

  it('jamais au-dessus du seuil de fatigue du jour, ni trop près du coucher', () => {
    expect(proposerProlongation(base({ travailDuJour: 490, capaciteDuJour: 600 }))).toBe(15)
    expect(proposerProlongation(base({ coucher: 10 * 60 + 10 }))).toBeNull()
  })

  it('ne devine pas au-delà de ce qui a déjà été tenu', () => {
    // Tenu 50 min au plus : +15 (65) passe, pas davantage.
    expect(proposerProlongation(base({ events: passe(8, 50) }))).toBe(15)
    expect(survieA(passe(8, 50).map((e) => ({ minutes: e.heldMinutes!, arret: false })), 90)).toBeNull()
  })

  it('le bandit : deux offres quand elles sont acceptées, un jour sur deux quand elles ne le sont jamais', () => {
    const oui = Array.from({ length: 6 }, () => ({ date: '2026-09-20', accepted: true }))
    expect(offresMaxJour(oui, TODAY)).toBe(2)
    const non = Array.from({ length: 6 }, () => ({ date: '2026-09-25', accepted: false }))
    expect(offresMaxJour(non, TODAY)).toBe(0)
    expect(offresMaxJour(non, '2026-09-28')).toBe(1)
  })
})

describe('Prolongation — accepter, s’arrêter, anti-cliquet', () => {
  const etat = () => {
    const confirmations = SessionConfirmationsStateSchema.parse({
      date: TODAY,
      confirmedAt: { b: 1 },
      observedPending: { blockId: 'b', kind: 'task', refId: 't', startMinute: 540, endMinute: 590, workMinutes: 50 },
    })
    const learning = LearningStateSchema.parse({ sessionEvents: [ev()] })
    return marquerOffre(learning, confirmations, 'b')
  }

  it('« Oui » allonge la séance ; la pause ne s’ajoute que si la suite vient dans les 30 min', () => {
    const { learning, confirmations } = etat()
    const libre = accepterProlongation({ learning, confirmations, minutes: 30, prochainDebut: null })!
    expect(libre.confirmations.observedPending).toMatchObject({ workMinutes: 80, endMinute: 620 })
    expect(libre.learning.sessionEvents[0]!.extensionMinutes).toBe(30)
    expect(libre.learning.sessionEvents[0]!.plannedMinutes).toBe(50)
    expect(libre.learning.extensionOffers).toEqual([{ date: TODAY, accepted: true }])
    const suivi = accepterProlongation({ learning, confirmations, minutes: 30, prochainDebut: 630 })!
    expect(suivi.confirmations.observedPending!.endMinute).toBe(630)
  })

  it('s’arrêter pendant la prolongation n’est pas un arrêt anticipé', () => {
    const { learning, confirmations } = etat()
    const p = accepterProlongation({ learning, confirmations, minutes: 30, prochainDebut: null })!
    const r = applyStop({ learning: p.learning, confirmations: p.confirmations, nowMs: 0, minute: 540 + 60, reason: null })!
    const e = r.learning.sessionEvents[0]!
    expect(e.heldMinutes).toBe(60)
    expect(e.stoppedEarly).toBe(false)
    expect(e.stop).toBeUndefined()
  })

  it('anti-cliquet : la dose ne voit que le planifié tenu', () => {
    const events = [ev({ date: '2026-09-24', heldMinutes: 80, plannedMinutes: 50, extensionMinutes: 30 })]
    expect(tenue(events, 't', TODAY).tenuRecent).toBe(50)
  })
})
