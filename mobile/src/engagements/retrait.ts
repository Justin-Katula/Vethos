/**
 * Retirer un engagement ne se fait pas d'un geste. Comme un Later : on
 * s'explique d'abord ; puis l'app montre ce qui a déjà été mis dedans, pour
 * donner envie de le garder. Si l'on insiste, la demande attend dans Profil —
 * une heure, pas plus — et c'est là seulement qu'on retire pour de bon.
 * Gardé : rien n'apparaît dans Profil. Jamais pendant une séance.
 */
import type { SessionEvent } from '@shared/schemas'

/** Une demande vit une heure ; ensuite, elle disparaît sans rien retirer. */
export const RETRAIT_VALIDITE_MS = 60 * 60_000

export type NatureRetrait = 'TASK' | 'GOAL' | 'ANCHOR'

export type DemandeRetrait = {
  id: string
  nature: NatureRetrait
  refId: string
  nom: string
  texte: string
  /** ISO : l'instant où « Remove anyway » a été touché. */
  a: string
}

/** Les demandes encore valables (moins d'une heure). */
export function demandesValides(demandes: readonly DemandeRetrait[], maintenantMs: number): DemandeRetrait[] {
  return demandes.filter((d) => {
    const t = new Date(d.a).getTime()
    return Number.isFinite(t) && maintenantMs - t < RETRAIT_VALIDITE_MS && maintenantMs >= t
  })
}

/** Minutes restantes avant qu'une demande ne disparaisse. */
export function minutesRestantes(d: DemandeRetrait, maintenantMs: number): number {
  return Math.max(0, Math.ceil((new Date(d.a).getTime() + RETRAIT_VALIDITE_MS - maintenantMs) / 60_000))
}

export type FaitsGarder = {
  /** Le temps déjà mis dedans, en minutes. */
  fait: number
  /** Les séances vraiment commencées. */
  seances: number
  /** La part faite (tâche seulement), 0-100. */
  pourcent: number | null
  /** Les jours depuis la création. */
  jours: number
}

/** Ce qui a déjà été mis dans l'engagement : ce qu'on perdrait. */
export function faitsPourGarder(a: {
  ids: readonly string[]
  events: readonly SessionEvent[]
  travaille: Readonly<Record<string, number>>
  /** Le travail total demandé (tâche), sinon null. */
  total: number | null
  creeLe: string
  maintenantMs: number
}): FaitsGarder {
  const ids = new Set(a.ids)
  const tenues = a.events.filter((e) => ids.has(e.refId) && e.started)
  // Une ancre ne crédite pas de travail : son temps est celui de ses séances tenues.
  const credite = a.ids.reduce((q, id) => q + (a.travaille[id] ?? 0), 0)
  const fait = credite > 0 ? credite : tenues.reduce((q, e) => q + (e.heldMinutes ?? 0), 0)
  const cree = new Date(a.creeLe).getTime()
  return {
    fait,
    seances: tenues.length,
    pourcent: a.total && a.total > 0 ? Math.min(100, Math.round((fait / a.total) * 100)) : null,
    jours: Number.isFinite(cree) ? Math.max(0, Math.floor((a.maintenantMs - cree) / 86_400_000)) : 0,
  }
}
