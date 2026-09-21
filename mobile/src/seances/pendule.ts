import {
  activeBlockFor,
  applyConfirmation,
  applyLapsedCredit,
  applyWorkCredit,
  closedObservedBlock,
  confirmationsFor,
  pendingConfirmation,
  tasksToAutoComplete,
} from '@shared/planning/clock'
import { activeConfirmedSession } from '@shared/planning/session'
import type { PlacedBlock } from '@shared/planning/types'
import type { LearningState, SessionConfirmationsState } from '@shared/schemas'
import { versTachesMoteur } from '@/plan/moteur'
import type { Tache } from '@/donnees/magasin'

/**
 * La pendule de séance, côté téléphone.
 *
 * Elle ne réimplémente RIEN : `@shared/planning/clock` porte toute la loi
 * D.7/B.5.2 — crédit du travail fait, crédit du retard, compteurs de ratés,
 * complétion automatique — et c'est exactement le même fichier que le bureau
 * exécute. Ce module-ci n'est qu'un tic : il appelle ces fonctions dans le
 * bon ordre et rend le nouvel état.
 *
 * ────────────────────────────────────────────────────────────────────────
 * CE QUE LE TÉLÉPHONE NE PEUT PAS MESURER, ET POURQUOI ON NE L'INVENTE PAS
 *
 * Sur l'ordinateur, la pendule tourne toutes les cinq secondes dans un
 * processus qui ne s'arrête jamais : aucun bloc ne peut se fermer sans être
 * vu. Un téléphone, lui, dort. L'application peut rester fermée six heures,
 * pendant lesquelles trois blocs se seront ouverts et refermés.
 *
 * On ne peut pas les rattraper au réveil : depuis D.9, un créneau passé ne
 * réapparaît plus dans un plan recalculé. Seule `observedPending` — la mémoire
 * explicite du bloc qu'on surveillait — survit à la fermeture.
 *
 * On pourrait décider que tout ce temps compte comme du retard. Ce serait
 * fabriquer une mesure, et D.7 dit l'inverse en toutes lettres : le retard est
 * **mesuré, jamais déduit**. Le téléphone compte donc ce qu'il a réellement
 * vu, et se tait sur le reste. Un retard sous-estimé est un fait incomplet ;
 * un retard supposé serait un reproche inventé.
 * ────────────────────────────────────────────────────────────────────────
 */

export type EtatSeances = {
  apprentissage: LearningState
  confirmations: SessionConfirmationsState
}

export type ResultatTic = EtatSeances & {
  /** Tâches que l'application vient de terminer d'elle-même (B.5.2). */
  terminees: string[]
  /** D.8 : le bloc qui attend son « Je commence ». Au plus un à la fois. */
  enAttente: PlacedBlock | null
  /** Rien n'a changé : inutile d'écrire sur le disque. */
  change: boolean
}

