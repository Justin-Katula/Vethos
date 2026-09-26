import type { LearningState, SessionConfirmationsState, SessionEvent } from '@shared/schemas'
import { betaMean, kaplanMeier, survieDe, trancheDe, updateBeta, PRIOR_NEUTRE, type Survie } from './bayes'
import { computeBreakMinutes, BREAK_HIDDEN_IF_FREE_MINUTES, HIGH_UTILIZATION_PERCENT } from './rest'
import { addDays } from './dates'

// ═══ PROLONGATION (spec moteur 2026-09-25) ═══════════════════════════════
//
// En pleine séance, le début désagréable est passé : c'est le moment où la
// personne juge le mieux si elle peut continuer. L'offre vient à conditions
// strictes, une seule durée, et le « non » n'est jamais un échec.

/** Les durées essayées, de la plus longue à la plus courte. */
export const DUREES_PROLONGATION = [60, 45, 30, 15] as const
/** Probabilité minimale de tenir la prolongation, lue sur la courbe de survie. */
export const SEUIL_SURVIE_PROLONGATION = 0.8
/** La bannière vient dans les 2 dernières minutes du travail. */
export const FENETRE_BANNIERE_MINUTES = 2
/** Aucune tentative d'app bloquée depuis 15 min. */
export const CALME_MINUTES = 15
/** Marge gardée avant le coucher. */
export const MARGE_AVANT_SOMMEIL = 30
/** Au-delà de 3 h d'affilée, la performance chute : jamais plus long. */
export const TRAVAIL_CONTINU_MAX = 180

/**
 * Probabilité de tenir jusqu'à `t` minutes, lue sur la courbe de Kaplan-Meier.
 * `null` quand on ne sait pas : moins de 5 observations (règle G), ou `t`
 * trop loin au-delà du plus long bloc jamais tenu — on monte par paliers
 * (+10 %, au moins 15 min), jamais d'un bond dans l'inconnu.
 */
export function survieA(obs: Survie[], t: number): number | null {
  if (obs.length < 5) return null
  const plusLong = Math.max(...obs.map((o) => o.minutes))
  if (t > Math.max(plusLong * 1.1, plusLong + 15)) return null
  let s = 1
  for (const pas of kaplanMeier(obs)) {
    if (pas.t > t) break
    s = pas.s
  }
  return s
}

/**
 * Le nombre d'offres par jour. Une au départ ; le bandit (Beta avec oubli sur
 * les réponses) monte à deux quand elles sont presque toujours acceptées, et
 * espace à un jour sur deux quand elles ne le sont presque jamais — une offre
 * à chaque bloc deviendrait du bruit, ou une pression.
 */
export function offresMaxJour(historique: LearningState['extensionOffers'], today: string): number {
  if (historique.length < 5) return 1
  const loi = historique.reduce((p, o) => updateBeta(p, o.accepted), PRIOR_NEUTRE)
  const taux = betaMean(loi)
  if (taux >= 0.6) return 2
  if (taux < 0.2 && historique.some((o) => o.date === addDays(today, -1))) return 0
  return 1
}

export type ProlongationArgs = {
  /** L'événement de la séance en cours (journal). */
  event: SessionEvent
  /** La fenêtre observée de la séance (début réel, travail prévu). */
  session: { blockId: string; startMinute: number; workMinutes: number }
  nowMinute: number
  nowMs: number
  today: string
  /** Tout le journal : la courbe de survie s'y lit. */
  events: SessionEvent[]
  historique: LearningState['extensionOffers']
  /** Une offre a déjà été faite à ce bloc. */
  dejaOfferte: boolean
  /** Le prochain engagement après la séance (bloc, ancre, obligation), ou null. */
  prochainDebut: number | null
  /** Le coucher du jour, ou null s'il n'y en a pas. */
  coucher: number | null
  /** Le travail du jour (fait + prévu), séance comprise. */
  travailDuJour: number
  /** Capacité effective du jour. */
  capaciteDuJour: number
}

/** La fin du travail de la séance en cours. */
const finDuTravail = (s: ProlongationArgs['session']) => s.startMinute + s.workMinutes

/**
 * La durée à proposer, ou null. Toutes les conditions sont obligatoires :
 * séance confirmée et calme, dans ses 2 dernières minutes, pas déjà
 * prolongée ni déjà sollicitée, sous le plafond d'offres du jour ; puis la
 * plus longue durée qui laisse la place (pause comprise) avant la suite et
 * avant le sommeil, garde la journée sous le seuil de fatigue, et qu'on a au
 * moins 80 % de chances de tenir.
 */
