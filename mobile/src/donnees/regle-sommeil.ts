/**
 * La règle du sommeil.
 *
 * 1. Une nuit dure au plus 10 h, et jamais moins que le plancher de son âge
 *    (AASM) : 8 h de 13 à 18 ans, 7 h adulte. Ce plancher ne baisse jamais,
 *    même quand la semaine est en crise.
 * 2. Une fois la nuit déclarée à l'introduction (la référence), elle ne se
 *    déplace que de 2 h AU TOTAL : ce qu'on prend sur le coucher ne se prend
 *    plus sur le lever. Référence 23:00 → 08:00 :
 *    - 00:00 → 09:00 : 1 h + 1 h = 2 h, accepté ;
 *    - 01:00 → 08:00 : 2 h sur le coucher, le lever ne peut plus bouger.
 *
 * Les écarts se mesurent sur le cercle de 24 h : 23:30 et 00:30 sont à 1 h.
 */
// Le plancher vit dans `@shared` : le bureau refuse la même nuit que l'iPhone.
import { plancherSommeil, TRANCHES_AGE, type TrancheAge } from '@shared/sommeil-plancher'
export { plancherSommeil, TRANCHES_AGE, type TrancheAge }
export const SOMMEIL_MAX = 10 * 60
export const MARGE_SOMMEIL = 2 * 60

export function minutesDe(heure: string): number | null {
  const r = /^(\d{1,2}):(\d{2})$/.exec(heure.trim())
  if (!r) return null
  const h = Number(r[1])
  const m = Number(r[2])
  return h <= 23 && m <= 59 ? h * 60 + m : null
}

export const dureeNuit = (coucher: number, lever: number) => (((lever - coucher) % 1440) + 1440) % 1440

/** L'écart le plus court entre deux heures, sur le cercle. */
export const ecartCirculaire = (a: number, b: number) => {
  const d = Math.abs(a - b) % 1440
  return Math.min(d, 1440 - d)
}

export type Nuit = { coucher: string; lever: string }

export type VerdictSommeil =
  | { ok: true; duree: number; utilise: number; reste: number | null }
  | { ok: false; duree: number; utilise: number; reste: number | null; raison: string }

export function verifierSommeil(nuit: Nuit, reference: Nuit | null, tranche?: TrancheAge | null): VerdictSommeil {
  const c = minutesDe(nuit.coucher)
  const l = minutesDe(nuit.lever)
  if (c === null || l === null)
    return { ok: false, duree: 0, utilise: 0, reste: null, raison: 'Choose two valid times.' }
  const duree = dureeNuit(c, l)
  let utilise = 0
  let reste: number | null = null
  const rc = reference ? minutesDe(reference.coucher) : null
  const rl = reference ? minutesDe(reference.lever) : null
  if (rc !== null && rl !== null) {
    utilise = ecartCirculaire(c, rc) + ecartCirculaire(l, rl)
    reste = Math.max(0, MARGE_SOMMEIL - utilise)
  }
  const plancher = plancherSommeil(tranche)
  if (duree < plancher)
    return { ok: false, duree, utilise, reste, raison: `A night is at least ${plancher / 60} hours.` }
  if (duree > SOMMEIL_MAX)
    return { ok: false, duree, utilise, reste, raison: 'A night is at most 10 hours.' }
  if (rc !== null && rl !== null && utilise > MARGE_SOMMEIL)
    return {
      ok: false,
      duree,
      utilise,
      reste,
      raison: `Your night can move 2 h in total around ${reference!.coucher} → ${reference!.lever}.`,
    }
  return { ok: true, duree, utilise, reste }
}
