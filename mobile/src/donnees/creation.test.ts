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

describe('B.1/B.4 — l’estimation n’est jamais prise au mot', () => {
  it('majore une estimation de travail connu', () => {
    const [t] = preparerTache(brouillon({ minutesEstimees: 100 }), options())
    expect(t!.minutesRestantes).toBe(140)
    expect(t!.facteurCorrection).toBe(1.4)
  })

  it('majore davantage une première fois', () => {
    // On se trompe plus lourdement sur ce qu'on n'a jamais fait. Si les deux
    // natures donnaient le même chiffre, le choix « nouveau » du formulaire ne
    // servirait à rien — et l'utilisateur croirait pourtant l'avoir déclaré.
    const [t] = preparerTache(brouillon({ minutesEstimees: 100, nature: 'nouveau' }), options())
    expect(t!.minutesRestantes).toBe(170)
    expect(t!.facteurCorrection).toBe(1.7)
  })

  it('garde l’estimation annoncée intacte, à côté de la corrigée', () => {
    // Les deux chiffres servent : l'annoncé pour se souvenir de ce qu'on
    // pensait, le corrigé pour planifier.
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

  it('découpe sur la durée CORRIGÉE, pas sur celle annoncée', () => {
    // 200 min annoncées tiennent sous un plafond de 250. Corrigées à 280,
    // elles ne tiennent plus. Découper sur l'annoncé laisserait passer une
    // tâche que le moteur ne pourra pas poser.
    const sortie = preparerTache(brouillon({ minutesEstimees: 200 }), options(250))
    expect(sortie.length).toBeGreaterThan(1)
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
    expect(total).toBe(840) // 600 × 1,4
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
