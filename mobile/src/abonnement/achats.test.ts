import { describe, expect, it, vi } from 'vitest'

vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: {} } } }))
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))

import { economie, useAbonnement, type Formule } from './achats'

const f = (type: Formule['type'], montant: number): Formule => ({ id: type, type, prix: `$${montant}`, parMois: null, montant, essaiJours: 7 })

describe('Abonnement', () => {
  it('l’annuel à 49,99 contre douze mois à 9,99 : −58 %', () => {
    expect(economie([f('annuel', 49.99), f('mensuel', 9.99)])).toBe(58)
  })
  it('sans l’une des deux formules, pas de pourcentage inventé', () => {
    expect(economie([f('annuel', 49.99)])).toBeNull()
  })
  it('sans clé RevenueCat, rien n’est bloqué', () => {
    expect(useAbonnement.getState().etat).toBe('indisponible')
  })
})
