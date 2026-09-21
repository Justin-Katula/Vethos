import { describe, it, expect } from 'vitest'
import type { PlacedBlock, PlanningResult, PlanningSignal } from '@shared/planning/types'
import {
  noteDuBloc,
  partsDuree,
  pireDeficit,
  pireTension,
  remarques,
  texteSignal,
  travailDevantToi,
} from './signaux'

/**
 * Ces tests gardent une frontière, pas une logique.
 *
 * Le moteur décide ; ce fichier-ci ne fait que lire ce qu'il a décidé. Ce qui
 * peut casser, c'est donc la LECTURE : une clé de `data` mal orthographiée
 * rend « ratée 0 fois de suite » — une phrase parfaitement formée, parfaitement
 * fausse, que rien ne signale.
 */

const signal = (p: Partial<PlanningSignal> & Pick<PlanningSignal, 'type' | 'data'>): PlanningSignal => ({
  subject: p.subject ?? 'sujet',
  severity: p.severity ?? 'passive',
  type: p.type,
  data: p.data,
})

const bloc = (p: Partial<PlacedBlock> = {}): PlacedBlock => ({
  id: p.id ?? 'b1',
  date: '2026-09-21',
  startMinute: p.startMinute ?? 9 * 60,
  endMinute: p.endMinute ?? 10 * 60,
  durationMinutes: (p.endMinute ?? 10 * 60) - (p.startMinute ?? 9 * 60),
  breakMinutes: p.breakMinutes ?? 0,
  workMinutes: p.workMinutes ?? 60,
  kind: p.kind ?? 'task',
  refId: p.refId ?? 't1',
  label: p.label ?? 'Dossier',
  color: '#c1121f',
  cognitiveWindow: 'NORMALE',
  ...p,
})

describe('les quatre signaux, mis en phrases', () => {
  it('nomme l’ancre ratée et compte les fois', () => {
    const texte = texteSignal(
      signal({ type: 'anchor_missed_3x', data: { ancreId: 'a1', missedCount: 4 } }),
      (id) => (id === 'a1' ? 'Déjeuner' : undefined),
    )
    expect(texte).toBe('Déjeuner — ratée 4 fois de suite, jamais confirmée.')
  })

  it('nomme l’objectif à l’arrêt avec le nom que le moteur donne', () => {
    // Le moteur passe `name` dans `data` : inutile d'aller le rechercher, et
    // surtout inutile d'en inventer un autre.
    const texte = texteSignal(
      signal({ type: 'objective_stalled', data: { name: 'Piano', daysSinceLastService: 5 } }),
      () => undefined,
    )
    expect(texte).toBe('Piano — n’a pas avancé depuis 5 jours.')
  })

  it('nomme le bloc en retard répété', () => {
    const texte = texteSignal(
      signal({ type: 'delay_repeated', data: { refId: 't1', consecutiveDelays: 3 } }),
      (id) => (id === 't1' ? 'Dossier' : undefined),
    )
    expect(texte).toBe('Dossier — retard répété, 3 fois de suite.')
  })

  it('reste muet sur le déficit de densité', () => {
    // C.3.4 : la carte de déficit le montre déjà, avec ses options chiffrées.
    const texte = texteSignal(
      signal({ type: 'density_deficit', data: { deadline: '2026-09-25' } }),
      () => undefined,
    )
    expect(texte).toBeNull()
  })

  it('tient debout quand un nom a disparu', () => {
    // L'ancre a pu être supprimée entre le calcul et l'affichage. Le fait reste
    // vrai ; c'est le nom qui manque, et la phrase ne doit pas dire « undefined ».
    const texte = texteSignal(
      signal({ type: 'anchor_missed_3x', data: { ancreId: 'fantome', missedCount: 3 } }),
      () => undefined,
    )
    expect(texte).toBe('Cette ancre — ratée 3 fois de suite, jamais confirmée.')
  })

  it('laisse tomber les signaux sans phrase, et garde les autres', () => {
    const resultat = {
      signals: [
        signal({ type: 'density_deficit', subject: 'density:2026-09-25', data: {} }),
        signal({ type: 'objective_stalled', subject: 'objective:o1', data: { name: 'Piano', daysSinceLastService: 3 } }),
      ],
    } as unknown as PlanningResult
    const sortie = remarques(resultat, () => undefined)
    expect(sortie).toHaveLength(1)
    expect(sortie[0]!.cle).toBe('objective:o1')
  })
})

