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

  it('après un « Later » jusqu’à 11 h : le bloc qui prend la place libérée ne bloque pas avant 11 h', () => {
    // Défaut réel du 2026-10-14 : reporté, puis aussitôt rebloqué par le plan recalculé.
    const remplacant = [bloc('objective-g', 605, 650)]
    expect(plagesAuto({ blocsDuJour: remplacant, confirmes: new Set(), nowMinute: 605, selectionId: 's', leveeJusqua: 660 })).toEqual([])
    // Ce qui déborde au-delà commence à l’heure dite.
    const long = [bloc('objective-g', 605, 720)]
    expect(plagesAuto({ blocsDuJour: long, confirmes: new Set(), nowMinute: 605, selectionId: 's', leveeJusqua: 640 })).toEqual([
      { blocId: 'objective-g', debutMinute: 640, finMinute: 665, selectionId: 's' },
    ])
  })

  it('une ancre bloque toute sa durée, même démarrée, et aucun report ne la suspend', () => {
    const ancre = { ...bloc('ancre-x', 600, 720), kind: 'ancre' } as PlacedBlock
    const p = plagesAuto({ blocsDuJour: [ancre], confirmes: new Set(['ancre-x']), nowMinute: 610, selectionId: 's', leveeJusqua: 700 })
    expect(p).toEqual([{ blocId: 'ancre-x', debutMinute: 600, finMinute: 720, selectionId: 's' }])
    // Sa plage est remplacée par l'automatique, jamais doublée.
    const v = fusionnerAuto({ actives: p, auto: p, idsDuPlan: new Set(['ancre-x']), confirmes: new Set(['ancre-x']) })
    expect(v).toHaveLength(1)
  })

  it('une suspension passée ne change plus rien', () => {
    const p = plagesAuto({ blocsDuJour: blocs, confirmes: new Set(), nowMinute: 560, selectionId: 's', leveeJusqua: 500 })
    expect(p.map((x) => x.debutMinute)).toEqual([600, 840])
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
