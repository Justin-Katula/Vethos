import { describe, expect, it } from 'vitest'
import {
  calculerBornesCarte,
  heuresPaliers,
  positionMinute,
  projectionIntervalle,
} from './carte-semaine'

describe('projection de la carte de semaine', () => {
  it('place le milieu de la journée au milieu de la carte', () => {
    expect(positionMinute(12 * 60, 6 * 60, 18 * 60, 300)).toBe(150)
  })

  it('rogne un bloc qui commence avant la fenêtre visible', () => {
    expect(projectionIntervalle(5 * 60, 8 * 60, 7 * 60, 19 * 60, 360)).toEqual({
      top: 0,
      height: 30,
    })
  })

  it('ignore un bloc entièrement hors de la fenêtre visible', () => {
    expect(projectionIntervalle(60, 120, 7 * 60, 19 * 60, 360)).toBeNull()
  })

  it('calcule la hauteur de pause proportionnelle à la durée totale (Loi E.1)', () => {
    const dureeTotale = 60 // bloc de 60 min (ex: 50 min travail + 10 min pause)
    const pauseMinutes = 10
    const proj = projectionIntervalle(8 * 60, 9 * 60, 7 * 60, 19 * 60, 360)
    expect(proj).not.toBeNull()
    const pauseHauteur = Math.round(proj!.height * (pauseMinutes / dureeTotale))
    expect(pauseHauteur).toBe(5) // 30px / 6 = 5px
  })
})

describe('calculerBornesCarte', () => {
  it('utilise le réveil et le coucher standards', () => {
    const bornes = calculerBornesCarte('07:00', '23:00')
    expect(bornes.debutHeure).toBe(7)
    expect(bornes.finHeure).toBe(23)
    expect(bornes.debut).toBe(7 * 60)
    expect(bornes.fin).toBe(23 * 60)
  })

  it('arrondit le réveil à l’heure inférieure et le coucher à l’heure supérieure', () => {
    const bornes = calculerBornesCarte('07:30', '23:15')
    expect(bornes.debutHeure).toBe(7)
    expect(bornes.finHeure).toBe(24)
  })

  it('plafonne à 24h si le coucher traverse minuit', () => {
    const bornes = calculerBornesCarte('08:00', '00:30')
    expect(bornes.debutHeure).toBe(8)
    expect(bornes.finHeure).toBe(24)
  })
})

describe('heuresPaliers', () => {
  it('génère un pas régulier de 2 heures', () => {
    expect(heuresPaliers(6, 12, 2)).toEqual([6, 8, 10, 12])
    expect(heuresPaliers(7, 13, 2)).toEqual([7, 9, 11, 13])
  })

  it('saute une heure à la fois pour couvrir la journée', () => {
    const paliers = heuresPaliers(6, 24, 2)
    expect(paliers).toEqual([6, 8, 10, 12, 14, 16, 18, 20, 22, 24])
  })
})
