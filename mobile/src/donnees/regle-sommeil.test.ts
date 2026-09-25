import { describe, expect, it } from 'vitest'
import { verifierSommeil } from './regle-sommeil'

const ref = { coucher: '23:00', lever: '08:00' }

describe('la règle du sommeil', () => {
  it('tient le plancher de l’âge : 8 h de 13 à 18 ans, 7 h adulte', () => {
    const nuit = { coucher: '23:30', lever: '07:00' } // 7 h 30
    expect(verifierSommeil(nuit, null, 'adulte').ok).toBe(true)
    const ado = verifierSommeil(nuit, null, 'ado')
    expect(ado.ok).toBe(false)
    expect(!ado.ok && ado.raison).toBe('A night is at least 8 hours.')
    expect(verifierSommeil({ coucher: '00:00', lever: '06:30' }, null).ok).toBe(false) // 6 h 30 < 7 h
  })

  it('garde une nuit sous 10 heures', () => {
    expect(verifierSommeil({ coucher: '01:00', lever: '06:30' }, null).ok).toBe(false)
    expect(verifierSommeil({ coucher: '21:00', lever: '07:30' }, null).ok).toBe(false)
    expect(verifierSommeil({ coucher: '23:00', lever: '07:00' }, null).ok).toBe(true)
  })

  it('accepte 2 h réparties entre le coucher et le lever (exemples de l’auteur)', () => {
    expect(verifierSommeil({ coucher: '00:00', lever: '09:00' }, ref).ok).toBe(true)
    expect(verifierSommeil({ coucher: '22:00', lever: '07:00' }, ref).ok).toBe(true)
    expect(verifierSommeil({ coucher: '01:00', lever: '08:00' }, ref).ok).toBe(true)
  })

  it('refuse dès que la marge de 2 h est dépassée', () => {
    const v = verifierSommeil({ coucher: '01:00', lever: '07:30' }, ref)
    expect(v.ok).toBe(false)
    expect(v.utilise).toBe(150)
  })

  it('mesure les écarts sur le cercle de 24 h', () => {
    const v = verifierSommeil({ coucher: '00:30', lever: '08:00' }, { coucher: '23:30', lever: '08:00' })
    expect(v.utilise).toBe(60)
    expect(v.reste).toBe(60)
  })
})
