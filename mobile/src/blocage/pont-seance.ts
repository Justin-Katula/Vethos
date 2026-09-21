import { blockSessionFor } from '@shared/planning/clock'
import type { PlacedBlock } from '@shared/planning/types'
import type { Plage } from './contrat'

/**
 * D.8 — le pont entre « Je commence » et le bouclier.
 *
 * **Il n'existe aucune session de blocage autonome.** Vethos ne bloque pas « de
 * 14 h à 16 h parce que c'est l'après-midi » : il bloque pendant un bloc
 * CONFIRMÉ, et seulement pendant celui-là. Une application qui écarte des
 * choses sur un horaire fixe est un minuteur ; celle-ci écarte pendant qu'on
 * travaille, parce qu'on a dit qu'on commençait.
 *
 * La fenêtre vient de `blockSessionFor`, partagée avec le bureau, et sa loi
 * tient en une ligne : **la durée appartient à la tâche, pas à son ancien
 * créneau.** Une tâche de 30 minutes confirmée 12 minutes en retard bloque donc
 * bien 30 minutes — pas 18. Recalculer cette durée ici en aurait fait une
 * seconde définition, et les deux auraient fini par ne plus s'accorder.
 */

/** Minuit, la borne haute d'une journée. Une plage ne déborde jamais dessus. */
const FIN_DE_JOURNEE = 24 * 60

export function minuteDuJour(instantMs: number): number {
  const d = new Date(instantMs)
  return d.getHours() * 60 + d.getMinutes()
}

/**
 * La plage de bouclier d'un bloc qu'on vient de confirmer.
 *
 * `null` quand il n'y a rien à protéger : une fenêtre de durée nulle, ou une
 * confirmation si tardive qu'il ne reste plus de journée devant. Mieux vaut ne
 * rien programmer qu'une plage vide qu'iOS rejetterait en silence — et qui
 * consommerait quand même une des vingt surveillances.
 *
 * Une séance qui déborderait sur le lendemain est coupée à minuit. Le jour
 * suivant a ses propres plages et n'hérite jamais de celles de la veille, tout
 * comme il n'hérite pas de son retard.
 */
export function plageDeSeance(args: {
  bloc: PlacedBlock
  confirmeAMs: number
  selectionId: string
}): Plage | null {
  const seance = blockSessionFor(args.bloc, args.confirmeAMs)

  const debut = minuteDuJour(seance.startedAt)
  const brut = debut + Math.round((seance.endsAt - seance.startedAt) / 60_000)
  const fin = Math.min(FIN_DE_JOURNEE, brut)

  if (fin <= debut) return null

  return {
    blocId: seance.blockId,
    debutMinute: debut,
    finMinute: fin,
    selectionId: args.selectionId,
  }
}

/**
 * La nouvelle plage ajoutée à celles du jour.
 *
 * Remplace celle du même bloc au lieu d'en empiler une seconde : un bloc
 * reconfirmé — après un « tout lever », par exemple — a UNE fenêtre, celle de
 * sa dernière confirmation. Deux plages pour un même bloc feraient croire à
 * deux séances, et en consommeraient deux sur les vingt d'Apple.
 */
export function avecPlage(existantes: readonly Plage[], nouvelle: Plage): Plage[] {
  return [...existantes.filter((p) => p.blocId !== nouvelle.blocId), nouvelle]
}

/**
 * Ce qui reste des plages d'hier : rien.
 *
 * Les minutes d'une plage comptent depuis minuit LOCAL. Gardées d'un jour à
 * l'autre, celles d'hier se rejoueraient aujourd'hui à la même heure —
 * exactement le minuteur autonome que D.8 interdit.
 */
export function plagesDuJour(
  stockees: readonly Plage[],
  dateStockee: string,
  aujourdHui: string,
): Plage[] {
  return dateStockee === aujourdHui ? [...stockees] : []
}