export function proposerProlongation(a: ProlongationArgs): number | null {
  const e = a.event
  if (!e.started || e.stop || e.heldMinutes !== null || e.extensionMinutes !== undefined) return null
  if (a.dejaOfferte) return null
  if (e.blockedAttempts > 0 && (e.lastAttemptAt === undefined || a.nowMs - e.lastAttemptAt < CALME_MINUTES * 60_000))
    return null

  const fin = finDuTravail(a.session)
  if (a.nowMinute < fin - FENETRE_BANNIERE_MINUTES || a.nowMinute >= fin) return null
  const dejaAujourdhui = a.historique.filter((o) => o.date === a.today).length
  if (dejaAujourdhui >= offresMaxJour(a.historique, a.today)) return null

  const obs = survieDe(
    a.events.filter((x) => !(x.blockId === e.blockId && x.date === e.date)),
    e.category,
    trancheDe(e.plannedStartMinute),
  )
  const seuilFatigue = (a.capaciteDuJour * HIGH_UTILIZATION_PERCENT) / 100

  for (const d of DUREES_PROLONGATION) {
    const travail = a.session.workMinutes + d
    const nouvelleFin = fin + d
    if (travail > TRAVAIL_CONTINU_MAX) continue
    if (a.coucher !== null && nouvelleFin > a.coucher - MARGE_AVANT_SOMMEIL) continue
    if (a.prochainDebut !== null) {
      const ecart = a.prochainDebut - nouvelleFin
      // La pause d'E.1 s'applique à la prolongation : si la suite vient dans
      // les 30 min, elle doit tenir entre les deux.
      if (ecart < 0 || (ecart < BREAK_HIDDEN_IF_FREE_MINUTES && ecart < computeBreakMinutes(travail))) continue
    }
    if (a.travailDuJour + d > seuilFatigue) continue
    const p = survieA(obs, e.plannedMinutes + d)
    if (p !== null && p >= SEUIL_SURVIE_PROLONGATION) return d
  }
  return null
}

/**
 * La bannière s'est montrée : l'offre compte (plafond du jour, une par bloc),
 * d'abord comme « non acceptée ». Un « Oui » la retourne.
 */
export function marquerOffre(
  learning: LearningState,
  confirmations: SessionConfirmationsState,
  blockId: string,
): { learning: LearningState; confirmations: SessionConfirmationsState } {
  if ((confirmations.extensionOfferedBlockIds ?? []).includes(blockId)) return { learning, confirmations }
  return {
    learning: {
      ...learning,
      extensionOffers: [...(learning.extensionOffers ?? []), { date: confirmations.date, accepted: false }].slice(-200),
    },
    confirmations: {
      ...confirmations,
      extensionOfferedBlockIds: [...(confirmations.extensionOfferedBlockIds ?? []), blockId],
    },
  }
}

/**
 * « Oui » : la séance s'allonge de `minutes` de travail. La fenêtre observée
 * grandit — le crédit de travail, le blocage et la clôture suivent — et la
 * pause n'est ajoutée que si la suite vient dans les 30 min. Le journal garde
 * la prolongation à part : `plannedMinutes` ne bouge pas (anti-cliquet).
 */
export function accepterProlongation(args: {
  learning: LearningState
  confirmations: SessionConfirmationsState
  minutes: number
  prochainDebut: number | null
}): { learning: LearningState; confirmations: SessionConfirmationsState } | null {
  const { confirmations } = args
  const o = confirmations.observedPending
  if (!o || !(o.blockId in confirmations.confirmedAt)) return null
  if ((confirmations.stoppedBlockIds ?? []).includes(o.blockId)) return null
  const journal = args.learning.sessionEvents ?? []
  const i = journal.findIndex((e) => e.blockId === o.blockId && e.date === confirmations.date)
  if (i < 0 || journal[i]!.extensionMinutes !== undefined) return null

  const travail = (o.workMinutes ?? o.endMinute - o.startMinute) + args.minutes
  const finTravail = o.startMinute + travail
  const pause =
    args.prochainDebut !== null && args.prochainDebut - finTravail < BREAK_HIDDEN_IF_FREE_MINUTES
      ? computeBreakMinutes(travail)
      : 0
  const sessionEvents = [...journal]
  sessionEvents[i] = { ...journal[i]!, extensionMinutes: args.minutes }
  const offres = [...(args.learning.extensionOffers ?? [])]
  for (let k = offres.length - 1; k >= 0; k--) {
    if (offres[k]!.date === confirmations.date && !offres[k]!.accepted) {
      offres[k] = { ...offres[k]!, accepted: true }
      break
    }
  }
  return {
    learning: { ...args.learning, sessionEvents, extensionOffers: offres },
    confirmations: {
      ...confirmations,
      observedPending: { ...o, workMinutes: travail, endMinute: Math.min(1440, finTravail + pause) },
    },
  }
}

/** La séance est-elle dans sa prolongation (le travail prévu est fait) ? */
export function dansLaProlongation(event: SessionEvent | undefined, startMinute: number, nowMinute: number): boolean {
  if (!event?.extensionMinutes) return false
  return nowMinute >= startMinute + event.plannedMinutes
}
