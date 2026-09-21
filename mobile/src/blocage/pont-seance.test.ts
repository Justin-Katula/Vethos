import { describe, it, expect } from 'vitest'
import type { PlacedBlock } from '@shared/planning/types'
import { avecPlage, plageDeSeance, plagesDuJour } from './pont-seance'
import type { Plage } from './contrat'

/**
 * D.8 : le bouclier ne vit que pendant un bloc confirmé.
 *
 * Ce qui se vérifie ici, c'est la FENÊTRE. Une fenêtre fausse ne lève aucune
 * erreur : l'écran affiche une séance protégée, iOS programme autre chose, et
 * on ne s'en aperçoit qu'en ouvrant l'application qu'on croyait écartée.
 */

const bloc = (p: Partial<PlacedBlock> = {}): PlacedBlock => ({
  id: p.id ?? 'b1',
  date: '2026-09-21',
  startMinute: p.startMinute ?? 14 * 60,
  endMinute: p.endMinute ?? 14 * 60 + 30,
  durationMinutes: (p.endMinute ?? 14 * 60 + 30) - (p.startMinute ?? 14 * 60),
  breakMinutes: 0,
  workMinutes: p.workMinutes ?? 30,
  kind: p.kind ?? 'task',
  refId: 't1',
  label: 'Dossier',
  color: '#c1121f',
  cognitiveWindow: 'NORMALE',
  ...p,
})

/** Un instant local, pour ne dépendre d'aucun fuseau. */
const a = (h: number, m = 0) => new Date(2026, 8, 21, h, m, 0).getTime()

describe('la fenêtre d’une séance confirmée', () => {
  it('démarre à la confirmation, pas à l’heure prévue', () => {
    const p = plageDeSeance({ bloc: bloc(), confirmeAMs: a(14, 12), selectionId: 's' })
    expect(p?.debutMinute).toBe(14 * 60 + 12)
  })

  it('garde la durée de la tâche, même confirmée en retard', () => {
    // La loi du bureau, mot pour mot : la durée appartient à la tâche, pas à
    // son ancien créneau. Une tâche de 30 min confirmée 12 min en retard
    // bloque 30 minutes — pas 18. Couper à l'heure de fin prévue punirait
    // quelqu'un qui vient justement de s'y mettre.
    const p = plageDeSeance({ bloc: bloc(), confirmeAMs: a(14, 12), selectionId: 's' })
    expect(p!.finMinute - p!.debutMinute).toBe(30)
  })

  it('porte l’identifiant du bloc, pour pouvoir le remplacer', () => {
    const p = plageDeSeance({ bloc: bloc({ id: 'tache-x' }), confirmeAMs: a(9), selectionId: 's' })
    expect(p?.blocId).toBe('tache-x')
  })

  it('s’arrête à minuit plutôt que de déborder sur demain', () => {
    // Le lendemain a ses propres plages et n'hérite jamais de la veille.
    const p = plageDeSeance({
      bloc: bloc({ startMinute: 23 * 60, endMinute: 23 * 60 + 90 }),
      confirmeAMs: a(23, 40),
      selectionId: 's',
    })
    expect(p?.finMinute).toBe(24 * 60)
  })

  it('ne rend rien quand il ne reste plus de journée', () => {
    // Mieux vaut aucune plage qu'une plage vide : iOS la rejetterait en
    // silence, et elle consommerait quand même une des vingt surveillances.
    expect(
      plageDeSeance({
        bloc: bloc({ startMinute: 23 * 60 + 58, endMinute: 24 * 60 }),
        confirmeAMs: a(23, 59),
        selectionId: 's',
      })?.finMinute,
    ).toBe(24 * 60)

    expect(
      plageDeSeance({
        bloc: bloc({ startMinute: 0, endMinute: 0 }),
        confirmeAMs: a(23, 59),
        selectionId: 's',
      }),
    ).toBeNull()
  })
})

describe('les plages accumulées du jour', () => {
  const p = (blocId: string, debutMinute: number): Plage => ({
    blocId,
    debutMinute,
    finMinute: debutMinute + 30,
    selectionId: 's',
  })

  it('ajoute une séance aux précédentes', () => {
    expect(avecPlage([p('a', 540)], p('b', 660))).toHaveLength(2)
  })

  it('remplace la plage d’un bloc reconfirmé, jamais deux fois le même', () => {
    // Deux plages pour un même bloc feraient croire a deux seances, et en
    // consommeraient deux sur les vingt d'Apple.
    const apres = avecPlage([p('a', 540)], p('a', 600))
    expect(apres).toHaveLength(1)
    expect(apres[0]!.debutMinute).toBe(600)
  })

  it('jette les plages de la veille', () => {
    // Gardées, celles d'hier se rejoueraient aujourd'hui à la même heure —
    // exactement le minuteur autonome que D.8 interdit.
    expect(plagesDuJour([p('a', 540)], '2026-09-20', '2026-09-21')).toEqual([])
  })

  it('garde celles du jour même', () => {
    expect(plagesDuJour([p('a', 540)], '2026-09-21', '2026-09-21')).toHaveLength(1)
  })
})
