import { mergeIntervals, type Interval } from '@shared/planning/capacity'
import { plannedTotalFor } from '@shared/planning/engine'
import { estJourTest, phaseHabitude } from '@shared/planning/habitudes'
import type { PlacedBlock, TaskItem } from '@shared/planning/types'
import type { LearningState, ObservedPendingBlock, SessionConfirmationsState, SessionEvent, StopReason } from '@shared/schemas'

// D.7 : réexporté depuis `@shared/planning/session` — le renderer en a besoin
// aussi, et les deux DOIVENT dériver la session en cours de la même façon.
export { activeConfirmedSession } from '@shared/planning/session'

/**
 * Ce dont `applyLapsedCredit` a vraiment besoin d'un bloc — jamais son id,
 * son libellé, sa couleur ou sa fenêtre cognitive. Un `PlacedBlock` complet
 * satisfait ce type structurellement (aucun appelant existant à changer) ;
 * `ObservedPendingBlock` (la mémoire persistée, `schemas.ts`) aussi, malgré
 * son `blockId` au lieu d'un `id` — c'est tout l'intérêt de ne PAS exiger
 * `id` ici.
 */
type CreditableBlock = Pick<PlacedBlock, 'kind' | 'refId' | 'startMinute' | 'endMinute'>

/**
 * B.5.2 : comme `CreditableBlock`, plus la part de TRAVAIL du bloc (pause
 * exclue, E.1). Optionnelle pour rester satisfait par une mémoire
 * `observedPending` écrite avant l'ajout du champ — le crédit retombe alors
 * sur la fenêtre pleine.
 */
type CreditableWorkBlock = CreditableBlock & { workMinutes?: number }

/**
 * Pont D.7/D.8 — QUAND l'overlay « Je commence » doit s'afficher, et QUAND un
 * bloc ignoré doit être crédité en retard. Décision pure : tout ce dont elle a
 * besoin entre en paramètre, rien n'est lu ici.
 *
 * Même philosophie que `blocking/clock.ts` : l'horloge de planification pose
 * une seule question à chaque tic — *selon le plan du jour, un bloc devrait-il
 * être en train de se confirmer maintenant ?* — et un module séparé
 * (`plan-runner.ts`) agit sur la réponse. Ce fichier ne touche à aucune
 * fenêtre, à aucun stockage : il décide.
 */

/**
 * Un id de bloc encode son `slot.startMinute` (`engine.ts`), stable pour un
 * bloc FUTUR — mais pas pour le bloc actif : `notBeforeMinute` (`capacity.ts`,
 * D.9) cale le début du premier créneau disponible d'aujourd'hui sur
 * `nowMinute`, donc un recalcul complet (ÉCHEC 3, refait à chaque tic) fait
 * glisser le bloc actif d'une minute à l'autre — même tâche/objectif, id
 * différent à chaque tic. Bug réel du 2026-08-23 : une confirmation faite à
 * T ne matchait plus le même bloc recalculé à T+1 minute — l'overlay se
 * rouvrait alors qu'il venait tout juste d'être confirmé, et la mesure de
 * retard (D.7) ne pouvait jamais s'accrocher à rien de stable.
 *
 * Ancre l'identité du bloc actif sur sa PREMIÈRE observation
 * (`observedPending`, déjà la mémoire persistée qui joue ce rôle pour
 * `closedObservedBlock` juste en dessous) : tant que c'est la même
 * référence/nature et qu'on n'a pas dépassé la fin de sa fenêtre observée,
 * c'est « le même » bloc, quel que soit l'id ou l'horaire que le recalcul
 * frais lui donnerait maintenant. Une fois `observed.endMinute` dépassé,
 * l'observation se relâche d'elle-même : `closedObservedBlock` peut alors le
 * créditer comme fermé, et une nouvelle observation repart de zéro.
 */
function stabilized(active: PlacedBlock, observedPending: ObservedPendingBlock | null, nowMinute: number): PlacedBlock {
  if (
    observedPending !== null &&
    observedPending.refId === active.refId &&
    observedPending.kind === active.kind &&
    nowMinute < observedPending.endMinute
  ) {
    return {
      ...active,
      id: observedPending.blockId,
      startMinute: observedPending.startMinute,
      endMinute: observedPending.endMinute,
    }
  }
  return active
}

