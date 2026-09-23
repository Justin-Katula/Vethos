import { describe, expect, it } from 'vitest'
import { libreDansLaJournee } from './temps-libre'

describe('le temps libre du cadran', () => {
  it('ne compte pas deux fois une heure de travail qui chevauche l’école', () => {
    const seg = (debut: number, fin: number, nature: 'sleep' | 'fixed') =>
      ({ id: `${debut}`, date: 'd', debut, fin, titre: '', nature, travail: 0 })
    const jour = {
      date: 'd',
      capacite: 0,
      travail: 0,
      segments: [seg(0, 420, 'sleep'), seg(480, 900, 'fixed'), seg(540, 1020, 'fixed'), seg(1410, 1440, 'sleep')],
    }
    // Éveil 07:00–23:30 = 16 h 30 ; pris 08:00–17:00 = 9 h → 7 h 30 libres.
    expect(libreDansLaJournee(jour)).toBe(450)
  })
})
