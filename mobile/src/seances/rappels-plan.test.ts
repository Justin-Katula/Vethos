import { describe, expect, it } from 'vitest'
import type { PlacedBlock } from '@shared/planning/types'
import { RAPPELS_EN_ATTENTE_MAX, memeBloc, rappelsAProgrammer } from './rappels-plan'

const minuit = new Date(2026, 9, 15).getTime()
const bloc = (id: string, start: number, end: number, kind: PlacedBlock['kind'] = 'task'): PlacedBlock =>
  ({ id, date: '2026-10-15', startMinute: start, endMinute: end, durationMinutes: end - start, breakMinutes: 0, workMinutes: end - start, kind, refId: 'r', label: 'Portfolio site', color: '#000', cognitiveWindow: 'NORMALE' }) as PlacedBlock

describe('Les rappels de « Je commence »', () => {
  it('un préavis 5 min avant, puis vingt rappels toutes les 3 min qui disent que rien n’a commencé', () => {
    const r = rappelsAProgrammer({ blocsDuJour: [bloc('task-a', 840, 930)], confirmes: new Set(), minuitMs: minuit, maintenantMs: minuit + 600 * 60_000 })
    expect(r).toHaveLength(21)
    expect(r[0]).toMatchObject({ titre: 'Portfolio site', corps: 'Starts in 5 min', quand: minuit + 835 * 60_000 })
    expect(r[1]).toMatchObject({ corps: 'It’s time. Not started yet — tap I’m starting.', quand: minuit + 840 * 60_000, reportable: true })
    expect(r[2]!.corps).toBe('3 min late. Not started yet — tap I’m starting.')
    expect(r[20]!.corps).toBe('57 min late. Not started yet — tap I’m starting.')
  })

  it('le préavis passé ne se programme pas', () => {
    const r = rappelsAProgrammer({ blocsDuJour: [bloc('task-a', 840, 930)], confirmes: new Set(), minuitMs: minuit, maintenantMs: minuit + 837 * 60_000 })
    expect(r.some((x) => x.id.endsWith('-avant'))).toBe(false)
  })

  it('rien pour un bloc confirmé, rien dans le passé', () => {
    const blocs = [bloc('task-a', 840, 930), bloc('task-b', 960, 990)]
    const r = rappelsAProgrammer({ blocsDuJour: blocs, confirmes: new Set(['task-a']), minuitMs: minuit, maintenantMs: minuit + 966 * 60_000 })
    expect(r.every((x) => x.blocId === 'task-b')).toBe(true)
    expect(r[0]!.quand).toBe(minuit + 969 * 60_000)
  })

  it('une ancre démarre toute seule : seulement le préavis, sans bouton', () => {
    const r = rappelsAProgrammer({ blocsDuJour: [bloc('ancre-a', 1080, 1110, 'ancre')], confirmes: new Set(), minuitMs: minuit, maintenantMs: minuit })
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ corps: 'Starts in 5 min', avant: true, reportable: false })
  })

  it('jamais plus de 60 en attente : les plus proches d’abord', () => {
    const blocs = [bloc('task-a', 600, 690), bloc('task-b', 720, 810), bloc('task-c', 840, 930), bloc('task-d', 960, 1050)]
    const r = rappelsAProgrammer({ blocsDuJour: blocs, confirmes: new Set(), minuitMs: minuit, maintenantMs: minuit })
    expect(r).toHaveLength(RAPPELS_EN_ATTENTE_MAX)
    expect(r.some((x) => x.blocId === 'task-d')).toBe(false)
  })
})

describe('Les jours suivants (2026-10-22)', () => {
  it('demain : le préavis et l’appel à l’heure, sans la série de relances ; une ancre, le préavis seul', () => {
    const demain = minuit + 86_400_000
    const t = { ...bloc('task-c', 600, 660), date: '2026-10-16' } as PlacedBlock
    const a = { ...bloc('ancre-gym', 1110, 1170, 'ancre'), date: '2026-10-16' } as PlacedBlock
    const r = rappelsAProgrammer({ blocsDuJour: [], confirmes: new Set(), minuitMs: minuit, maintenantMs: minuit + 1200 * 60_000, aVenir: [{ minuitMs: demain, blocs: [t, a] }] })
    expect(r.map((x) => [x.id, x.quand])).toEqual([
      ['rappel-task-c-2026-10-16-avant', demain + 595 * 60_000],
      ['rappel-task-c-2026-10-16-600', demain + 600 * 60_000],
      ['rappel-ancre-gym-2026-10-16-avant', demain + 1105 * 60_000],
    ])
  })
})

describe('« I’m starting » sur la notification (2026-10-30)', () => {
  it('le bloc dont l’id a glissé depuis la programmation reste le même : on le reconnaît par sa tâche', () => {
    // Programmé à 10:00 sous task-r-…-600 ; à 10:07, le bloc en attente s'appelle task-r-…-607.
    expect(memeBloc({ id: 'task-r-2026-10-30-607', refId: 'r' }, { blocId: 'task-r-2026-10-30-600', refId: 'r' })).toBe(true)
    expect(memeBloc({ id: 'task-s-2026-10-30-607', refId: 's' }, { blocId: 'task-r-2026-10-30-600', refId: 'r' })).toBe(false)
    // Une notification d'avant ce correctif (sans refId) : l'id seul.
    expect(memeBloc({ id: 'a', refId: 'r' }, { blocId: 'a' })).toBe(true)
  })
  it('chaque rappel porte la tâche', () => {
    const r = rappelsAProgrammer({ blocsDuJour: [bloc('task-a', 600, 690)], confirmes: new Set(), minuitMs: minuit, maintenantMs: minuit })
    expect(r.every((x) => x.refId === 'r')).toBe(true)
  })
})