/**
 * Le bloc dont la fenêtre couvre `nowMinute`, qu'il soit déjà confirmé ou
 * non. Au plus un bloc peut être actif à un instant donné : le moteur ne pose
 * jamais deux blocs qui se chevauchent le même jour (D.1 — les ancres se
 * placent en premier par immobilité, tâches et objectifs remplissent ensuite
 * ce qu'il reste).
 *
 * `observedPending` (optionnel) stabilise l'id/la fenêtre renvoyés quand le
 * bloc actif est la continuation de ce qui était déjà observé — voir
 * `stabilized` ci-dessus. Sans lui, le résultat reste le scan frais brut
 * (comportement historique, toujours correct pour un bloc qui vient
 * d'apparaître).
 *
 * Séparée de `pendingConfirmation` ci-dessous : l'appelant qui entretient la
 * mémoire d'observation (`plan-runner.ts`) a besoin de la savoir active MÊME
 * une fois confirmée — sans quoi la mémoire elle-même disparaît pile au
 * moment où « Je commence » est pressé, et le prochain recalcul (qui, lui,
 * ignore tout du passé) redonne un id différent au même bloc. Bug réel du
 * 2026-08-23 (deuxième occurrence) : `pendingConfirmation` seule renvoie
 * `null` dès la confirmation (c'est voulu, l'overlay doit disparaître), mais
 * un appelant qui s'en servait AUSSI pour décider quoi mémoriser effaçait
 * `observedPending` du même coup — un seul tic après la confirmation
 * suffisait à perdre la stabilisation.
 */
export function activeBlockFor(args: {
  blocks: PlacedBlock[]
  today: string
  nowMinute: number
  observedPending?: ObservedPendingBlock | null
  /** Les blocs arrêtés aujourd'hui : jamais « actifs » à nouveau. */
  stoppedBlockIds?: readonly string[]
}): PlacedBlock | null {
  const active = args.blocks.find(
    (b) =>
      b.date === args.today &&
      b.startMinute <= args.nowMinute &&
      args.nowMinute < b.endMinute &&
      !(args.stoppedBlockIds ?? []).includes(b.id),
  )
  if (!active) return null
  return stabilized(active, args.observedPending ?? null, args.nowMinute)
}

/**
 * Comme `activeBlockFor`, mais `null` si ce bloc est déjà confirmé — c'est ce
 * que l'overlay doit afficher (rien à confirmer de plus), jamais ce que la
 * mémoire d'observation doit retenir (voir le commentaire ci-dessus).
 */
export function pendingConfirmation(args: {
  blocks: PlacedBlock[]
  today: string
  nowMinute: number
  confirmedBlockIds: ReadonlySet<string>
  observedPending?: ObservedPendingBlock | null
  stoppedBlockIds?: readonly string[]
}): PlacedBlock | null {
  const resolved = activeBlockFor(args)
  if (!resolved || args.confirmedBlockIds.has(resolved.id)) return null
  if ((args.stoppedBlockIds ?? []).includes(resolved.id)) return null
  return resolved
}

/**
 * Minutes de `[block.startMinute, block.endMinute)` qui ne recouvrent AUCUN
 * intervalle de `covered` — c'est-à-dire la part de ce bloc pas encore
 * créditée en retard aujourd'hui. `covered` doit être fusionné et trié
 * (`mergeIntervals`) : c'est toujours le cas de `lapsedCreditedRanges`, jamais
 * écrit autrement que par `applyLapsedCredit` ci-dessous.
 *
 * Pourquoi un recouvrement d'intervalle, jamais une simple égalité de minute
 * de départ ou de blockId : le moteur recalcule le plan à chaque tic (ÉCHEC
 * 3), et rien ne garantit qu'un même créneau reste occupé par le même bloc,
 * ni même par un bloc qui démarre exactement à la même minute, d'un tic à
 * l'autre. Bug réel observé le 2026-08-22 : deux tics à 5 secondes d'écart ont
 * produit deux placements différents du début de journée qui se chevauchaient
 * sans partager une seule minute de départ identique — 283 des 881 minutes
 * créditées ce jour-là étaient un pur doublon. Seul un test de recouvrement
 * d'intervalle attrape ce cas.
 */
