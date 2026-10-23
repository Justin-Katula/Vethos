/**
 * Retirer un engagement ne se fait pas d'un geste. Comme un Later : on
 * s'explique d'abord ; puis l'app montre ce qui a déjà été mis dedans, pour
 * donner envie de le garder. Si l'on insiste, l'engagement a droit à un
 * DERNIER COUP : sa prochaine séance, puis il s'éteint tout seul. Jamais
 * pendant une séance.
 *
 * Tout ce qui est dit pour retirer entre au CARNET — gardé pour l'app, jamais
 * montré. L'IA ne le lit pas à chaque fois : seulement quand le FLAIR se lève
 * — une série de retraits, ou une raison déjà donnée. Alors elle pose ses
 * questions, et peut refuser.
 *
 * Retiré dans l'heure qui suit sa création : c'était une ERREUR. Il part tout
 * de suite, sans question ni dernier coup.
 */
import type { SessionEvent } from '@shared/schemas'

export type NatureRetrait = 'TASK' | 'GOAL' | 'ANCHOR'

/** Un engagement qui vit son dernier coup. */
export type DernierCoup = {
  refId: string
  nature: NatureRetrait
  nom: string
  /** L'engagement et ses parties. */
  ids: string[]
  /** ISO : l'instant où « Remove anyway » a été accepté. */
  a: string
  /** ISO : la fin de sa dernière séance ; il s'éteint à cet instant. */
  jusqua: string
  /** La dernière séance, si le plan en a une : date et minute de début. */
  seance: { date: string; debut: number } | null
}

/** Une entrée du carnet : une demande de retrait, et ce qu'elle est devenue. */
export type EntreeCarnet = {
  id: string
  refId: string
  nature: NatureRetrait
  nom: string
  texte: string
  reponses: string[]
  /** ISO. */
  a: string
  joursDepuisCreation: number
  minutesFaites: number
  seances: number
  /** garde : il a choisi de garder ; dernier-coup : accepté ; refuse : le juge a dit non. */
  issue: 'garde' | 'dernier-coup' | 'refuse'
  /** Le flair s'est levé (le juge a lu le carnet). */
  flair: boolean
}

export const CARNET_MAX = 60
/** Sans séance au plan, le dernier coup dure un jour. */
export const DERNIER_COUP_SANS_SEANCE_MS = 24 * 60 * 60_000
export const FLAIR_SERIE_JOURS = 14
export const FLAIR_SERIE_N = 2
/** Retiré moins d'une heure après sa création : une erreur. */
export const ERREUR_MS = 60 * 60_000
export const FLAIR_DEJA_DIT_JOURS = 30

export type Flair = 'serie' | 'deja-dit'

/** Créé il y a moins d'une heure : le retirer, c'est corriger une erreur. */
export const estUneErreur = (creeLe: string, maintenantMs: number) => {
  const t = new Date(creeLe).getTime()
  return Number.isFinite(t) && maintenantMs - t >= 0 && maintenantMs - t < ERREUR_MS
}

const mots = (t: string) => new Set(t.toLowerCase().normalize('NFD').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((m) => m.length >= 4))

/** Deux raisons qui se ressemblent : la moitié de leurs mots en commun, au moins. */
export function memeRaison(a: string, b: string): boolean {
  const x = mots(a)
  const y = mots(b)
  if (x.size < 2 || y.size < 2) return false
  let commun = 0
  for (const m of x) if (y.has(m)) commun++
  return commun / Math.min(x.size, y.size) >= 0.5
}

/**
 * Faut-il que le juge lise le carnet ? Rien la plupart du temps : seulement
 * une série (déjà deux demandes en 14 jours) ou une raison déjà donnée. Une
 * chose jamais commencée n'est pas un signe : c'était peut-être une erreur.
 */
export function flair(a: { carnet: readonly EntreeCarnet[]; texte: string; maintenantMs: number }): Flair | null {
  const age = (e: EntreeCarnet) => (a.maintenantMs - new Date(e.a).getTime()) / 86_400_000
  if (a.carnet.filter((e) => age(e) >= 0 && age(e) < FLAIR_SERIE_JOURS).length >= FLAIR_SERIE_N) return 'serie'
  if (a.carnet.some((e) => age(e) >= 0 && age(e) < FLAIR_DEJA_DIT_JOURS && memeRaison(e.texte, a.texte))) return 'deja-dit'
  return null
}

/** Ajoute au carnet (le plus récent d'abord), borné. */
export function noterAuCarnet(carnet: readonly EntreeCarnet[], e: EntreeCarnet): EntreeCarnet[] {
  return [e, ...carnet.filter((x) => x.id !== e.id)].slice(0, CARNET_MAX)
}

/** Les jours d'une date ISO locale (AAAA-MM-JJ) + une minute → l'instant. */
const instant = (date: string, minute: number) => {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y!, (m ?? 1) - 1, d ?? 1, 0, minute).getTime()
}

/**
 * Le dernier coup : la prochaine séance de l'engagement au plan (pas encore
 * finie). Sans séance au plan, un jour.
 */
export function dernierCoup(a: {
  refId: string
  nature: NatureRetrait
  nom: string
  ids: readonly string[]
  jours: readonly { date: string; segments: readonly { ref?: string; debut: number; fin: number; finEmpreinte?: number }[] }[]
  maintenantMs: number
}): DernierCoup {
  const ids = new Set(a.ids)
  const prochaine = a.jours
    .flatMap((j) => j.segments.filter((s) => s.ref && ids.has(s.ref)).map((s) => ({ date: j.date, debut: s.debut, finMs: instant(j.date, s.finEmpreinte ?? s.fin) })))
    .filter((s) => s.finMs > a.maintenantMs)
    .sort((x, y) => x.finMs - y.finMs)[0]
  return {
    refId: a.refId,
    nature: a.nature,
    nom: a.nom,
    ids: [...a.ids],
    a: new Date(a.maintenantMs).toISOString(),
    jusqua: new Date(prochaine ? prochaine.finMs : a.maintenantMs + DERNIER_COUP_SANS_SEANCE_MS).toISOString(),
    seance: prochaine ? { date: prochaine.date, debut: prochaine.debut } : null,
  }
}

/** Ceux dont le dernier coup est passé — sauf si leur séance tourne encore. */
export function aEteindre(coups: readonly DernierCoup[], maintenantMs: number, refEnCours: string | null): DernierCoup[] {
  return coups.filter((c) => new Date(c.jusqua).getTime() <= maintenantMs && !(refEnCours && c.ids.includes(refEnCours)))
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
