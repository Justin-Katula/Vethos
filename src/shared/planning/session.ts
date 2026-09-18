import type { SessionConfirmationsState } from '@shared/schemas'
import type { ActiveSession } from './types'

/**
 * D.7 : la session CONFIRMÉE en cours, dérivée du bookkeeping persisté.
 *
 * Partagée entre le processus main (horloge de planification) et le renderer
 * (vue du jour, vue semaine) À DESSEIN : les deux doivent calculer EXACTEMENT
 * le même plan. Sans ça, le renderer replaçait le bloc en cours à « maintenant »
 * pendant que le main le gardait épinglé — deux plans divergents, donc des
 * identifiants de bloc différents pour le même créneau.
 *
 * Conséquence réelle mesurée le 2026-08-23 : le bouton « Je commence » de
 * l'application envoyait l'id calculé par le renderer, le main recalculait avec
 * SA minute à lui, ne trouvait rien, et répondait « ce bloc ne fait plus partie
 * du plan » — alors que le bloc était bien là, sous un autre nom.
 */
export function activeConfirmedSession(
  confirmations: SessionConfirmationsState | null,
  today: string,
  nowMinute: number,
): ActiveSession | null {
  if (confirmations === null || confirmations.date !== today) return null

  const observed = confirmations.observedPending
  if (observed === null) return null
  // Pas confirmé = pas de session en cours : il n'y a rien à épingler, et
  // l'overlay doit encore pouvoir la proposer.
  if (!(observed.blockId in confirmations.confirmedAt)) return null
  // Fenêtre écoulée : la session est finie, le placement normal reprend.
  if (nowMinute >= observed.endMinute) return null

  return {
    blockId: observed.blockId,
    kind: observed.kind,
    refId: observed.refId,
    startMinute: observed.startMinute,
    endMinute: observed.endMinute,
    workMinutes: observed.workMinutes ?? observed.endMinute - observed.startMinute,
  }
}