export function uncoveredMinutes(
  block: Pick<PlacedBlock, 'startMinute' | 'endMinute'>,
  covered: Interval[],
): number {
  let cursor = block.startMinute
  let total = 0
  for (const c of covered) {
    if (c.end <= cursor || c.start >= block.endMinute) continue
    if (c.start > cursor) total += Math.min(c.start, block.endMinute) - cursor
    cursor = Math.max(cursor, c.end)
    if (cursor >= block.endMinute) break
  }
  if (cursor < block.endMinute) total += block.endMinute - cursor
  return total
}

/**
 * Le bloc qu'on SURVEILLAIT au tic précédent (`observedPending`, mémoire
 * persistée), s'il vient de se fermer sans confirmation — `non_démarrée
 * (bloc)` au sens de D.7.
 *
 * Pourquoi une mémoire explicite plutôt qu'un balayage frais du plan à
 * chaque tic : le plan se recalcule entièrement à chaque tic (ÉCHEC 3), et
 * depuis D.9 (`notBeforeMinute`), rien avant "maintenant" n'y est jamais
 * replacé — un créneau qui vient de fermer ne réapparaît alors plus JAMAIS
 * dans aucun recalcul suivant. Un balayage frais ne peut donc plus jamais le
 * retrouver pour le créditer. Bug réel du 2026-08-22 : l'overlay ne s'est
 * déclenché qu'une seule fois de toute la journée — une fois le premier
 * créneau du matin fermé dans SA propre vue, l'horloge n'avait plus jamais
 * rien à observer, alors même que plusieurs blocs ont fermé sans
 * confirmation dans les heures qui ont suivi.
 *
 * `currentPending` = ce que le tic ACTUEL trouve actif maintenant, via
 * `pendingConfirmation` sur le plan frais (qui, lui, reste juste pour
 * détecter ce qui commence).
 *
 * B.5.2 : renvoie désormais le bloc fermé qu'il ait été confirmé OU NON —
 * l'appelant tranche. Une version précédente s'arrêtait net sur un bloc
 * confirmé, si bien que le temps réellement travaillé disparaissait sans
 * jamais être compté nulle part : c'est exactement l'information dont dépend
 * la complétion automatique.
 */
export function closedObservedBlock(args: {
  observedPending: ObservedPendingBlock | null
  currentPending: PlacedBlock | null
  nowMinute: number
}): ObservedPendingBlock | null {
  const observed = args.observedPending
  if (observed === null) return null
  // Toujours le même bloc : sa fenêtre n'a pas fini de couvrir "maintenant".
  if (args.currentPending?.id === observed.blockId) return null
  // Remplacé par un autre AVANT que sa propre fenêtre ait eu le temps de se
  // fermer (ex. les données ont changé et le plan a été reconstruit) : rien
  // à créditer pour l'instant, la fenêtre n'est pas prouvée fermée.
  if (observed.endMinute > args.nowMinute) return null
  return observed
}

/**
 * D.7 : retard(bloc) = T_confirmation − T0, sans aucune fenêtre de grâce — le
 * compteur démarre à T0 pile. `confirmationMinute` ne peut normalement jamais
 * être antérieur à `block.startMinute` (l'overlay n'apparaît qu'une fois la
 * fenêtre ouverte) ; le plancher à 0 est une garde, pas un cas attendu.
 */
export function computeBlockDelayMinutes(block: PlacedBlock, confirmationMinute: number): number {
  return Math.max(0, confirmationMinute - block.startMinute)
}

/**
 * D.8 : traduit un bloc confirmé en session de blocage réelle, à faire
 * appliquer par le mécanisme existant (`blocking/schedule.ts`). Démarre à
 * l'instant de la confirmation, pas à T0 — bloquer des applications avant que
 * l'utilisateur n'ait confirmé quoi que ce soit n'aurait aucun sens : il n'est
 * pas encore « dans » la session.
 */
export function blockSessionFor(
  block: PlacedBlock,
  confirmedAtMs: number,
): { blockId: string; startedAt: number; endsAt: number; appIds: string[]; blockedSites: string[] } {
  const durationMinutes = Math.max(0, block.endMinute - block.startMinute)
  return {
    blockId: block.id,
    startedAt: confirmedAtMs,
    // La durée appartient à la tâche, pas à son ancien créneau. Une tâche de
    // 30 minutes confirmée 12 minutes en retard bloque donc bien 30 minutes.
    endsAt: confirmedAtMs + durationMinutes * 60_000,
    appIds: block.appsToBlock ?? [],
    blockedSites: [],
  }
}

