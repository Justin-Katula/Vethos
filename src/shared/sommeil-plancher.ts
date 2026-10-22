// Le plancher de sommeil par âge (spec moteur 2026-09-25, principe n° 1).
// AASM : 8 h de 13 à 18 ans, 7 h adulte. Jamais réduit, même en crise.
// Partagé : le bureau et l'iPhone refusent la même nuit.

export const TRANCHES_AGE = ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+'] as const
export type TrancheAge = (typeof TRANCHES_AGE)[number]

/** « 25-34 » → « 25 – 34 ». */
export const libelleTranche = (t: TrancheAge) => t.replace('-', ' – ')

/** Les tranches d'avant (2026-10-23) relues dans les nouvelles : aucun réglage enregistré ne se perd. */
export const versTranche = (v: unknown): unknown =>
  v === '13-18' || v === 'ado' ? '13-17' : v === '19-24' ? '18-24' : v === '25+' || v === 'adulte' ? '25-34' : v

/** Le plancher par âge, en minutes. Sans tranche connue, celui d'un adulte. */
export const plancherSommeil = (tranche?: TrancheAge | null) => (tranche === '13-17' ? 8 * 60 : 7 * 60)

/** La durée d'une nuit « HH:MM » → « HH:MM », sur le cercle de 24 h. */
export function dureeNuitHHMM(coucher: string, lever: string): number | null {
  const m = (h: string) => {
    const r = /^(\d{1,2}):(\d{2})$/.exec(h.trim())
    return r ? Number(r[1]) * 60 + Number(r[2]) : null
  }
  const c = m(coucher)
  const l = m(lever)
  if (c === null || l === null) return null
  return (((l - c) % 1440) + 1440) % 1440
}
