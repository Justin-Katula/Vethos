import type { PlanningResult } from '@shared/planning/types'
import type { Obligation, Reglages } from '@/donnees/magasin'
import { plagesSommeil } from './moteur'
import { noteDuBloc } from './signaux'
import { dateLocale } from './format'

// Reexportes ici parce que tout l'ecran de lecture les importe depuis ce
// fichier. Leur definition vit dans `format.ts`, hors du cycle.
export { dateLocale, duree, enHeure } from './format'

export type NatureTemps = 'sleep' | 'fixed' | 'task' | 'objective' | 'ancre'
export type SegmentTemps = {
  id: string
  date: string
  debut: number
  fin: number
  titre: string
  nature: NatureTemps
  travail: number
  /** Ce que le moteur a dû faire pour poser ce bloc là. Absent si rien de notable. */
  note?: string
  /** L'entité d'origine — tâche, objectif, ancre. Vide pour le sommeil et les fixes. */
  ref?: string
}
export type JourTemps = {
  date: string
  segments: SegmentTemps[]
  capacite: number
  travail: number
}

/** Une seule projection civile, partagée par le cadran, la semaine et l'agenda. */
export function lireSemaine(
  resultat: PlanningResult,
  obligations: readonly Obligation[],
  reglages: Reglages,
): JourTemps[] {
  // La MEME nuit que celle que le moteur a soustraite de la capacite. La
  // recalculer ici donnerait une nuit peinte a l'ecran et une autre dans le
  // calcul — et rien ne dirait laquelle est la bonne.
  const nuits = plagesSommeil(reglages)
  return resultat.capacities.map((c) => {
    const sommeil: SegmentTemps[] = nuits.map((n, i) => ({
      id: `nuit-${c.date}-${i}`, date: c.date, debut: n.startMinute, fin: n.endMinute,
      titre: 'Sommeil', nature: 'sleep', travail: 0,
    }))
    const fixes: SegmentTemps[] = obligations
      .filter((o) => o.dayOfWeek === dateLocale(c.date).getDay())
      .map((o) => ({ id: o.id, date: c.date, debut: o.startMinute, fin: o.endMinute,
        titre: o.label, nature: o.categoryType === 'sleep' ? 'sleep' : 'fixed', travail: 0 }))
    const places: SegmentTemps[] = resultat.blocks.filter((b) => b.date === c.date)
      .map((b) => {
        const note = noteDuBloc(b)
        return { id: b.id, date: b.date, debut: b.startMinute, fin: b.endMinute,
          titre: b.label, nature: b.kind, travail: b.workMinutes, ref: b.refId,
          ...(note ? { note } : {}) }
      })
    return {
      date: c.date,
      segments: [...sommeil, ...fixes, ...places].sort((a, b) => a.debut - b.debut),
      capacite: c.effectiveCapacityMinutes,
      travail: places.reduce((s, b) => s + b.travail, 0),
    }
  })
}

export function segmentActuel(segments: readonly SegmentTemps[], minute: number) {
  return segments.find((s) => s.nature !== 'sleep' && s.debut <= minute && minute < s.fin)
    ?? segments.find((s) => s.debut <= minute && minute < s.fin)
}

