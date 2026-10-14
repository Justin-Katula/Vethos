import { describe, expect, it } from 'vitest'
import type { PlacedBlock } from '@shared/planning/types'
import { fusionnerAuto, memesPlages, plagesAuto } from './blocage-auto'

const bloc = (id: string, start: number, end: number): PlacedBlock =>
  ({ id, date: '2026-10-15', startMinute: start, endMinute: end, durationMinutes: end - start, breakMinutes: 0, workMinutes: end - start, kind: 'task', refId: 'r', label: 'X', color: '#000', cognitiveWindow: 'NORMALE' }) as PlacedBlock

describe('Le blocage qui commence à l’heure', () => {
  const blocs = [bloc('task-a', 600, 690), bloc('task-b', 840, 870), bloc('task-c', 480, 540)]

  it('chaque bloc à venir non confirmé reçoit son écart d’une heure au plus', () => {
    const p = plagesAuto({ blocsDuJour: blocs, confirmes: new Set(), nowMinute: 560, selectionId: 's' })
    expect(p).toEqual([
      { blocId: 'task-a', debutMinute: 600, finMinute: 660, selectionId: 's' },
      { blocId: 'task-b', debutMinute: 840, finMinute: 870, selectionId: 's' },
    ])
  })

  it('une fenêtre ouverte garde son début : rien à reprogrammer d’une minute à l’autre', () => {
    const a = plagesAuto({ blocsDuJour: blocs, confirmes: new Set(), nowMinute: 610, selectionId: 's' })
    const b = plagesAuto({ blocsDuJour: blocs, confirmes: new Set(), nowMinute: 611, selectionId: 's' })
    expect(memesPlages(a, b)).toBe(true)
  })

  it('un bloc confirmé garde la plage de sa séance ; un bloc disparu perd la sienne', () => {
    const seance = { blocId: 'task-a', debutMinute: 605, finMinute: 690, selectionId: 's' }
    const disparu = { blocId: 'task-z', debutMinute: 700, finMinute: 760, selectionId: 's' }
    const urgence = { blocId: 'urgence-task-a', debutMinute: 620, finMinute: 635, selectionId: 's' }
    const confirmes = new Set(['task-a'])
    const auto = plagesAuto({ blocsDuJour: blocs, confirmes, nowMinute: 610, selectionId: 's' })
    const r = fusionnerAuto({ actives: [seance, disparu, urgence], auto, idsDuPlan: new Set(blocs.map((b) => b.id)), confirmes })
    expect(r.map((p) => p.blocId).sort()).toEqual(['task-a', 'task-b', 'urgence-task-a'])
    expect(r.find((p) => p.blocId === 'task-a')).toEqual(seance)
  })
})
