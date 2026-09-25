import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@shared/schemas'
import {
  betaMean,
  dureeCible,
  inheritedPosterior,
  kaplanMeier,
  probabiliteRupture,
  rng,
  sampleBeta,
  seedFrom,
  updateBeta,
} from './bayes'
import { autonomie, discipline, doseSemaine, estJourTest, facteurDifficulte, phaseHabitude, RAMPE, tenue } from './habitudes'
import { ajustementPour, diagnostiquer, fiabiliteRaison, pauseAnticipee } from './arrets'
import { addDays } from './dates'

const TODAY = '2026-09-25'

/** Un événement de séance, avec des défauts raisonnables. */
function ev(over: Partial<SessionEvent> = {}): SessionEvent {
  return {
    blockId: `b-${Math.random()}`,
    date: '2026-09-20',
    kind: 'objective',
    refId: 'obj',
    category: 'objectif:obj',
    plannedStartMinute: 9 * 60,
    plannedMinutes: 60,
    started: true,
    delayMinutes: 0,
    spontaneous: false,
    heldMinutes: 60,
    stoppedEarly: false,
    blockedAttempts: 0,
    load48hMinutes: 0,
    createdAt: '2026-09-20T09:00:00.000Z',
    ...over,
  }
}
/** n événements, un par jour, en remontant depuis hier. */
const serie = (n: number, f: (i: number) => Partial<SessionEvent> = () => ({})) =>
  Array.from({ length: n }, (_, i) => ev({ date: addDays(TODAY, -(n - i)), ...f(i) }))

describe('Beta avec oubli', () => {
  it('gamma = 0,97 oublie le vieux : une vieille série d’échecs pèse moins qu’une série récente de succès', () => {
    let p = { a: 1, b: 1 }
    for (let i = 0; i < 30; i++) p = updateBeta(p, false)
    for (let i = 0; i < 30; i++) p = updateBeta(p, true)
    expect(betaMean(p)).toBeGreaterThan(0.6)
  })

  it('hérite du parent : un contexte vide prend la moyenne de son parent', () => {
    const parent = Array(20).fill(true)
    const post = inheritedPosterior([parent, []])
    expect(betaMean(post)).toBeGreaterThan(0.85)
  })

  it('le tirage est reproductible à graine égale', () => {
    const p = { a: 3, b: 5 }
    const a = sampleBeta(p, rng(seedFrom('x')))
    const b = sampleBeta(p, rng(seedFrom('x')))
    expect(a).toBe(b)
    expect(a).toBeGreaterThan(0)
    expect(a).toBeLessThan(1)
  })

  it('les tirages suivent la moyenne de la loi', () => {
    const r = rng(42)
    const p = { a: 8, b: 2 }
    const m = Array.from({ length: 2000 }, () => sampleBeta(p, r)).reduce((s, x) => s + x, 0) / 2000
    expect(m).toBeGreaterThan(0.76)
    expect(m).toBeLessThan(0.84)
  })
})

describe('Kaplan-Meier', () => {
  it('traite un bloc tenu jusqu’au bout comme censuré', () => {
    const km = kaplanMeier([
      { minutes: 30, arret: true },
      { minutes: 60, arret: false },
      { minutes: 60, arret: false },
      { minutes: 45, arret: true },
    ])
    expect(km[0]).toEqual({ t: 30, s: 0.75 })
    expect(km[1]!.s).toBeCloseTo(0.75 * (1 - 1 / 3))
  })

  it('durée cible = là où la survie passe sous 80 %, bornée 25-90', () => {
    const obs = [
      ...Array(8).fill({ minutes: 90, arret: false }),
      { minutes: 40, arret: true },
      { minutes: 42, arret: true },
      { minutes: 44, arret: true },
    ]
    expect(dureeCible(obs)).toBe(44)
    expect(dureeCible(obs.slice(0, 4))).toBe(90) // < 5 observations : défaut
    expect(dureeCible([...Array(6).fill({ minutes: 5, arret: true })])).toBe(25)
  })
})

