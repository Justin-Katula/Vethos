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
  it('ne montre une occurrence unique qu’à sa date', () => {
    // Un examen le mardi 22 ne doit pas reapparaitre tous les mardis. Filtrer
    // sur le seul jour de semaine le ferait afficher chaque semaine pendant
    // que le moteur, lui, ne le soustrairait qu'une fois — l'ecran et le
    // calcul diraient deux choses differentes, sans que rien ne le signale.
    const examen = {
      id: 'examen', label: 'Examen', dayOfWeek: 2, startMinute: 540, endMinute: 720,
      categoryType: 'school' as const, color: '#777777', date: '2026-09-22',
    }
    const plan = calculerPlan({ taches: [], objectifs: [], ancres: [], obligations: [examen], reglages, maintenant: new Date(2026, 8, 21, 8) })
    const semaine = lireSemaine(plan, [examen], reglages)
    const jours = semaine.filter((j) => j.segments.some((s) => s.id === 'examen'))
    expect(jours.map((j) => j.date)).toEqual(['2026-09-22'])
  })

  it('empêche le moteur de poser du travail pendant une occurrence unique', () => {
    // Le champ ne sert a rien s'il ne franchit pas la traduction vers le moteur.
    const examen = {
      id: 'examen', label: 'Examen', dayOfWeek: 2, startMinute: 540, endMinute: 720,
      categoryType: 'school' as const, color: '#777777', date: '2026-09-22',
    }
    const tache = {
      id: 't1', titre: 'Réviser', intention: '', echeance: '2026-09-25', importance: 5,
      minutesEstimees: 600, minutesRestantes: 600, facteurCorrection: 1.4,
      minutesSupplementaires: 0, parentId: null, rangPartie: null,
      nature: 'routine' as const, terminee: false, creeeLe: '2026-09-20T10:00:00.000Z',
    }
    const plan = calculerPlan({ taches: [tache], objectifs: [], ancres: [], obligations: [examen], reglages, maintenant: new Date(2026, 8, 21, 8) })
    const duMardi = plan.blocks.filter((x) => x.date === '2026-09-22')
    expect(duMardi.length, 'le mardi doit porter du travail, sinon le test ne prouve rien').toBeGreaterThan(0)
    for (const b of duMardi) {
      expect(b.startMinute < 720 && b.endMinute > 540, `${b.label} chevauche l’examen`).toBe(false)
    }
  })

  it('préserve exactement les blocs du moteur, pauses comprises', () => {
    const entree = { taches: [], objectifs: [{ id: 'piano', nom: 'Piano', intention: '', couleur: '#777777', cibleHebdoMinutes: 350, creeLe: '2026-09-20' }], ancres: [], obligations, reglages, maintenant: new Date(2026, 8, 21, 8) }
    const plan = calculerPlan(entree)
    expect(plan.blocks.length).toBeGreaterThan(0)
    const semaine = lireSemaine(plan, obligations, reglages)
    for (const b of plan.blocks) {
      const seg = semaine.find((j) => j.date === b.date)!.segments.find((s) => s.id === b.id)!
      expect(seg).toMatchObject({
        debut: b.startMinute,
        finEmpreinte: b.endMinute,
        travail: b.workMinutes,
        pause: b.breakMinutes,
        nature: b.kind,
      })
      if (!seg.pauseVisible) {
        expect(seg.fin).toBe(b.endMinute - b.breakMinutes)
      } else {
        expect(seg.fin).toBe(b.endMinute)
      }
    }
  })
})
