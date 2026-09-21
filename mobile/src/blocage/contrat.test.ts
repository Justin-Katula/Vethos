import { describe, it, expect } from 'vitest'
import {
  DUREE_MINIMALE_MINUTES,
  MAX_SURVEILLANCES,
  decrireSelection,
  fusionnerPlages,
  limiterAuxCapacitesIOS,
  selectionEstVide,
  type Plage,
  type Selection,
} from './contrat'

const plage = (debutMinute: number, finMinute: number, selectionId = 'sel', blocId = `b${debutMinute}`): Plage => ({
  blocId,
  debutMinute,
  finMinute,
  selectionId,
})

describe('fusion des plages', () => {
  it('colle deux blocs qui se suivent sans interruption', () => {
    // C'est le cas qui compte : une tâche finit a 10h00, un objectif commence a
    // 10h00. Sans fusion, iOS abaisse le bouclier puis le releve — et
    // l'utilisateur qui a son telephone en main passe par la faille.
    const r = fusionnerPlages([plage(540, 600), plage(600, 660)])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ debutMinute: 540, finMinute: 660 })
  })

  it('fusionne aussi ce qui se chevauche', () => {
    const r = fusionnerPlages([plage(540, 620), plage(600, 660)])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ debutMinute: 540, finMinute: 660 })
  })

  it('laisse un vrai trou intact', () => {
    // Une pause reelle entre deux seances doit rester une pause.
    const r = fusionnerPlages([plage(540, 600), plage(630, 690)])
    expect(r).toHaveLength(2)
  })

  it('ne fusionne JAMAIS deux sélections différentes', () => {
    // Deux blocs colles qui ecartent des choses differentes restent deux plages :
    // les fondre ecarterait pendant le premier ce que l'utilisateur n'a choisi
    // d'ecarter que pendant le second.
    const r = fusionnerPlages([plage(540, 600, 'travail'), plage(600, 660, 'sport')])
    expect(r).toHaveLength(2)
    expect(r[0]?.selectionId).toBe('travail')
    expect(r[1]?.selectionId).toBe('sport')
  })

  it('garde l’identifiant du premier bloc, celui que l’utilisateur a confirmé', () => {
    const r = fusionnerPlages([plage(540, 600, 'sel', 'premier'), plage(600, 660, 'sel', 'second')])
    expect(r[0]?.blocId).toBe('premier')
  })

  it('accepte une liste vide et une liste desordonnee', () => {
    expect(fusionnerPlages([])).toEqual([])
    const r = fusionnerPlages([plage(600, 660), plage(540, 600)])
    expect(r).toHaveLength(1)
    expect(r[0]?.debutMinute).toBe(540)
  })

  it('ne modifie pas les plages qu’on lui donne', () => {
    const origine = plage(540, 600)
    fusionnerPlages([origine, plage(600, 660)])
    expect(origine.finMinute).toBe(600)
  })
})

describe('limites d’iOS', () => {
  it('écarte ce qui est trop court pour qu’iOS le tienne', () => {
    const r = limiterAuxCapacitesIOS([plage(540, 550), plage(600, 660)])
    expect(r.retenues).toHaveLength(1)
    expect(r.ecarteesCourtes).toBe(1)
  })

  it('garde une plage qui fait exactement la durée minimale', () => {
    const r = limiterAuxCapacitesIOS([plage(540, 540 + DUREE_MINIMALE_MINUTES)])
    expect(r.retenues).toHaveLength(1)
    expect(r.ecarteesCourtes).toBe(0)
  })

  it('plafonne au nombre de surveillances qu’Apple autorise', () => {
    // Au-dela, `startMonitoring` echoue — et l'utilisateur croit a un defaut.
    const beaucoup = Array.from({ length: MAX_SURVEILLANCES + 5 }, (_, i) =>
      plage(i * 30, i * 30 + 20, 'sel', `b${i}`),
    )
    const r = limiterAuxCapacitesIOS(beaucoup)
    expect(r.retenues).toHaveLength(MAX_SURVEILLANCES)
    expect(r.ecarteesPlafond).toBe(5)
  })

  it('sacrifie les plages COURTES quand il faut choisir', () => {
    // Une seance de deux heures protegee vaut mieux que des quarts d'heure
    // eparpilles — et c'est ce que l'utilisateur remarquerait s'il manquait.
    const courtes = Array.from({ length: MAX_SURVEILLANCES }, (_, i) =>
      plage(i * 30, i * 30 + 20, 'sel', `courte${i}`),
    )
    const longue = plage(1200, 1400, 'sel', 'longue')
    const r = limiterAuxCapacitesIOS([...courtes, longue])
    expect(r.retenues.map((p) => p.blocId)).toContain('longue')
  })

  it('rend les plages retenues dans l’ordre du temps', () => {
    const r = limiterAuxCapacitesIOS([plage(600, 700), plage(300, 500)])
    expect(r.retenues.map((p) => p.debutMinute)).toEqual([300, 600])
  })
})

describe('ce que l’on dit d’une sélection', () => {
  const base: Selection = {
    identifiant: 'sel-1',
    nbApplications: 0,
    nbCategories: 0,
    nbSitesWeb: 0,
    libelle: 'Travail',
    creeeLe: '2026-09-20T10:00:00.000Z',
  }

  it('compte sans jamais nommer une application', () => {
    // iOS ne nous dit pas de quelles applications il s'agit. On ne peut donc
    // ecrire que des nombres — et c'est tres bien ainsi.
    expect(decrireSelection({ ...base, nbApplications: 1 })).toBe('1 application')
    expect(decrireSelection({ ...base, nbApplications: 7 })).toBe('7 applications')
  })

  it('assemble les trois natures avec un « et » final', () => {
    expect(decrireSelection({ ...base, nbApplications: 3, nbCategories: 1, nbSitesWeb: 2 })).toBe(
      '3 applications, 1 catégorie et 2 sites',
    )
  })

  it('reconnaît une sélection vide', () => {
    expect(selectionEstVide(base)).toBe(true)
    expect(decrireSelection(base)).toBe('Rien de sélectionné')
    expect(selectionEstVide({ ...base, nbCategories: 1 })).toBe(false)
  })
})