const EMPTY_CONFIRMATIONS_FOR = (date: string): SessionConfirmationsState => ({
  date,
  confirmedAt: {},
  lapsedCreditedRanges: [],
  workCreditedRanges: [],
  streakBumpedRefs: [],
  stoppedBlockIds: [],
  observedPending: null,
})

/**
 * D.7 : le bookkeeping de confirmation ne vit que pour AUJOURD'HUI — un
 * changement de date (minuit passé, ou processus resté éteint plus d'un jour)
 * repart d'un état vide, jamais d'un jour à cheval sur l'autre. Cohérent avec
 * la règle déjà posée pour le retard lui-même : il ne franchit jamais le jour
 * même.
 */
export function confirmationsFor(
  stored: SessionConfirmationsState | null,
  today: string,
): SessionConfirmationsState {
  if (stored !== null && stored.date === today) return stored
  return EMPTY_CONFIRMATIONS_FOR(today)
}

/**
 * D.7 : un bloc dont la fenêtre s'est fermée sans confirmation crédite sur
 * `dailyDelayMinutes` la part de sa fenêtre pas encore comptée ailleurs (voir
 * `uncoveredMinutes`), et fait avancer le compteur de ratés propre à sa nature
 * — `anchorMissCounts` pour une ancre (signal 2, C.3.4), `consecutiveDelays`
 * pour une tâche ou un objectif (signal 4). Jamais les deux compteurs à la
 * fois : chaque bloc n'appartient qu'à une seule échelle.
 *
 * Le compteur de ratés avance au plus UNE FOIS PAR JOUR par référence, jamais
 * une fois par bloc manqué : D.8 est explicite, une ancre (et par le même
 * principe une tâche ou un objectif) est ratée « pour un jour donné », pas
 * par instance. Un objectif qui reçoit 2 blocs profonds le même jour (D.5) et
 * rate les deux ne fait avancer son compteur que de +1.
 */
export function applyLapsedCredit(
  learning: LearningState,
  confirmations: SessionConfirmationsState,
  block: CreditableBlock & { blockId?: string; workMinutes?: number; category?: string; plannedStartMinute?: number },
  nowMs: number = Date.now(),
  context: JournalContext = {},
): { learning: LearningState; confirmations: SessionConfirmationsState } {
  const delay = uncoveredMinutes(block, confirmations.lapsedCreditedRanges)
  const today = confirmations.date
  // Ne compte comme « ratée » que si CE bloc apporte vraiment des minutes
  // neuves. Un bloc entièrement redondant (déjà couvert par un autre crédité
  // plus tôt dans le même tic) ne prouve rien sur cette référence précise —
  // la faire quand même avancer aurait recréé, sous une autre forme, le même
  // double comptage que ce fichier corrige : bug réel trouvé en rejouant la
  // séquence exacte du 2026-08-17 (une tâche jamais vraiment en retard ce
  // jour-là aurait été comptée « ratée » simplement parce qu'un recalcul
  // ultérieur, entièrement superflu, mentionnait son id).
  const bumpsStreak = delay > 0 && !confirmations.streakBumpedRefs.includes(block.refId)

  // Journal : un bloc que l'application a VU s'ouvrir et se refermer sans
  // démarrage. C'est un fait — « jamais démarré » —, pas un jugement.
  const journaled =
    block.blockId === undefined
      ? learning
      : recordEvent(learning, {
          blockId: block.blockId,
          date: today,
          kind: block.kind,
          refId: block.refId,
          category: block.category ?? defaultCategory(block.kind, block.refId),
          plannedStartMinute: Math.min(1440, block.plannedStartMinute ?? block.startMinute),
          plannedMinutes: Math.max(1, block.workMinutes ?? block.endMinute - block.startMinute),
          started: false,
          delayMinutes: null,
          spontaneous: false,
          heldMinutes: null,
          stoppedEarly: false,
          blockedAttempts: 0,
          // Le contexte d'un raté compte autant que celui d'un départ :
          // sans lui, le diagnostic confondrait fatigue et évitement.
          load48hMinutes: context.load48hMinutes ?? 0,
          ...(context.hoursAwake !== undefined ? { hoursAwake: context.hoursAwake } : {}),
          createdAt: new Date(nowMs).toISOString(),
        })

  const nextLearning: LearningState = {
    ...journaled,
    dailyDelayMinutes: {
      ...learning.dailyDelayMinutes,
      [today]: Math.min(1440, (learning.dailyDelayMinutes[today] ?? 0) + delay),
    },
    ...(!bumpsStreak
      ? {}
      : block.kind === 'ancre'
        ? {
            anchorMissCounts: {
              ...learning.anchorMissCounts,
              [block.refId]: (learning.anchorMissCounts[block.refId] ?? 0) + 1,
            },
          }
        : {
            consecutiveDelays: {
              ...learning.consecutiveDelays,
              [block.refId]: (learning.consecutiveDelays[block.refId] ?? 0) + 1,
            },
          }),
  }

  const nextConfirmations: SessionConfirmationsState = {
    ...confirmations,
    lapsedCreditedRanges: mergeIntervals([
      ...confirmations.lapsedCreditedRanges,
      { start: block.startMinute, end: block.endMinute },
    ]),
    streakBumpedRefs: bumpsStreak
      ? [...confirmations.streakBumpedRefs, block.refId]
      : confirmations.streakBumpedRefs,
  }

  return { learning: nextLearning, confirmations: nextConfirmations }
}

