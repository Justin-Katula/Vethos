import { describe, it, expect } from 'vitest'
import { computePlan, remainingWorkFor } from '@shared/planning/engine'
import { computeWIPLimit, dailyRhythm, sortTasksByCascade } from '@shared/planning/placement'
import { buildDayCapacity } from '@shared/planning/capacity'

/**
 * La preuve que le pari architectural tient.
 *
 * Vethos pour iPhone ne recopie pas le moteur de planification du bureau : il
 * l'importe. Les deux applications exécutent EXACTEMENT le même code — capacité,
 * placement, faisabilité, repos, apprentissage — et une correction profite aux
 * deux sans qu'on ait à y penser.
 *
 * Si ce fichier cesse de compiler, c'est que le moteur a commencé à dépendre de
 * quelque chose que le téléphone n'a pas : Node, Electron, le disque. Il faut
 * alors corriger le moteur, pas contourner ici.
 */
describe('le moteur du bureau tourne sur le téléphone', () => {
  it('les quatre modules du moteur se chargent', () => {
    expect(typeof computePlan).toBe('function')
    expect(typeof remainingWorkFor).toBe('function')
    expect(typeof dailyRhythm).toBe('function')
    expect(typeof computeWIPLimit).toBe('function')
    expect(typeof buildDayCapacity).toBe('function')
  })

  it('le tri en cascade s’exécute réellement, pas seulement se charge', () => {
    // Un appel vrai : une fonction qui s'importe mais plante au premier appel
    // n'aurait rien prouvé.
    expect(() => sortTasksByCascade([])).not.toThrow()
    expect(sortTasksByCascade([])).toEqual([])
  })

  it('le rythme du jour répond pour les sept jours de la semaine', () => {
    for (let jour = 0; jour < 7; jour++) {
      expect(() => dailyRhythm(jour)).not.toThrow()
    }
  })
})
