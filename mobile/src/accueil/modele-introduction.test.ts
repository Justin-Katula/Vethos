import { describe, expect, it } from 'vitest'
import type { Contenu } from '@/donnees/magasin'
import { basculerActivite, creerBrouillon, minuteValide, preparerIntroduction } from './modele-introduction'

const maintenant = new Date('2026-09-21T08:00:00')
const source: Contenu = {
  taches: [],
  objectifs: [],
  ancres: [],
  obligations: [],
  reglages: {
    prenom: '',
    introductionFaite: false,
    apparence: 'dark',
    clairDes: '07:00',
    sombreDes: '19:00',
    coucher: '23:00',
    lever: '07:00',
  },
}
const brouillon = () => ({
  ...creerBrouillon(source.reglages, maintenant),
  nom: 'Learn Spanish',
  activites: ['work' as const],
})

describe('onboarding — le plan est une vraie simulation sans écriture', () => {
  it('places a weekly hours budget outside work and sleep, without mutating the source', () => {
    const avant = JSON.stringify(source)
    const b = { ...brouillon(), nature: 'objectif' as const, heuresHebdo: 4 }
    const p = preparerIntroduction(source, b, maintenant)
    expect(p.ajouts.objectifs[0]?.cibleHebdoMinutes).toBe(240)
    expect(p.blocs.length).toBeGreaterThan(0)
    for (const bloc of p.blocs) {
      expect(bloc.startMinute).toBeGreaterThanOrEqual(7 * 60)
      expect(bloc.endMinute).toBeLessThanOrEqual(23 * 60)
      const jour = new Date(`${bloc.date}T12:00:00`).getDay()
      if (jour >= 1 && jour <= 5)
        expect(bloc.endMinute <= 540 || bloc.startMinute >= 1020).toBe(true)
    }
    expect(JSON.stringify(source)).toBe(avant)
  })

  it('uses the task estimate correction and keeps its real deadline', () => {
    const p = preparerIntroduction(
      source,
      { ...brouillon(), nom: 'Report', minutes: 90, echeance: '2026-09-24' },
      maintenant,
    )
    expect(p.ajouts.taches[0]?.minutesRestantes).toBeGreaterThan(90)
    expect(p.ajouts.taches[0]?.echeance).toBe('2026-09-24')
    expect(p.blocs.length).toBeGreaterThan(0)
    expect(p.blocs.every((b) => b.date <= '2026-09-24')).toBe(true)
  })

  it('keeps an Anchor at the chosen time on the chosen days', () => {
    const p = preparerIntroduction(
      source,
      {
        ...brouillon(),
        nature: 'ancre',
        nom: 'Gym',
        heureAncre: '18:30',
        joursAncre: [1, 3, 5],
        minutes: 60,
      },
      maintenant,
    )
    expect(p.blocs).toHaveLength(3)
    for (const b of p.blocs) {
      expect(b.startMinute).toBe(18 * 60 + 30)
      expect([1, 3, 5]).toContain(new Date(`${b.date}T12:00:00`).getDay())
    }
  })

  it('preserves an empty placement when no time is available', () => {
    const rempli: Contenu = {
      ...source,
      obligations: Array.from({ length: 7 }, (_, dayOfWeek) => ({
        id: `fixed-${dayOfWeek}`,
        dayOfWeek,
        startMinute: 0,
        endMinute: 1440,
        categoryType: 'work',
        label: 'Unavailable',
        color: '#8d8d8d',
      })),
    }
    const p = preparerIntroduction(
      rempli,
      { ...brouillon(), nature: 'objectif', activites: ['none' as const] },
      maintenant,
    )
    expect(p.blocs).toHaveLength(0)
    expect(p.jours.every((j) => j.segments.every((s) => !s.ref || !p.ids.has(s.ref)))).toBe(true)
  })

  it('splits overnight work onto the correct civil dates', () => {
    const p = preparerIntroduction(
      source,
      { ...brouillon(), fixes: { ...brouillon().fixes, work: { debut: '22:00', fin: '06:00', jours: [5] } } },
      maintenant,
    )
    expect(p.ajouts.obligations.map((o) => [o.dayOfWeek, o.startMinute, o.endMinute])).toEqual([
      [5, 1320, 1440],
      [6, 0, 360],
    ])
  })

  it('does not duplicate fixed hours already present', () => {
    const p = preparerIntroduction(source, brouillon(), maintenant)
    const enrichi = { ...source, obligations: p.ajouts.obligations }
    expect(preparerIntroduction(enrichi, brouillon(), maintenant).ajouts.obligations).toHaveLength(
      0,
    )
  })

  it('rejects invalid time, date, duration and quota before saving', () => {
    expect(minuteValide('24:00')).toBeNull()
    expect(minuteValide('18:70')).toBeNull()
    expect(minuteValide('7:05')).toBe(425)
    expect(() =>
      preparerIntroduction(source, { ...brouillon(), coucher: '07:00' }, maintenant),
    ).toThrow()
    expect(() =>
      preparerIntroduction(source, { ...brouillon(), echeance: '2026-02-30' }, maintenant),
    ).toThrow()
    expect(() =>
      preparerIntroduction(
        source,
        { ...brouillon(), nature: 'objectif', heuresHebdo: NaN },
        maintenant,
      ),
    ).toThrow()
    expect(() =>
      preparerIntroduction(
        source,
        { ...brouillon(), nature: 'ancre', heureAncre: '23:30', minutes: 60 },
        maintenant,
      ),
    ).toThrow()
  })

  it('keeps work AND school as fixed time, each with its own hours', () => {
    const b = {
      ...brouillon(),
      nature: 'objectif' as const,
      activites: ['work' as const, 'school' as const],
      fixes: {
        work: { debut: '17:00', fin: '21:00', jours: [6] },
        school: { debut: '08:00', fin: '15:00', jours: [1, 2, 3, 4, 5] },
      },
    }
    const p = preparerIntroduction(source, b, maintenant)
    expect(p.ajouts.obligations.filter((o) => o.categoryType === 'school')).toHaveLength(5)
    expect(p.ajouts.obligations.filter((o) => o.categoryType === 'work')).toHaveLength(1)
  })

  it('never combines “nothing fixed” with anything else', () => {
    expect(basculerActivite(['work', 'school'], 'none')).toEqual(['none'])
    expect(basculerActivite(['none'], 'school')).toEqual(['school'])
    expect(basculerActivite(['work'], 'work')).toEqual([])
  })
})
