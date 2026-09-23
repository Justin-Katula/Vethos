import type { JourTemps } from '@/plan/lecture'

/** Le temps libre : l'UNION des plages prises, jamais leur somme (travail et école peuvent se chevaucher). */
export function libreDansLaJournee(jour: JourTemps) {
  const plages = jour.segments
    .filter((s) => s.nature === 'sleep' || s.nature === 'fixed')
    .map((s) => [s.debut, s.fin] as const)
    .sort((a, b) => a[0] - b[0])
  let pris = 0
  let fin = -1
  for (const [d, f] of plages) {
    if (d >= fin) {
      pris += f - d
      fin = f
    } else if (f > fin) {
      pris += f - fin
      fin = f
    }
  }
  return Math.max(0, 1440 - pris)
}

