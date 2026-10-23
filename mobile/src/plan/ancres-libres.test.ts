import { describe, expect, it } from 'vitest'
import { ancreCollee, debutAvecPause, heurePrise, heuresOccupees, joursPris, premierConflit, type AncrePosee } from './ancres-libres'

const TOUS = [0, 1, 2, 3, 4, 5, 6]
const sport: AncrePosee = { id: 's', nom: 'Gym', minuteAncrage: 17 * 60, dureeMinutes: 60, jours: [1, 3, 5] }
const lecture: AncrePosee = { id: 'l', nom: 'Read', minuteAncrage: 7 * 60, dureeMinutes: 30, jours: TOUS }

describe('où poser une ancre', () => {
  it('un jour encore libre : l’heure reste choisissable, seuls les jours pris se marquent', () => {
    expect(joursPris([sport], 17 * 60 + 30, 30)).toEqual([1, 3, 5])
    expect(heurePrise([sport], 17 * 60 + 30, 30)).toBe(false)
  })

  it('prise les sept jours : l’heure est grise', () => {
    expect(heurePrise([lecture], 7 * 60 + 15, 30)).toBe(true)
    expect(heurePrise([lecture], 7 * 60 + 30, 30)).toBe(false)
  })

  it('la durée compte : 16 h 30 pendant 45 min mord sur 17 h', () => {
    expect(joursPris([sport], 16 * 60 + 30, 45)).toEqual([1, 3, 5])
    expect(joursPris([sport], 16 * 60 + 30, 30)).toEqual([])
  })

  it('bout à bout : la nouvelle suit à 18 h 00 → proposée à 18 h 05', () => {
    const v = ancreCollee([sport], 18 * 60, 30, [1])
    expect(v).toMatchObject({ sens: 'apres', ecart: 0 })
    expect(debutAvecPause(18 * 60, v!)).toBe(18 * 60 + 5)
  })

  it('bout à bout : la nouvelle finit à 17 h → elle recule à 16 h 25', () => {
    const v = ancreCollee([sport], 16 * 60 + 30, 30, [3])
    expect(v).toMatchObject({ sens: 'avant', ecart: 0 })
    expect(debutAvecPause(16 * 60 + 30, v!)).toBe(16 * 60 + 25)
  })

  it('pas de jour commun, ou déjà 5 min d’écart : rien à demander', () => {
    expect(ancreCollee([sport], 18 * 60, 30, [2])).toBeNull()
    expect(ancreCollee([sport], 18 * 60 + 5, 30, [1])).toBeNull()
  })
})

describe('heuresOccupees — le sommeil compte', () => {
  const nuits = [{ startMinute: 0, endMinute: 420 }, { startMinute: 1410, endMinute: 1440 }]
  const travail = { id: 'w', label: 'Work', categoryType: 'work', dayOfWeek: 1, startMinute: 540, endMinute: 1020 }
  const pris = heuresOccupees([travail, { ...travail, id: 's', categoryType: 'sleep' }], nuits)

  it('refuse une ancre dans la nuit, tous les jours', () => {
    expect(premierConflit(pris, 360, 60, [3])?.sommeil).toBe(true)
    expect(premierConflit(pris, 1380, 60, [6])?.sommeil).toBe(true)
  })
  it('refuse le travail seulement les jours de travail', () => {
    expect(premierConflit(pris, 600, 60, [1])?.nom).toBe('Work')
    expect(premierConflit(pris, 600, 60, [2])).toBeNull()
  })
  it('une ancre au lever ne demande pas de pause', () => {
    expect(ancreCollee(pris, 420, 30, [2])).toBeNull()
  })
})