describe('BOCPD', () => {
  it('voit une rupture nette', () => {
    expect(probabiliteRupture([300, 310, 295, 305, 300, 20, 25])).toBeGreaterThan(0.5)
  })
  it('ne voit rien dans une série stable', () => {
    expect(probabiliteRupture([300, 310, 295, 305, 300, 302, 298])).toBeLessThan(0.5)
  })
})

describe('Habitudes', () => {
  it('les quatre mesures de discipline', () => {
    const d = discipline(serie(10, (i) => ({ delayMinutes: i < 8 ? 0 : 20, blockedAttempts: 1 })), 'obj')
    expect(d.fiabiliteDepart).toBeGreaterThan(0.6)
    expect(d.pressionDistraction).toBeCloseTo(1)
    expect(d.observations).toBe(10)
  })

  it('phase 1 → 2 → 3 → 4 selon la mesure, jamais le calendrier', () => {
    expect(phaseHabitude(serie(9), 'obj')).toBe(1)
    expect(phaseHabitude(serie(10), 'obj')).toBe(2)
    expect(phaseHabitude(serie(20), 'obj')).toBe(3)
    expect(phaseHabitude(serie(30, (i) => ({ spontaneous: i >= 17 })), 'obj')).toBe(4)
  })

  it('recul : 3 ratés sur 7 jours font redescendre d’une phase, sans punition', () => {
    const e = [...serie(12), ...['a', 'b', 'c'].map((_, i) => ev({ date: addDays(TODAY, i - 3 + 0), started: false, delayMinutes: null, heldMinutes: null }))]
    expect(phaseHabitude(e, 'obj')).toBe(1)
  })

  it('autonomie = démarrages spontanés / démarrages, sur 14 jours', () => {
    expect(autonomie(serie(10, (i) => ({ spontaneous: i % 2 === 0 })), 'obj', TODAY)).toBe(0.5)
  })

  it('jour-test : un jour sur cinq environ, et toujours le même pour une date donnée', () => {
    const jours = Array.from({ length: 500 }, (_, i) => addDays(TODAY, i))
    const part = jours.filter((d) => estJourTest('obj', d)).length / jours.length
    expect(part).toBeGreaterThan(0.12)
    expect(part).toBeLessThan(0.28)
    expect(estJourTest('obj', TODAY)).toBe(estJourTest('obj', TODAY))
  })
})

describe('Rampe de départ', () => {
  it('première semaine : blocs courts, tous les jours', () => {
    expect(doseSemaine(1200, 0, 0, 0)).toBe(RAMPE.dosePlancher)
    expect(doseSemaine(120, 0, 0, 0)).toBe(120) // jamais au-dessus de la cible
  })
  it('on monte de 15 % quand plus de 90 % est tenu, sans dépasser la cible', () => {
    expect(doseSemaine(1200, 400, 0.95, 7)).toBe(460)
    expect(doseSemaine(420, 400, 0.95, 7)).toBe(420)
  })
  it('on consolide entre 75 et 90 %, on redescend sous 75 %', () => {
    expect(doseSemaine(1200, 400, 0.8, 7)).toBe(400)
    expect(doseSemaine(1200, 400, 0.5, 7)).toBe(360)
  })
  it('la tenue se lit dans le journal : 7 jours pour le volume, 14 pour le taux', () => {
    const t = tenue(serie(14, () => ({ heldMinutes: 45 })), 'obj', TODAY)
    expect(t.tauxTenue).toBeCloseTo(0.75)
    expect(t.tenuRecent).toBe(7 * 45)
  })
  it('difficulté : +10 % au-dessus de 92 %, −10 % sous 75 %', () => {
    expect(facteurDifficulte(0.95, 10)).toBe(1.1)
    expect(facteurDifficulte(0.6, 10)).toBe(0.9)
    expect(facteurDifficulte(0.95, 3)).toBe(1)
  })
})