/**
 * B.5.2 : un bloc CONFIRMÉ dont la fenêtre s'est fermée crédite du travail
 * réellement fait sur `workedMinutesByRef`. Jumeau exact d'`applyLapsedCredit`
 * ci-dessus — même protection anti-double-comptage par recouvrement
 * d'intervalle, pour la même raison (le plan se recalcule à chaque tic et deux
 * placements successifs peuvent couvrir les mêmes minutes sans partager le
 * moindre id).
 *
 * Seules les TÂCHES sont créditées : ce sont les seules qui se terminent. Un
 * objectif n'a pas de fin (son compteur est hebdomadaire, D.4) et une ancre
 * non plus (elle est gouvernée par la stabilité, D.3).
 *
 * Le crédit part de la CONFIRMATION, jamais de l'heure prévue du bloc :
 * confirmer avec 30 minutes de retard, c'est 30 minutes de travail en moins,
 * pas un bloc plein offert. Et il s'arrête à la fin de la part de TRAVAIL du
 * bloc, pause exclue (E.1) — une pause n'est pas du travail fait.
 *
 * `untilMinute` plafonne le crédit à « maintenant » : appelé à chaque tic, il
 * fait AVANCER le compteur pendant la session au lieu de tout créditer d'un
 * coup à la fermeture. Sans lui, le temps restant ne bougeait pas d'une seule
 * minute pendant qu'on travaillait — c'est le « le temps de travail ne se
 * lance pas » rapporté le 2026-08-23. Non fourni, il crédite toute la fenêtre
 * (le cas de la fermeture).
 */
export function applyWorkCredit(
  learning: LearningState,
  confirmations: SessionConfirmationsState,
  block: CreditableWorkBlock,
  confirmationMinute: number,
  untilMinute: number = Number.POSITIVE_INFINITY,
): { learning: LearningState; confirmations: SessionConfirmationsState; creditedMinutes: number } {
  const workEnd = Math.min(
    block.startMinute + (block.workMinutes ?? block.endMinute - block.startMinute),
    untilMinute,
  )
  const from = Math.max(block.startMinute, confirmationMinute)
  if (block.kind !== 'task' || from >= workEnd) {
    return { learning, confirmations, creditedMinutes: 0 }
  }

  const credited = uncoveredMinutes(
    { startMinute: from, endMinute: workEnd },
    confirmations.workCreditedRanges,
  )

  return {
    learning: {
      ...learning,
      workedMinutesByRef: {
        ...learning.workedMinutesByRef,
        [block.refId]: (learning.workedMinutesByRef[block.refId] ?? 0) + credited,
      },
    },
    confirmations: {
      ...confirmations,
      workCreditedRanges: mergeIntervals([
        ...confirmations.workCreditedRanges,
        { start: from, end: workEnd },
      ]),
    },
    creditedMinutes: credited,
  }
}

/**
 * B.5.2 : les tâches qui viennent d'atteindre leur temps planifié — c'est
 * l'application qui décide qu'une tâche est terminée, jamais l'utilisateur.
 *
 * Une tâche de REGROUPEMENT (issue d'un découpage B.5) ne porte aucun travail
 * propre : elle se termine quand toutes ses parties sont terminées, jamais sur
 * un compteur de minutes qui ne bougera jamais pour elle.
 */
