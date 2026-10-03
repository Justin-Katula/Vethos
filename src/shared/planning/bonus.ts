import type { SessionEvent } from '@shared/schemas'
import { betaMean, GAMMA, updateBeta, type Beta } from './bayes'

// ═══ LE BONUS — un peu en plus, jamais un multiplicateur ═════════════════════
//
// Quand l'utilisateur demande 100 h, il en reçoit 100 : c'est le PLANCHER, la
// seule chose qui compte pour la faisabilité, les déficits et les signaux.
// Le bonus est du temps de travail EN PLUS, donné doucement quand le plan a du
// jeu et que la personne tient ses blocs. Il se calcule en minutes ajoutées
// (par jour restant), jamais en pourcentage de ce qui a été demandé : le
// multiplicateur ×1,4 / ×1,7 gonflait le travail en silence, le bonus ne le
// fait ni en silence ni en proportion.
//
// Il ne vole rien : il n'existe que sous 85 % de densité, ne prend que 80 % du
// jeu, et tant qu'il n'est pas libéré il n'existe pas dans le calendrier — il
// ne peut donc jamais devenir un déficit.
//
// Toutes les valeurs ci-dessous sont des valeurs de DÉPART, non prouvées.

/** Minutes de bonus visées par jour restant jusqu'à l'échéance. */
export const BONUS_MINUTES_PAR_JOUR = { routine: 15, novel: 30 } as const
/** Part du jeu (capacité − charge) que le bonus peut occuper. */
export const BONUS_PART_DU_JEU = 0.8
/** Au-delà de cette densité, le plan est serré : pas de bonus. */
export const BONUS_SEUIL_DENSITE = 0.85
/** Plafond absolu, quelle que soit la longueur de l'échéance. */
export const BONUS_MAX_MINUTES = 600
/** Une libération donne au plus ce nombre de minutes. */
export const BONUS_LIBERATION_MAX = 90
/** Pente : au plus 15 % du plancher travaillé sur 7 jours. */
export const BONUS_PENTE_HEBDO = 0.15
/** Une séance est « tenue » si au moins 85 % de sa durée prévue est travaillée. */
export const TENUE_RATIO = 0.85
/** Départ Beta(3, 1) : moyenne 0,75, sous le seuil — il faut 3 blocs tenus. */
export const TENUE_PRIOR: Beta = { a: 3, b: 1 }
export const TENUE_MOYENNE_MIN = 0.85
export const TENUE_BORNE_BASSE_MIN = 0.7

const cinq = (n: number) => Math.round(n / 5) * 5

/**
 * Le bonus visé pour une tâche, en minutes. Recalculé à chaque plan : plus le
 * plan est serré, plus il rétrécit, jusqu'à zéro.
 */
export function bonusCible(args: {
  workKind: 'routine' | 'novel'
  /** Jours entre aujourd'hui et l'échéance, aujourd'hui compris. */
  joursRestants: number
  /** Capacité effective cumulée moins toute la charge due d'ici l'échéance. */
  jeuMinutes: number
  /** Charge ÷ capacité de l'échéance (C.2). */
  densite: number
}): number {
  if (args.densite >= BONUS_SEUIL_DENSITE) return 0
  if (args.jeuMinutes <= 0 || args.joursRestants <= 0) return 0
  const parJour = BONUS_MINUTES_PAR_JOUR[args.workKind] * args.joursRestants
  return cinq(Math.min(BONUS_MAX_MINUTES, parJour, BONUS_PART_DU_JEU * args.jeuMinutes))
}

/**
 * La loi Beta de « tient ses blocs », relue du journal. Pas d'état de plus à
 * garder : le journal est déjà la source. Les rattrapages (promesses, reprises
 * forcées) n'en font pas partie — ils ne disent rien de ce qu'on tient libre.
 */
export function loiTenue(events: readonly SessionEvent[]): Beta {
  const rangees = events
    .filter((e) => e.kind === 'task' && e.promiseId === undefined && e.forced !== true)
    // Une séance encore ouverte n'est ni tenue ni manquée.
    .filter((e) => !(e.started && e.heldMinutes === null))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return rangees.reduce<Beta>((p, e) => {
    const tenue = e.started && e.heldMinutes !== null && e.heldMinutes >= TENUE_RATIO * e.plannedMinutes
    return updateBeta(p, tenue, GAMMA)
  }, TENUE_PRIOR)
}

/**
 * Les minutes de bonus qu'on peut libérer MAINTENANT (0 si aucune). Libérées,
 * elles deviennent du travail normal de la tâche — un bloc de plus, que le plan
 * place comme n'importe quel autre.
 */
export function bonusALiberer(args: {
  cible: number
  dejaLibere: number
  events: readonly SessionEvent[]
  /** Minutes de plancher réellement travaillées sur les 7 derniers jours. */
  minutesPlancher7j: number
  /** Minutes de bonus déjà libérées sur les 7 derniers jours. */
  libere7j: number
  /** Le plancher est entièrement placé dans le calendrier. */
  plancherPlace: boolean
  /** Un bloc non démarré aujourd'hui. */
  retardAujourdhui: boolean
}): number {
  const reste = args.cible - args.dejaLibere
  if (reste <= 0) return 0
  if (!args.plancherPlace || args.retardAujourdhui) return 0

  const loi = loiTenue(args.events)
  const moyenne = betaMean(loi)
  const sd = Math.sqrt((loi.a * loi.b) / ((loi.a + loi.b) ** 2 * (loi.a + loi.b + 1)))
  const borneBasse = moyenne - 0.84 * sd
  // Il tient ses blocs, et avec certitude.
  if (moyenne < TENUE_MOYENNE_MIN || borneBasse < TENUE_BORNE_BASSE_MIN) return 0

  const pente = BONUS_PENTE_HEBDO * args.minutesPlancher7j - args.libere7j
  return Math.max(0, Math.round(Math.min(reste, pente, BONUS_LIBERATION_MAX)))
}
