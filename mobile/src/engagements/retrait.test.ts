import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@shared/schemas'
import { aEteindre, dernierCoup, faitsPourGarder, flair, memeRaison, noterAuCarnet, type EntreeCarnet } from './retrait'

const T0 = new Date(2026, 9, 14, 15, 0).getTime()
const ev = (refId: string, held: number, started = true) =>
  ({ refId, started, heldMinutes: held, kind: 'task', date: '2026-10-10' }) as unknown as SessionEvent

describe('retirer un engagement', () => {
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

const entree = (joursAvant: number, texte = 'I have no time for this anymore'): EntreeCarnet => ({
  id: `e${joursAvant}-${texte.length}`,
  refId: 'x',
  nature: 'TASK',
  nom: 'X',
  texte,
  reponses: [],
  a: new Date(T0 - joursAvant * 86_400_000).toISOString(),
  joursDepuisCreation: 10,
  minutesFaites: 120,
  seances: 3,
  issue: 'garde',
  flair: false,
})

describe('le dernier coup', () => {
  const jours = [
    { date: '2026-10-14', segments: [{ ref: 't', debut: 14 * 60, fin: 15 * 60 }, { ref: 't', debut: 17 * 60, fin: 18 * 60 }] },
    { date: '2026-10-15', segments: [{ ref: 't-p2', debut: 9 * 60, fin: 10 * 60 }] },
  ]

  it('vise la prochaine séance pas encore finie, parties comprises', () => {
    const c = dernierCoup({ refId: 't', nature: 'TASK', nom: 'T', ids: ['t', 't-p2'], jours, maintenantMs: T0 })
    expect(c.seance).toEqual({ date: '2026-10-14', debut: 17 * 60 })
    expect(new Date(c.jusqua).getTime()).toBe(new Date(2026, 9, 14, 18, 0).getTime())
  })

  it('sans séance au plan, un jour', () => {
    const c = dernierCoup({ refId: 'z', nature: 'GOAL', nom: 'Z', ids: ['z'], jours, maintenantMs: T0 })
    expect(c.seance).toBeNull()
    expect(new Date(c.jusqua).getTime()).toBe(T0 + 86_400_000)
  })

  it("s'éteint une fois passé — jamais pendant sa propre séance", () => {
    const c = dernierCoup({ refId: 't', nature: 'TASK', nom: 'T', ids: ['t', 't-p2'], jours, maintenantMs: T0 })
    const apres = new Date(2026, 9, 14, 18, 1).getTime()
    expect(aEteindre([c], T0, null)).toEqual([])
    expect(aEteindre([c], apres, null)).toHaveLength(1)
    expect(aEteindre([c], apres, 't-p2')).toEqual([])
  })
})

describe('le carnet et le flair', () => {
  const base = { texte: 'I found a better course online', joursDepuisCreation: 10, seances: 4, maintenantMs: T0 }

  it('rien la plupart du temps : le juge ne lit pas le carnet', () => {
    expect(flair({ ...base, carnet: [entree(20)] })).toBeNull()
  })
  it('une série : déjà deux demandes en 14 jours', () => {
    expect(flair({ ...base, carnet: [entree(2), entree(9)] })).toBe('serie')
  })
  it('lâché avant d’avoir servi', () => {
    expect(flair({ ...base, carnet: [], joursDepuisCreation: 1 })).toBe('neuf')
    expect(flair({ ...base, carnet: [], seances: 0 })).toBe('neuf')
  })
  it('une raison déjà donnée', () => {
    expect(memeRaison('I have no time for this', 'honestly no time for this anymore')).toBe(true)
    expect(memeRaison('I have no time', 'The course moved online')).toBe(false)
    expect(flair({ ...base, texte: 'no time for this, sorry', carnet: [entree(20)] })).toBe('deja-dit')
  })
  it('le carnet garde le plus récent devant, borné', () => {
    let c: EntreeCarnet[] = []
    for (let i = 0; i < 70; i++) c = noterAuCarnet(c, { ...entree(0), id: `e${i}` })
    expect(c).toHaveLength(60)
    expect(c[0]!.id).toBe('e69')
  })
})