export function tasksToAutoComplete(args: {
  tasks: TaskItem[]
  workedMinutesByRef: Record<string, number>
}): string[] {
  const active = args.tasks.filter((t) => t.status === 'active')
  const groupIds = new Set(
    active.map((t) => t.parentTaskId).filter((id): id is string => id !== null),
  )

  const done = new Set<string>()
  for (const task of active) {
    if (groupIds.has(task.id)) continue
    // EXACTEMENT la cible que le placement vise (`remainingWorkFor`). Une
    // seconde définition — par exemple une durée recalculée avec le facteur du
    // jour — ferait viser au moteur une ligne d'arrivée que la complétion
    // n'atteindrait jamais, et la tâche ne se terminerait plus jamais seule.
    if ((args.workedMinutesByRef[task.id] ?? 0) >= plannedTotalFor(task)) done.add(task.id)
  }

  for (const group of active) {
    if (!groupIds.has(group.id)) continue
    const parts = active.filter((t) => t.parentTaskId === group.id)
    if (parts.every((p) => done.has(p.id))) done.add(group.id)
  }

  return [...done]
}

/**
 * D.7 : une confirmation — même tardive — n'est jamais une « ratée ». Le
 * retard mesuré s'ajoute au total du jour, et le compteur de ratés de cette
 * référence retombe à zéro : elle a bien démarré, ce n'est plus un manquement.
 */
export function applyConfirmation(
  learning: LearningState,
  confirmations: SessionConfirmationsState,
  block: PlacedBlock,
  confirmedAtMs: number,
  confirmationMinute: number,
  context: JournalContext = {},
): { learning: LearningState; confirmations: SessionConfirmationsState; delayMinutes: number } {
  const delay = computeBlockDelayMinutes(block, confirmationMinute)
  const today = confirmations.date

  const nextLearning: LearningState = {
    ...recordEvent(learning, {
      blockId: block.id,
      date: today,
      kind: block.kind,
      refId: block.refId,
      category: block.category ?? defaultCategory(block.kind, block.refId),
      plannedStartMinute: block.startMinute,
      plannedMinutes: Math.max(1, block.workMinutes),
      started: true,
      delayMinutes: delay,
      spontaneous: context.spontaneous ?? false,
      heldMinutes: null,
      stoppedEarly: false,
      blockedAttempts: 0,
      load48hMinutes: context.load48hMinutes ?? 0,
      ...(context.hoursAwake !== undefined ? { hoursAwake: context.hoursAwake } : {}),
      createdAt: new Date(confirmedAtMs).toISOString(),
    }),
    dailyDelayMinutes: {
      ...learning.dailyDelayMinutes,
      [today]: Math.min(1440, (learning.dailyDelayMinutes[today] ?? 0) + delay),
    },
    ...(block.kind === 'ancre'
      ? { anchorMissCounts: { ...learning.anchorMissCounts, [block.refId]: 0 } }
      : { consecutiveDelays: { ...learning.consecutiveDelays, [block.refId]: 0 } }),
  }

  const nextConfirmations: SessionConfirmationsState = {
    ...confirmations,
    confirmedAt: { ...confirmations.confirmedAt, [block.id]: confirmedAtMs },
    // À partir de « Je commence », le bloc se déplace réellement à maintenant
    // et conserve sa durée complète. Le plan, le compteur de travail et le
    // blocage partagent ainsi exactement la même fenêtre.
    observedPending: {
      blockId: block.id,
      kind: block.kind,
      refId: block.refId,
      startMinute: confirmationMinute,
      endMinute: Math.min(1440, confirmationMinute + (block.endMinute - block.startMinute)),
      workMinutes: block.workMinutes,
      ...(block.category ? { category: block.category } : {}),
      plannedStartMinute: Math.min(1439, block.startMinute),
    },
    // Confirmée, cette référence n'est plus « ratée » aujourd'hui non plus.
    streakBumpedRefs: confirmations.streakBumpedRefs.filter((r) => r !== block.refId),
  }

  return { learning: nextLearning, confirmations: nextConfirmations, delayMinutes: delay }
}

// ─── Le journal des séances (spec moteur 2026-09-25) ─────────────────────

/** Ce que l'application sait du moment, au démarrage d'une séance. */
export type JournalContext = {
  /** Démarré sans que l'overlay ne l'ait demandé (raccourci, ou avant qu'il ne vienne). */
  spontaneous?: boolean
  load48hMinutes?: number
  hoursAwake?: number
}

const JOURNAL_MAX = 3000

