import type { PlanningResult } from '@shared/planning/types'
import type { Obligation, Reglages } from '@/donnees/magasin'
import { versMinute } from './moteur'

export type NatureTemps = 'sleep' | 'fixed' | 'task' | 'objective' | 'ancre'
export type SegmentTemps = {
  id: string
  date: string
  debut: number
  fin: number
  titre: string
  nature: NatureTemps
  travail: number
}
export type JourTemps = {
  date: string
  segments: SegmentTemps[]
  capacite: number
  travail: number
}

export function dateLocale(cle: string): Date {
  const [a = 1970, m = 1, j = 1] = cle.split('-').map(Number)
  return new Date(a, m - 1, j)
}

/** Une seule projection civile, partagée par le cadran, la semaine et l'agenda. */
export function lireSemaine(
  resultat: PlanningResult,
  obligations: readonly Obligation[],
  reglages: Reglages,
): JourTemps[] {
  const coucher = versMinute(reglages.coucher)
  const lever = versMinute(reglages.lever)
  const nuits = coucher < lever ? [[coucher, lever]] : [[0, lever], [coucher, 1440]]
  return resultat.capacities.map((c) => {
    const sommeil: SegmentTemps[] = nuits.filter(([a, b]) => b! > a!).map(([a, b], i) => ({
      id: `nuit-${c.date}-${i}`, date: c.date, debut: a!, fin: b!,
      titre: 'Sommeil', nature: 'sleep', travail: 0,
    }))
    const fixes: SegmentTemps[] = obligations
      .filter((o) => o.dayOfWeek === dateLocale(c.date).getDay())
      .map((o) => ({ id: o.id, date: c.date, debut: o.startMinute, fin: o.endMinute,
        titre: o.label, nature: o.categoryType === 'sleep' ? 'sleep' : 'fixed', travail: 0 }))
    const places: SegmentTemps[] = resultat.blocks.filter((b) => b.date === c.date)
      .map((b) => ({ id: b.id, date: b.date, debut: b.startMinute, fin: b.endMinute,
        titre: b.label, nature: b.kind, travail: b.workMinutes }))
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

export function enHeure(minute: number): string {
  if (minute === 1440) return '24:00'
  const valeur = Math.max(0, Math.round(minute))
  return `${String(Math.floor(valeur / 60) % 24).padStart(2, '0')}:${String(valeur % 60).padStart(2, '0')}`
}

export function duree(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  const h = Math.floor(m / 60)
  return h === 0 ? `${m} min` : m % 60 === 0 ? `${h} h` : `${h} h ${String(m % 60).padStart(2, '0')}`
}
