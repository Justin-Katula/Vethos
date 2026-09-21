import { describe, expect, it } from 'vitest'
import { calculerPlan } from './moteur'
import { lireSemaine, segmentActuel } from './lecture'

describe('lecture commune du cercle et de la semaine', () => {
  const reglages = { prenom: '', apparence: 'system' as const, clairDes: '07:00', sombreDes: '19:00', introductionFaite: true, lever: '07:00', coucher: '23:30' }
  const obligations = [{ id: 'cours', label: 'Cours', dayOfWeek: 1, startMinute: 540, endMinute: 720, categoryType: 'school' as const, color: '#777777' }]
  const resultat = calculerPlan({ taches: [], objectifs: [], ancres: [], obligations, reglages, maintenant: new Date(2026, 8, 21, 8) })
  it('projette une obligation le lundi, avec les mêmes bornes pour les deux vues', () => {
    const semaine = lireSemaine(resultat, obligations, reglages)
    expect(semaine[0]!.segments.find((s) => s.id === 'cours')).toMatchObject({ debut: 540, fin: 720, nature: 'fixed' })
    expect(semaine[1]!.segments.some((s) => s.id === 'cours')).toBe(false)
    expect(segmentActuel(semaine[0]!.segments, 600)?.titre).toBe('Cours')
    expect(segmentActuel(semaine[0]!.segments, 720)?.titre).not.toBe('Cours')
  })
  it('représente aussi les heures éveillées après minuit', () => {
    const semaine = lireSemaine(resultat, [], { ...reglages, coucher: '02:00' })
    expect(segmentActuel(semaine[0]!.segments, 60)).toBeUndefined()
    expect(segmentActuel(semaine[0]!.segments, 180)?.nature).toBe('sleep')
  })
  it('préserve exactement les blocs du moteur, pauses comprises', () => {
    const entree = { taches: [], objectifs: [{ id: 'piano', nom: 'Piano', intention: '', couleur: '#777777', cibleHebdoMinutes: 350, creeLe: '2026-09-20' }], ancres: [], obligations, reglages, maintenant: new Date(2026, 8, 21, 8) }
    const plan = calculerPlan(entree)
    expect(plan.blocks.length).toBeGreaterThan(0)
    const semaine = lireSemaine(plan, obligations, reglages)
    for (const b of plan.blocks) {
      expect(semaine.find((j) => j.date === b.date)!.segments.find((s) => s.id === b.id)).toMatchObject({ debut: b.startMinute, fin: b.endMinute, travail: b.workMinutes, nature: b.kind })
    }
  })
})
