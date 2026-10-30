import { describe, expect, it, vi } from 'vitest'

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(async () => null), setItem: vi.fn(async () => undefined), multiRemove: vi.fn(async () => undefined) },
}))

import { activerJournal, ajouter, chargerJournal, hhmm, noter, useJournal } from './journal'

describe('le journal des testeurs', () => {
  it('garde les 400 dernières lignes', () => {
    let l = Array.from({ length: 400 }, (_, i) => ({ t: i, sujet: 's', texte: String(i) }))
    l = ajouter(l, { t: 400, sujet: 's', texte: '400' })
    expect(l).toHaveLength(400)
    expect(l[0]!.texte).toBe('1')
    expect(l[399]!.texte).toBe('400')
  })
  it('écrit l’heure comme iOS la lit', () => {
    expect(hhmm(600)).toBe('10:00')
    expect(hhmm(1439)).toBe('23:59')
  })
  it('un compte qui n’est pas testeur n’écrit rien ; un testeur, si', async () => {
    await chargerJournal()
    noter('Blocking', 'x')
    expect(useJournal.getState().entrees).toEqual([])
    await activerJournal(true)
    noter('Blocking', 'y')
    expect(useJournal.getState().entrees.map((e) => e.texte)).toEqual(['y'])
    // Déconnecté : le journal s'efface et se tait.
    await activerJournal(false)
    noter('Blocking', 'z')
    expect(useJournal.getState().entrees).toEqual([])
  })
})