export const defaultCategory = (kind: SessionEvent['kind'], refId: string) =>
  kind === 'objective' ? `objectif:${refId}` : kind === 'ancre' ? `ancre:${refId}` : 'général'

/**
 * Ajoute un événement, ou ne fait rien s'il y en a déjà un pour ce bloc ce
 * jour-là : le premier fait observé l'emporte. Le journal garde les 3000
 * derniers — l'oubli progressif rend les plus vieux sans poids de toute façon.
 */
export function recordEvent(learning: LearningState, event: SessionEvent): LearningState {
  const journal = learning.sessionEvents ?? []
  if (journal.some((e) => e.blockId === event.blockId && e.date === event.date)) return learning
  return { ...learning, sessionEvents: [...journal, event].slice(-JOURNAL_MAX) }
}

function updateEvent(
  learning: LearningState,
  date: string,
  blockId: string,
  f: (e: SessionEvent) => SessionEvent,
): LearningState {
  const journal = learning.sessionEvents ?? []
  const i = journal.findIndex((e) => e.blockId === blockId && e.date === date)
  if (i < 0) return learning
  const next = [...journal]
  next[i] = f(journal[i]!)
  return { ...learning, sessionEvents: next }
}

/**
 * La fenêtre d'une séance confirmée s'est refermée sans arrêt : elle a été
 * tenue jusqu'au bout. Rien ne change si l'événement est déjà clos (un arrêt
 * a déjà fixé le temps tenu).
 */
export function closeSessionEvent(
  learning: LearningState,
  date: string,
  blockId: string,
  heldMinutes: number,
): LearningState {
  return updateEvent(learning, date, blockId, (e) =>
    e.heldMinutes !== null ? e : { ...e, heldMinutes: Math.max(0, Math.min(1440, Math.round(heldMinutes))) },
  )
}

/** Une tentative d'ouvrir une app bloquée pendant la séance en cours. */
export function recordBlockedAttempt(
  learning: LearningState,
  confirmations: SessionConfirmationsState,
): LearningState {
  const o = confirmations.observedPending
  if (!o || !(o.blockId in confirmations.confirmedAt)) return learning
  return updateEvent(learning, confirmations.date, o.blockId, (e) => ({ ...e, blockedAttempts: e.blockedAttempts + 1 }))
}

/**
 * « Stop » pendant une séance : le travail est crédité jusqu'à cette minute,
 * la fenêtre observée se referme ici — la pendule la clôt au tic suivant sans
 * rien créditer de plus —, le bloc est marqué arrêté (plus jamais « en cours »
 * ni proposé aujourd'hui), et l'arrêt entre au journal avec sa raison (un tap,
 * texte optionnel). La raison est un signal faible ; le comportement autour
 * d'elle (minute, tentatives d'apps, temps de réponse) est le fort.
 *
 * `minute` est l'instant où « Stop » a été TOUCHÉ, pas celui où la raison a
 * été choisie : le temps passé à répondre n'est pas du travail.
 */
export function applyStop(args: {
  learning: LearningState
  confirmations: SessionConfirmationsState
  nowMs: number
  minute: number
  reason: StopReason | null
  text?: string
  answerMs?: number
  attemptsBefore?: number
  /** La catégorie lue dans le texte, si elle est déjà connue. */
  textReason?: StopReason | null
}): { learning: LearningState; confirmations: SessionConfirmationsState; heldMinutes: number } | null {
  const { confirmations } = args
  const o = confirmations.observedPending
  if (!o) return null
  if ((confirmations.stoppedBlockIds ?? []).includes(o.blockId)) return null
  const confirmedAt = confirmations.confirmedAt[o.blockId]
  if (confirmedAt === undefined || args.minute >= o.endMinute) return null

  const minute = Math.max(o.startMinute, args.minute)
  const work = o.workMinutes ?? o.endMinute - o.startMinute
  const credited = applyWorkCredit(args.learning, confirmations, o, o.startMinute, minute)
  // Arrêté pendant la pause : le travail du bloc était fait — tenu en entier.
  const held = Math.min(work, Math.max(0, minute - o.startMinute))
  const early = minute - o.startMinute < work
  const text = args.text?.trim()
  const learning = updateEvent(credited.learning, confirmations.date, o.blockId, (e) => ({
    ...e,
    heldMinutes: held,
    stoppedEarly: early,
    stop: {
      reason: args.reason,
      ...(text ? { text: text.slice(0, 500) } : {}),
      ...(args.textReason ? { textReason: args.textReason } : {}),
      ...(args.answerMs !== undefined ? { answerMs: Math.max(0, Math.round(args.answerMs)) } : {}),
      attemptsBefore: args.attemptsBefore ?? 0,
    },
  }))
  const end = Math.max(o.startMinute + 1, minute)
  return {
    learning,
    confirmations: {
      ...credited.confirmations,
      // workMinutes = ce qui a été tenu : la clôture ne créditera rien de plus.
      observedPending: { ...o, endMinute: end, workMinutes: held },
      stoppedBlockIds: [...(confirmations.stoppedBlockIds ?? []), o.blockId],
    },
    heldMinutes: held,
  }
}