describe('ce qui serre le plus, et rien d’autre', () => {
  const avec = (deficits: unknown[], tensions: unknown[]) =>
    ({ feasibility: { deficits, tensionWarnings: tensions } }) as unknown as PlanningResult

  it('prend le premier déficit, celui que le moteur a déjà trié', () => {
    const d = avec([{ deadline: '2026-09-23' }, { deadline: '2026-09-28' }], [])
    expect(pireDeficit(d)?.deadline).toBe('2026-09-23')
  })

  it('prend la tension la plus forte, pas la première venue', () => {
    const d = avec([], [
      { deadline: '2026-09-23', tensionRatio: 0.88 },
      { deadline: '2026-09-28', tensionRatio: 0.96 },
    ])
    expect(pireTension(d)?.deadline).toBe('2026-09-28')
  })

  it('ne réordonne pas le résultat du moteur en place', () => {
    const tensions = [
      { deadline: '2026-09-23', tensionRatio: 0.88 },
      { deadline: '2026-09-28', tensionRatio: 0.96 },
    ]
    pireTension(avec([], tensions))
    expect(tensions[0]!.deadline).toBe('2026-09-23')
  })

  it('ne rend rien quand tout rentre', () => {
    expect(pireDeficit(avec([], []))).toBeUndefined()
    expect(pireTension(avec([], []))).toBeUndefined()
  })
})

describe('ce qu’il reste devant toi', () => {
  it('ne compte pas ce qui est déjà passé', () => {
    const blocs = [
      bloc({ id: 'a', startMinute: 8 * 60, endMinute: 9 * 60, workMinutes: 60 }),
      bloc({ id: 'b', startMinute: 14 * 60, endMinute: 15 * 60, workMinutes: 60 }),
    ]
    expect(travailDevantToi(blocs, 10 * 60)).toBe(60)
  })

  it('entame le bloc en cours, minute par minute', () => {
    // Le chiffre se regarde pendant qu'on travaille. S'il restait figé à 60,
    // il mentirait précisément au moment où on le consulte.
    const blocs = [bloc({ startMinute: 9 * 60, endMinute: 10 * 60, workMinutes: 60 })]
    expect(travailDevantToi(blocs, 9 * 60 + 20)).toBe(40)
  })

  it('ignore les ancres', () => {
    // Une ancre est un rendez-vous avec soi, pas du travail à abattre.
    const blocs = [bloc({ kind: 'ancre', startMinute: 12 * 60, endMinute: 13 * 60, workMinutes: 60 })]
    expect(travailDevantToi(blocs, 10 * 60)).toBe(0)
  })

  it('ne descend jamais sous zéro', () => {
    const blocs = [bloc({ startMinute: 9 * 60, endMinute: 11 * 60, workMinutes: 60, breakMinutes: 60 })]
    expect(travailDevantToi(blocs, 10 * 60 + 55)).toBe(0)
  })
})

describe('la note du bloc', () => {
  it('ne dit rien d’un bloc ordinaire', () => {
    expect(noteDuBloc(bloc())).toBeUndefined()
  })

  it('annonce la pause incluse dans l’empreinte', () => {
    expect(noteDuBloc(bloc({ breakMinutes: 10 }))).toBe('dont 10 min de pause')
  })

  it('fait primer le plafond dépassé sur la pause', () => {
    // Les deux sont vrais. Un plafond franchi est une décision du moteur sous
    // contrainte ; une pause est une mécanique ordinaire.
    expect(noteDuBloc(bloc({ capOverride: true, breakMinutes: 10 }))).toBe(
      'au-delà du plafond',
    )
  })

  it('dit qu’une ancre a été réduite', () => {
    expect(noteDuBloc(bloc({ reducedToMinimum: true }))).toBe('version minimale')
  })

  it('marque un aperçu comme verrouillé', () => {
    // B.5.1 : il occupe la place, mais il ne se travaille pas encore.
    expect(noteDuBloc(bloc({ preview: true }))).toBe(
      'aperçu — verrouillé par la partie précédente',
    )
  })
})

describe('la durée coupée pour l’œil', () => {
  it('sépare l’unité quand il n’y a que des minutes', () => {
    expect(partsDuree(45)).toEqual({ valeur: '45', unite: 'min' })
  })

  it('sépare l’unité sur une heure pleine', () => {
    expect(partsDuree(120)).toEqual({ valeur: '2', unite: 'h' })
  })

  it('garde « 2 h 30 » d’un seul tenant', () => {
    // Séparé, cela donnerait deux nombres à lire au lieu d'un.
    expect(partsDuree(150)).toEqual({ valeur: '2 h 30' })
  })

  it('ne rend jamais de négatif', () => {
    expect(partsDuree(-10)).toEqual({ valeur: '0', unite: 'min' })
  })
})
