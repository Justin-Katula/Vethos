import { describe, expect, it } from 'vitest'
import { tiroirDejaOuvert } from './rechargement'

const lu = (p: string | null) => ({ chargees: true, proprietaire: p })

describe('rechargement du tiroir', () => {
  it('le même compte, déjà lu des deux côtés : rien à rouvrir', () => {
    expect(tiroirDejaOuvert('a', lu('a'), lu('a'))).toBe(true)
  })
  it('un autre compte : on rouvre', () => {
    expect(tiroirDejaOuvert('b', lu('a'), lu('a'))).toBe(false)
  })
  it('un côté pas encore lu : on rouvre', () => {
    expect(tiroirDejaOuvert('a', lu('a'), { chargees: false, proprietaire: null })).toBe(false)
  })
  it('déconnecté : jamais « déjà ouvert »', () => {
    expect(tiroirDejaOuvert(null, lu(null), lu(null))).toBe(false)
  })
})