/**
 * Le contexte d'un démarrage, mesuré : charge des 48 dernières heures (ce que
 * le journal a vu tenir hier et aujourd'hui) et heures éveillé depuis le
 * lever. Sert au diagnostic d'arrêt (fatigue ou évitement ?).
 */
export function journalContextFor(args: {
  learning: LearningState
  today: string
  yesterday: string
  nowMinute: number
  wakeMinute: number | null
  spontaneous?: boolean
}): JournalContext {
  const load = (args.learning.sessionEvents ?? [])
    .filter((e) => (e.date === args.today || e.date === args.yesterday) && e.started)
    .reduce((t, e) => t + (e.heldMinutes ?? 0), 0)
  return {
    spontaneous: args.spontaneous ?? false,
    load48hMinutes: Math.min(2880, load),
    ...(args.wakeMinute !== null && args.nowMinute >= args.wakeMinute
      ? { hoursAwake: Math.min(24, (args.nowMinute - args.wakeMinute) / 60) }
      : {}),
  }
}

// ─── Retrait progressif (spec moteur 2026-09-25) ─────────────────────────

/** Phase 3 : l'overlay attend 10 min après le début — assez pour démarrer seul. */
export const OVERLAY_DELAY_PHASE_3 = 10

/**
 * L'overlay « Je commence » doit-il s'afficher maintenant pour ce bloc ?
 *   Phase 1-2 : oui, dès le début (plein écran, comme toujours).
 *   Phase 3   : seulement 10 min après le début ; jamais un jour-test.
 *   Phase 4   : jamais — l'app observe.
 * C'est l'overlay qui disparaît, pas la séance : le démarrage par raccourci
 * ouvre toujours une séance mesurée, avec blocage.
 */
export function overlayDue(args: { phase: number; nowMinute: number; blockStartMinute: number; testDay: boolean }): boolean {
  if (args.phase >= 4) return false
  if (args.phase === 3) return !args.testDay && args.nowMinute >= args.blockStartMinute + OVERLAY_DELAY_PHASE_3
  return true
}

/**
 * La même règle, lue pour un bloc précis. Une tâche n'est pas une habitude —
 * elle a une fin — : elle garde toujours l'overlay (phase 1). Les objectifs
 * et les ancres passent par les 4 phases, mesurées dans le journal.
 */
export function overlayDueFor(args: { learning: LearningState; block: Pick<PlacedBlock, 'kind' | 'refId' | 'startMinute'>; nowMinute: number; today: string }): boolean {
  const phase = args.block.kind === 'task' ? 1 : phaseHabitude(args.learning.sessionEvents ?? [], args.block.refId)
  return overlayDue({
    phase,
    nowMinute: args.nowMinute,
    blockStartMinute: args.block.startMinute,
    testDay: estJourTest(args.block.refId, args.today),
  })
}

/**
 * Variante idempotente, pour qui relit des horodatages (l'iPhone, via
 * l'extension du bouclier) : fixe le nombre de tentatives de la séance en
 * cours à `count` s'il est plus grand. Relire deux fois ne compte pas deux fois.
 */
export function setBlockedAttempts(
  learning: LearningState,
  confirmations: SessionConfirmationsState,
  count: number,
): LearningState {
  const o = confirmations.observedPending
  if (!o || !(o.blockId in confirmations.confirmedAt)) return learning
  const current = (learning.sessionEvents ?? []).find((e) => e.blockId === o.blockId && e.date === confirmations.date)
  if (!current || current.blockedAttempts >= count) return learning
  return updateEvent(learning, confirmations.date, o.blockId, (e) => ({ ...e, blockedAttempts: count }))
}

