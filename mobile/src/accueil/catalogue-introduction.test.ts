import { describe, expect, it } from 'vitest'
import { annee, calendrier, equivalence, mesurer, repousse, resume } from './catalogue-introduction'
import { brouillonsDepuis, etatInitial, parcours, reglagesPour, type EtatIntro } from './etat-introduction'

const jeudi = new Date(2026, 8, 24, 18, 10)

describe('ce que coûte « demain »', () => {
  it('la salle, six mois, une fois par semaine : 104 prévues, 26 faites, 156 h', () => {
    const m = mesurer('gym', { since: 2, goal: 0, now: 1 }, jeudi)
    expect(m.weeks).toBe(26)
    expect(m.lost).toBe(156)
    expect(m.unit).toBe('hours')
    expect(m.l1).toBe('Since March, you meant 104 workouts. You went to 26.')
    expect(m.l2).toBe('If nothing changes, another 78 workouts are gone by March.')
  })

  it('sous 40 h perdues, on compte les séances plutôt que les heures', () => {
    const m = mesurer('med', { since: 0, goal: 0, now: 0 }, jeudi)
    expect(m.lost).toBeLessThan(40)
    expect(m.unit).toBe('meditations')
    expect(m.big).toBe(28)
    expect(m.sub).toBe('skipped since you first decided.')
  })

  it('une chose unique : les heures prévues, et la date où elle finirait à ce rythme', () => {
    const m = mesurer('assign', { since: 1, work: 1, now: 1 }, jeudi)
    expect(m.l1).toBe('Since June, you meant to put in 30 hours. You put in 13.')
    expect(m.finish).not.toBeNull()
    expect(m.l2).toMatch(/^At this pace, it’s only done in /)
  })

  it('le total parle en heures dès 40 h, avec son équivalent', () => {
    const r = resume([
      mesurer('gym', { since: 2, goal: 0, now: 1 }, jeudi),
      mesurer('read', { since: 1, goal: 0, now: 0 }, jeudi),
    ])
    expect(r.v).toBe(202)
    expect(r.label).toBe('hours you’ll never get back.')
    expect(r.eq).toBe('That’s 5 full work weeks of your life.')
    expect(equivalence(20)).toBe('That’s 3 full working days of your life.')
    expect(equivalence(6)).toBe('That’s 3 whole evenings of your life.')
  })
})

describe('les soirs repoussés', () => {
  it('« presque chaque soir » en repousse exactement cinq par semaine, jamais les mêmes', () => {
    const semaine = (lundi: Date) =>
      Array.from({ length: 7 }, (_, i) => new Date(lundi.getFullYear(), lundi.getMonth(), lundi.getDate() + i, 12))
    const a = semaine(new Date(2026, 8, 21)).map((d) => repousse(d, 5))
    const b = semaine(new Date(2026, 8, 28)).map((d) => repousse(d, 5))
    expect(a.filter(Boolean)).toHaveLength(5)
    expect(b.filter(Boolean)).toHaveLength(5)
    expect(a).not.toEqual(b)
  })

  it('le calendrier va du mois de la décision à trois mois après aujourd’hui ; aujourd’hui n’est jamais rouge', () => {
    const m = mesurer('gym', { since: 2, goal: 0, now: 1 }, jeudi)
    const rows = calendrier(m.start, m.finish, 5, jeudi)
    expect(rows[0]!.label).toBe('Mar')
    expect(rows[rows.length - 1]!.label).toBe('Dec')
    const tous = rows.flatMap((r) => r.dots)
    expect(tous.filter((d) => d.today)).toHaveLength(1)
    expect(tous.some((d) => d.today && d.rouge)).toBe(false)
    expect(tous.some((d) => d.futur)).toBe(true)
  })

  it('l’année qui vient : un soir repoussé sur dix reste rouge avec Vethos', () => {
    const y = annee(5, jeudi)
    expect(y.cells).toHaveLength(365)
    expect(y.K).toBe(Math.floor(y.M / 10))
    expect(y.cells[0]!.today).toBe(true)
  })
})

describe('le parcours et la création', () => {
  const base = (): EtatIntro => ({
    ...etatInitial('Alex', '2026-10-08'),
    prios: ['Health', 'School'],
    freq: 0,
    things: ['gym', 'assign'],
    det: { gym: { since: 2, goal: 0, now: 1 }, assign: { since: 1, work: 1, now: 1 } },
    stops: [0, 1],
  })

  it('trois questions par chose ; la chose unique demande le travail, la répétée le but', () => {
    const f = parcours(base(), jeudi).map((s) => s.k)
    expect(f.slice(0, 11)).toEqual(['1', '1b', '2', '3', '4', '5a', '5b', '5c', '5a', '5g', '5c'])
    // La plus lourde passe en premier aux réglages ; une ancre en a deux.
    expect(f).toContain('12b')
    expect(f[f.length - 1]).toBe('17')
  })

  it('un objectif n’a qu’un réglage', () => {
    const e = { ...base(), chosen: 'gym', type: { gym: 'GOAL' as const } }
    expect(parcours(e, jeudi).map((s) => s.k)).not.toContain('12b')
  })

  it('les réglages partent de ce que la chose demande vraiment', () => {
    const r = reglagesPour(base(), 'gym', jeudi)
    expect(r.w.anDur).toBe(120)
    expect(r.w.goalMin).toBe(480)
    expect(r.days.an.filter(Boolean)).toHaveLength(4)
  })

  it('les réponses deviennent des engagements : la choisie, et les autres retenues', () => {
    const e: EtatIntro = {
      ...base(),
      chosen: 'gym',
      type: { gym: 'ANCHOR' },
      fixed: ['Work'],
      days: { an: [1, 0, 1, 0, 1, 0, 0], wk: [1, 1, 1, 1, 1, 0, 0], sc: [0, 0, 0, 0, 0, 0, 0] },
    }
    const { b, autres } = brouillonsDepuis(e, jeudi, () => '2026-10-22')
    expect(b.nature).toBe('ancre')
    expect(b.nom).toBe('Go to the gym')
    expect(b.joursAncre).toEqual([1, 3, 5])
    expect(b.activites).toEqual(['work'])
    expect(b.fixes.work.jours).toEqual([1, 2, 3, 4, 5])
    expect(autres).toHaveLength(1)
    expect(autres[0]!.nature).toBe('tache')
    expect(autres[0]!.nom).toBe('Finish my assignment')
    expect(autres[0]!.echeance).toBe('2026-10-22')
  })
})
