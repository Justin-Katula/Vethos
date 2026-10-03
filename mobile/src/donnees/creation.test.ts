import { describe, it, expect } from 'vitest'
import { preparerTache, type BrouillonTache } from './creation'

/**
 * Les deux lois qui s'appliquent entre le formulaire et le magasin.
 *
 * Elles ne se voient nulle part à l'écran : une tâche mal corrigée ou jamais
 * découpée s'affiche exactement comme une bonne. C'est le plan, deux jours
 * plus tard, qui ne tient pas — et rien n'aura prévenu.
 */

let n = 0
const options = (max?: number) => ({
  identifiant: () => `id-${++n}`,
  maintenant: new Date(2026, 8, 21, 8, 0, 0),
  ...(max !== undefined ? { maxParJourMinutes: max } : {}),
})

const brouillon = (p: Partial<BrouillonTache> = {}): BrouillonTache => ({
  titre: p.titre ?? 'Dossier',
  intention: p.intention ?? 'Rédiger les douze pages',
  echeance: p.echeance ?? '2026-09-28',
  importance: p.importance ?? 5,
  minutesEstimees: p.minutesEstimees ?? 60,
  nature: p.nature ?? 'routine',
})

describe('100 h demandées = 100 h planifiées', () => {
  it('un travail connu n’est pas majoré', () => {
    const [t] = preparerTache(brouillon({ minutesEstimees: 100 }), options())
    expect(t!.minutesRestantes).toBe(100)
    expect(t!.facteurCorrection).toBe(1)
  })

  it('une première fois non plus : 100 h restent 100 h', () => {
    // Plus de ×1,7 : le travail demandé n'est jamais gonflé en silence.
    const [t] = preparerTache(brouillon({ minutesEstimees: 100, nature: 'nouveau' }), options())
    expect(t!.minutesRestantes).toBe(100)
    expect(t!.facteurCorrection).toBe(1)
  })

  it('garde l’estimation annoncée intacte', () => {
    const [t] = preparerTache(brouillon({ minutesEstimees: 100 }), options())
    expect(t!.minutesEstimees).toBe(100)
  })
})

describe('B.5 — la tâche trop grosse se découpe toute seule', () => {
  it('ne découpe rien qui tienne dans une journée', () => {
    const sortie = preparerTache(brouillon({ minutesEstimees: 100 }), options(300))
    expect(sortie).toHaveLength(1)
    expect(sortie[0]!.parentId).toBeNull()
  })

  it('découpe sur la durée DEMANDÉE : 100 h demandées = 100 h planifiées', () => {
    // Plus de facteur ×1,4 (2026-10-02) : 200 min tiennent sous un plafond de
    // 250 et restent entières ; 300 min ne tiennent plus et se découpent.
    expect(preparerTache(brouillon({ minutesEstimees: 200 }), options(250))).toHaveLength(1)
    expect(preparerTache(brouillon({ minutesEstimees: 300 }), options(250)).length).toBeGreaterThan(1)
  })

  it('vide la tâche d’origine et passe tout le travail aux parties', () => {
    const sortie = preparerTache(brouillon({ minutesEstimees: 600 }), options(200))
    const origine = sortie[0]!
    const parties = sortie.slice(1)

    expect(origine.parentId).toBeNull()
    expect(origine.minutesRestantes).toBe(0)
    expect(parties.length).toBeGreaterThan(1)
    expect(parties.every((p) => p.parentId === origine.id)).toBe(true)
  })

  it('ne perd pas une minute au découpage', () => {
    const sortie = preparerTache(brouillon({ minutesEstimees: 600 }), options(200))
    const total = sortie.slice(1).reduce((s, p) => s + p.minutesRestantes, 0)
    expect(total).toBe(600) // exactement ce qui a été demandé
  })

  it('numérote les parties, et sans trou', () => {
    // B.5.1 : c'est ce rang qui verrouille une partie tant qu'une sœur
    // antérieure traîne. Sans lui, les cinq morceaux tombent le même jour.
    const parties = preparerTache(brouillon({ minutesEstimees: 600 }), options(200)).slice(1)
    expect(parties.map((p) => p.rangPartie)).toEqual(
      Array.from({ length: parties.length }, (_, i) => i + 1),
    )
  })

  it('donne un identifiant propre à chaque partie', () => {
    const sortie = preparerTache(brouillon({ minutesEstimees: 600 }), options(200))
    expect(new Set(sortie.map((t) => t.id)).size).toBe(sortie.length)
  })

  it('ne découpe pas quand le plafond est inconnu', () => {
    // Mieux vaut une tâche entière qu'un découpage calculé sur une capacité
    // inventée.
    expect(preparerTache(brouillon({ minutesEstimees: 6000 }), options())).toHaveLength(1)
  })
})
