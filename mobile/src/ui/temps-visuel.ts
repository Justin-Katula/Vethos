import type { Jetons } from '@/theme/jetons'
import type { NatureTemps } from '@/plan/lecture'

export function couleurTemps(nature: NatureTemps, j: Jetons): string {
  if (nature === 'task') return j.accentEncre
  if (nature === 'objective') return j.text2
  if (nature === 'ancre') return j.blocAncre
  if (nature === 'fixed') return j.text3
  return j.surface3
}
export const nomsTemps: Record<NatureTemps, string> = {
  sleep: 'Sommeil', fixed: 'Fixe', task: 'Tâche', objective: 'Objectif', ancre: 'Ancre',
}
