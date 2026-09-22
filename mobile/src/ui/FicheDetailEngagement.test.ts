import { describe, it, expect } from 'vitest'
import type { SegmentTemps } from '@/plan/lecture'

describe('FicheDetailEngagement - structure des données', () => {
  it('supporte les segments de type tâche avec refId', () => {
    const segment: SegmentTemps = {
      id: 'bloc-1',
      date: '2026-09-21',
      debut: 9 * 60,
      fin: 10 * 60 + 30,
      titre: 'Refonte Mobile',
      nature: 'task',
      travail: 90,
      ref: 'tache-1',
      note: 'Placé en fenêtre de travail profond',
    }

    expect(segment.nature).toBe('task')
    expect(segment.fin - segment.debut).toBe(90)
    expect(segment.ref).toBe('tache-1')
  })

  it('supporte les segments de type objectif, ancre et fixed', () => {
    const natures: SegmentTemps['nature'][] = ['objective', 'ancre', 'fixed']
    for (const nature of natures) {
      const seg: SegmentTemps = {
        id: `bloc-${nature}`,
        date: '2026-09-21',
        debut: 14 * 60,
        fin: 15 * 60,
        titre: `Test ${nature}`,
        nature,
        travail: 60,
      }
      expect(seg.nature).toBe(nature)
    }
  })
})
