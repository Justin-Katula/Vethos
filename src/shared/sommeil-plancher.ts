// Le plancher de sommeil par âge (spec moteur 2026-09-25, principe n° 1).
// AASM : 8 h de 13 à 18 ans, 7 h adulte. Jamais réduit, même en crise.
// Partagé : le bureau et l'iPhone refusent la même nuit.

export const TRANCHES_AGE = ['13-18', '19-24', '25+'] as const
export type TrancheAge = (typeof TRANCHES_AGE)[number]

/** Le plancher par âge, en minutes. Sans tranche connue, celui d'un adulte. */
export const plancherSommeil = (tranche?: TrancheAge | null) => (tranche === '13-18' ? 8 * 60 : 7 * 60)

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
