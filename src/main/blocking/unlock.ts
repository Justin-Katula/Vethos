/**
 * Déblocages temporaires.
 *
 * Porte à lui seul deux critères d'acceptation de la spec : la durée d'un
 * déblocage ne dépasse jamais 10 minutes, et un déblocage ne se renouvelle
 * jamais tout seul.
 *
 * Le non-cumul est structurel, pas défendu par une garde : `grantUnlock` ne
 * reçoit ni ne consulte de déblocage antérieur, il calcule toujours
 * `now + unlockDurationMs(isPackaged)`. Il n'existe donc aucune donnée
 * d'entrée à partir de laquelle un appel pourrait additionner une durée à
 * une échéance précédente — la fonction n'a tout simplement pas accès à ce
 * qu'il faudrait pour cumuler. Re-soumettre une justification ne fait que
 * repartir de « maintenant », jamais de l'ancienne échéance.
 */

export const UNLOCK_MS_PROD = 600_000
export const UNLOCK_MS_DEV = 30_000

export type Unlock = { appId: string; until: number }

export function unlockDurationMs(isPackaged: boolean): number {
  return isPackaged ? UNLOCK_MS_PROD : UNLOCK_MS_DEV
}

export function grantUnlock(appId: string, now: number, isPackaged: boolean): Unlock {
  return { appId, until: now + unlockDurationMs(isPackaged) }
}

/** Comparaison stricte : à l'échéance exacte, le déblocage n'est déjà plus actif. */
export function isUnlocked(unlock: Unlock | undefined, now: number): boolean {
  if (unlock === undefined) return false
  return now < unlock.until
}

/** Nouveau tableau via `filter` — le tableau reçu n'est jamais modifié. */
export function pruneExpired(unlocks: readonly Unlock[], now: number): Unlock[] {
  return unlocks.filter((unlock) => isUnlocked(unlock, now))
}