describe('Explications d’arrêt', () => {
  const arret = (over: Partial<SessionEvent>) => ev({ stoppedEarly: true, ...over })

  it('aucune conclusion sous 5 arrêts', () => {
    expect(diagnostiquer(serie(4, () => ({ stoppedEarly: true, heldMinutes: 5 })))).toBe('pas assez de données')
  })

  it('évitement : arrêts tôt, sur une seule tâche, avec des tentatives d’apps', () => {
    const e = Array.from({ length: 6 }, (_, i) =>
      arret({ date: addDays(TODAY, -i - 1), heldMinutes: 6, stop: { reason: 'boring', attemptsBefore: 2 } }),
    )
    const d = diagnostiquer(e)
    expect(d).not.toBe('pas assez de données')
    if (d === 'pas assez de données') return
    expect(d.evitement).toBeGreaterThan(d.fatigue)
    expect(ajustementPour(e, 'obj').blocMax).toBe(25)
  })

  it('les probabilités somment à 1 — jamais une étiquette certaine', () => {
    const d = diagnostiquer(serie(6, (i) => ({ stoppedEarly: true, heldMinutes: 20 + i * 5 })))
    if (d === 'pas assez de données') throw new Error('attendu')
    expect(Object.values(d).reduce((a, b) => a + b, 0)).toBeCloseTo(1)
  })

  it('fiabilité d’une raison : « distracted » concorde quand des apps ont été tentées', () => {
    const e = serie(8, () => ({ stoppedEarly: true, heldMinutes: 20, stop: { reason: 'distracted', attemptsBefore: 3 } }))
    expect(fiabiliteRaison(e, 'distracted')).toBeGreaterThan(0.8)
  })

  it('pause anticipée : décroche vers 38 min → pause à 34', () => {
    const e = serie(6, () => ({ stoppedEarly: true, heldMinutes: 38, stop: { reason: 'tired', attemptsBefore: 0 } }))
    expect(pauseAnticipee(e, 'obj')).toBe(34)
    expect(pauseAnticipee(e.slice(0, 3), 'obj')).toBeNull()
  })
})

describe('Revue — correctifs', () => {
  it('après un recul, un seul démarrage ne fait pas remonter : la phase se regagne sur des preuves neuves', () => {
    const base = serie(12)
    const rates = [0, 1, 2].map((k) => ev({ date: addDays(TODAY, k), started: false, delayMinutes: null, heldMinutes: null }))
    const apres = [...base, ...rates, ev({ date: addDays(TODAY, 3) })]
    expect(phaseHabitude(apres, 'obj')).toBe(1)
  })

  it('Kaplan-Meier : tout tenu à 40 min → 44, pas un bond à 90', () => {
    expect(dureeCible(Array(6).fill({ minutes: 40, arret: false }))).toBe(44)
  })

  it('le diagnostic se fait sur tous les arrêts : l’évitement ne raccourcit que l’engagement où il se concentre', () => {
    const stop = (refId: string, i: number) =>
      ev({ refId, date: addDays(TODAY, -i - 1), stoppedEarly: true, heldMinutes: 6, stop: { reason: 'boring', attemptsBefore: 2 } })
    const events = [...[0, 1, 2, 3, 4, 5].map((i) => stop('a', i)), stop('b', 7)]
    expect(ajustementPour(events, 'a').blocMax).toBe(25)
    expect(ajustementPour(events, 'b').blocMax).toBeUndefined()
  })

  it('« Something real came up » ne compte pas — sauf s’il devient fréquent', () => {
    const reel = (i: number) => ev({ date: addDays(TODAY, -i - 1), stoppedEarly: true, heldMinutes: 20, stop: { reason: 'real-event', attemptsBefore: 0 } })
    const peu = [...serie(6, () => ({ stoppedEarly: true, heldMinutes: 30, stop: { reason: 'tired', attemptsBefore: 0 } })), reel(9)]
    expect(diagnostiquer(peu)).not.toBe('pas assez de données')
    expect(diagnostiquer([reel(1), reel(2), reel(3), reel(4)])).toBe('pas assez de données')
  })
})