export function minuteDuJour(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

/**
 * D.7 : la séance confirmée EN COURS, lue AVANT le calcul du plan.
 *
 * Réexportée telle quelle depuis `@shared/planning/session`, et surtout PAS
 * réécrite. Ce calcul décide de l'identifiant du bloc épinglé ; deux versions
 * qui divergeraient d'une minute produiraient deux identifiants pour le même
 * créneau, et « Je commence » répondrait « ce bloc ne fait plus partie du
 * plan » alors qu'il est là, sous un autre nom. Défaut réel mesuré sur le
 * bureau le 2026-08-23, exactement comme ça.
 */
export const seanceActive = activeConfirmedSession

/** Remet l'état à zéro quand le jour a tourné. La veille n'est jamais héritée. */
export function pourAujourdHui(
  stocke: SessionConfirmationsState | null,
  aujourdHui: string,
): SessionConfirmationsState {
  return confirmationsFor(stocke, aujourdHui)
}

/**
 * Un tic. Crédite ce qui s'est passé depuis le précédent, et dit ce qui attend.
 *
 * L'ordre suit celui du bureau, et il n'est pas interchangeable : on ferme
 * d'abord ce qui vient de se terminer, on crédite ensuite la séance en cours,
 * puis seulement on décide quelles tâches sont finies.
 */
export function tictac(args: {
  maintenant: Date
  aujourdHui: string
  /** Les blocs du jour, APERÇUS EXCLUS (B.5.1) : une partie verrouillée ne se confirme pas. */
  blocsDuJour: readonly PlacedBlock[]
  taches: readonly Tache[]
  etat: EtatSeances
}): ResultatTic {
  const minute = minuteDuJour(args.maintenant)
  const confirmationsDuJour = pourAujourdHui(args.etat.confirmations, args.aujourdHui)

  let apprentissage = args.etat.apprentissage
  let confirmations = confirmationsDuJour
  let change = confirmationsDuJour !== args.etat.confirmations

  const dejaConfirmes = new Set(Object.keys(confirmations.confirmedAt))

  const enAttente = pendingConfirmation({
    blocks: [...args.blocsDuJour],
    today: confirmations.date,
    nowMinute: minute,
    confirmedBlockIds: dejaConfirmes,
    ...(confirmations.observedPending ? { observedPending: confirmations.observedPending } : {}),
  })

  // Le bloc actif MAINTENANT, confirmé ou non — il entretient `observedPending`.
  // Jamais `enAttente` pour ça : il devient `null` dès la confirmation, ce qui
  // effacerait la mémoire au tic suivant et ferait perdre la stabilisation.
  const actifMaintenant = activeBlockFor({
    blocks: [...args.blocsDuJour],
    today: confirmations.date,
    nowMinute: minute,
    ...(confirmations.observedPending ? { observedPending: confirmations.observedPending } : {}),
  })

  const ferme = closedObservedBlock({
    observedPending: confirmations.observedPending ?? null,
    currentPending: enAttente,
    nowMinute: minute,
  })

  if (ferme !== null) {
    const confirmeA = confirmations.confirmedAt[ferme.blockId]
    if (confirmeA === undefined) {
      // D.7 : jamais confirmé — toute la fenêtre compte comme du retard.
      const r = applyLapsedCredit(apprentissage, confirmations, ferme)
      apprentissage = r.learning
      confirmations = r.confirmations
    } else {
      // B.5.2 : confirmé et fenêtre écoulée — du travail RÉELLEMENT fait,
      // compté depuis la confirmation, jamais depuis l'heure prévue.
      const r = applyWorkCredit(
        apprentissage,
        confirmations,
        ferme,
        minuteDuJour(new Date(confirmeA)),
      )
      apprentissage = r.learning
      confirmations = r.confirmations
    }
    change = true
  }

  // D.7 : la séance confirmée en cours crédite au fil des minutes, sans
  // attendre la fin de sa fenêtre. C'est ce qui fait vraiment démarrer le
  // compteur : le travail restant descend pendant qu'on travaille.
  const active = seanceActive(confirmations, args.aujourdHui, minute)
  if (active !== null) {
    const confirmeA = confirmations.confirmedAt[active.blockId]
    if (confirmeA !== undefined) {
      const r = applyWorkCredit(
        apprentissage,
        confirmations,
        active,
        minuteDuJour(new Date(confirmeA)),
        minute,
      )
      if (r.creditedMinutes > 0) {
        apprentissage = r.learning
        confirmations = r.confirmations
        change = true
      }
    }
  }

  const prochainObserve = active
    ? {
        blockId: active.blockId,
        kind: active.kind,
        refId: active.refId,
        startMinute: active.startMinute,
        endMinute: active.endMinute,
        workMinutes: active.workMinutes,
      }
    : actifMaintenant
      ? {
          blockId: actifMaintenant.id,
          kind: actifMaintenant.kind,
          refId: actifMaintenant.refId,
          startMinute: actifMaintenant.startMinute,
          endMinute: actifMaintenant.endMinute,
          workMinutes: actifMaintenant.workMinutes,
        }
      : null

  if (prochainObserve?.blockId !== confirmations.observedPending?.blockId) {
    confirmations = { ...confirmations, observedPending: prochainObserve }
    change = true
  }

  // B.5.2 : c'est l'APPLICATION qui décide qu'une tâche est terminée, quand le
  // temps planifié a été réellement fait. Plus aucun clic ne la termine.
  const terminees = tasksToAutoComplete({
    tasks: versTachesMoteur(args.taches),
    workedMinutesByRef: apprentissage.workedMinutesByRef,
  })

  if (terminees.length > 0) {
    // G.1 : une observation n'est enregistrée que sur une MESURE réelle. Le
    // temps estimé reste celui d'origine — jamais gonflé par « il m'en faut
    // plus » (B.5.2), sinon le facteur de correction ne verrait jamais que la
    // tâche a coûté plus cher que prévu.
    const finies = new Set(terminees)
    const quand = args.maintenant.toISOString()
    apprentissage = {
      ...apprentissage,
      observations: [
        ...apprentissage.observations,
        ...args.taches
          .filter((t) => finies.has(t.id) && (apprentissage.workedMinutesByRef[t.id] ?? 0) > 0)
          .map((t) => ({
            // Pas de `taskId` : le champ est optionnel, il n'entre dans aucun
            // calcul de facteur, et il impose un format d'identifiant que le
            // téléphone n'utilise pas.
            category: 'général',
            workKind: t.nature === 'nouveau' ? ('novel' as const) : ('routine' as const),
            estimatedMinutes: t.minutesEstimees,
            actualMinutes: apprentissage.workedMinutesByRef[t.id]!,
            completed: true,
            createdAt: quand,
          })),
      ],
    }
    change = true
  }

  return { apprentissage, confirmations, terminees, enAttente, change }
}

/**
 * D.7 : « Je commence ».
 *
 * Une confirmation, même tardive, n'est jamais une « ratée » : le retard
 * mesuré s'ajoute au total du jour, et le compteur de ratés de cette référence
 * retombe à zéro — elle a bien démarré.
 */
export function confirmer(args: {
  maintenant: Date
  bloc: PlacedBlock
  etat: EtatSeances
}): EtatSeances & { retardMinutes: number; refuse?: string } {
  const minute = minuteDuJour(args.maintenant)
  if (args.bloc.id in args.etat.confirmations.confirmedAt) {
    return { ...args.etat, retardMinutes: 0, refuse: 'Déjà confirmé.' }
  }
  const r = applyConfirmation(
    args.etat.apprentissage,
    args.etat.confirmations,
    args.bloc,
    args.maintenant.getTime(),
    minute,
  )
  return {
    apprentissage: r.learning,
    confirmations: r.confirmations,
    retardMinutes: r.delayMinutes,
  }
}
