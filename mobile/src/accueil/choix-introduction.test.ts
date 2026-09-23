import { describe, expect, it } from 'vitest'
import { bilan, CHOSES, echoFrequence, equivalenceTotale } from './choix-introduction'

const maintenant = new Date('2026-09-23T12:00:00')
const chose = (id: string) => CHOSES.find((c) => c.id === id)!

describe('le calcul, chose par chose', () => {
  it('la salle : 4 séances de 2 h, pas 1 h comme une autre habitude', () => {
    const b = bilan(chose('salle'), 3, { depuis: 13, rythme: 1 }, maintenant)
    // (4 − 1) × 13 = 39 séances × 2 h = 78 h
    expect(b.heuresPerdues).toBe(78)
    expect(b.lignes[2]).toBe('3 missed a week × 13 weeks = 39 workouts.')
    expect(b.futur).toBe('At your current pace: 52 this year, instead of 208.')
  })

  it('la lecture ne se compte pas comme la salle', () => {
    const b = bilan(chose('lecture'), 3, { depuis: 13, rythme: 1 }, maintenant)
    // (7 − 1) × 13 = 78 séances × 30 min = 39 h
    expect(b.heuresPerdues).toBe(39)
  })

  it('une chose unique : les soirs repoussés, chacun d’une vraie séance', () => {
    const b = bilan(chose('lancer'), 3, { depuis: 26, travail: 30, rythme: 1 }, maintenant)
    // 3 soirs × 2 h 30 × 26 semaines = 195 h
    expect(b.heuresPerdues).toBe(195)
    expect(b.passe).toMatch(/6 times over/)
    expect(b.futur).toMatch(/^At your current pace: /)
  })

  it('la fréquence choisie change le calcul et les mots', () => {
    const peu = bilan(chose('lancer'), 1, { depuis: 26, travail: 30, rythme: 1 }, maintenant)
    const beaucoup = bilan(chose('lancer'), 5, { depuis: 26, travail: 30, rythme: 1 }, maintenant)
    expect(beaucoup.heuresPerdues).toBeGreaterThan(peu.heuresPerdues)
    expect(echoFrequence(5).titre).not.toBe(echoFrequence(0.5).titre)
  })

  it('il dit « rarement », sa réponse dit le contraire : on le lui montre', () => {
    const b = bilan(chose('salle'), 0.5, { depuis: 13, rythme: 0 }, maintenant)
    expect(b.lignes.at(-1)).toMatch(/This one says otherwise/)
  })

  it('traduit le total en jours de vie', () => {
    expect(equivalenceTotale(480)).toMatch(/20 full days/)
  })

  it('chaque chose a sa base écrite et sa grammaire', () => {
    for (const c of CHOSES) {
      expect(c.verbe.length).toBeGreaterThan(2)
      if (c.famille === 'unique') expect(c.objet).toBeTruthy()
      else expect(c.realite && c.cible > 0).toBeTruthy()
    }
  })
})
