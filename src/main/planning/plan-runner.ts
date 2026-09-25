import log from '@main/logging/setup'
import type { Storage } from '@shared/storage'
import { computePlan, PLANNING_HORIZON_DAYS } from '@shared/planning/engine'
import { addDays, dateKey } from '@shared/planning/dates'
import { sleepScheduleEntries } from '@shared/sleep'
import type { PlacedBlock, PlanningInput } from '@shared/planning/types'
import type { BlockingRulesState, LearningState, StopReason } from '@shared/schemas'
import { blockSessionIsActiveAt } from '@main/blocking/schedule'
import {
  activeBlockFor,
  activeConfirmedSession,
  applyConfirmation,
  applyLapsedCredit,
  applyStop,
  closeSessionEvent,
  recordBlockedAttempt,
  journalContextFor,
  overlayDueFor,
  applyWorkCredit,
  blockSessionFor,
  closedObservedBlock,
  confirmationsFor,
  pendingConfirmation,
  tasksToAutoComplete,
} from '@shared/planning/clock'
import type { ConfirmationOverlay } from './confirmation-overlay'

/**
 * L'horloge de planification — le pont D.7/D.8 mis en mouvement.
 *
 * Même philosophie que `blocking/clock.ts` : tic régulier, aucun état
 * restauré d'une exécution à l'autre — à chaque tic, on relit les données,
 * on recalcule le plan du jour (ÉCHEC 3 : rapide à refaire, jamais restauré),
 * et on aligne le monde réel (overlay, apprentissage, session de blocage) sur
 * ce que ce plan dit maintenant. Elle tourne dans le processus main, résidente
 * dans la zone de notification — indépendante de toute fenêtre renderer.
 */

const EMPTY_LEARNING: LearningState = {
  observations: [],
  anchorMissCounts: {},
  dailyUtilization: {},
  weeklyObjectiveServed: {},
  objectiveLastServed: {},
  lastSignalAt: {},
  tasksCreatedPerWeek: {},
  consecutiveDelays: {},
  workedMinutesByRef: {},
  dailyDelayMinutes: {},
  sessionEvents: [],
}

/** « 07:30 » → 450 ; null si absent ou illisible. */
function minuteOf(hhmm: string | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '')
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/** Minute du jour d'un instant — l'unité dans laquelle vivent tous les blocs. */
function minuteOfDay(at: Date): number {
  return at.getHours() * 60 + at.getMinutes()
}

const EMPTY_BLOCKING_RULES: BlockingRulesState = { block: null }

export type PlanRunnerDeps = {
  storage: Storage
  overlay: ConfirmationOverlay
  now: () => Date
  /** Une session de blocage vient d'être écrite : le contrôleur doit se réconcilier tout de suite. */
  onBlockConfirmed?: () => void
  /**
   * `learning` vient de changer (retard crédité, raté enregistré, ou
   * confirmation) — le renderer, s'il tourne, doit relire le storage. Sans ce
   * pont, une fenêtre déjà ouverte affiche un plan périmé indéfiniment : elle
   * ne recharge jamais d'elle-même ce qu'un autre processus a écrit.
   */
  onPlanningDataChanged?: () => void
  onError?: (err: unknown) => void
}

export type ConfirmResult = { ok: true } | { ok: false; reason: string }

export type PlanRunner = {
  start: (intervalMs?: number) => void
  stop: () => void
  tickNow: () => Promise<void>
  confirmBlock: (blockId: string) => Promise<ConfirmResult>
  /** « Stop » pendant une séance : crédite jusqu'ici, lève le blocage, garde la raison. */
  stopBlock: (args: StopArgs) => Promise<ConfirmResult>
  /** Une tentative d'ouvrir une app ou un site bloqué pendant la séance. */
  recordBlockedAttempt: () => Promise<void>
}

export type StopArgs = {
  reason: StopReason | null
  text?: string
  /** Temps mis à répondre, en ms. */
  answerMs?: number
}

export const DEFAULT_PLAN_TICK_MS = 5_000

export function createPlanRunner(deps: PlanRunnerDeps): PlanRunner {
  let timer: NodeJS.Timeout | null = null
  let running: Promise<void> | null = null

  /**
   * Relit tout ce dont le moteur a besoin et recalcule le plan du jour.
   * Partagé entre le tic régulier et la confirmation : les deux doivent voir
   * EXACTEMENT le même plan, jamais une version mise en cache d'un côté et
   * fraîche de l'autre.
   */
  async function loadTodayState(now: Date) {
    const [settings, tasksState, objectivesState, ancresState, scheduleState, learningStored, confirmationsStored] =
      await Promise.all([
        deps.storage.read('settings'),
        deps.storage.read('tasks'),
        deps.storage.read('objectives'),
        deps.storage.read('ancres'),
        deps.storage.read('schedule'),
        deps.storage.read('learning'),
        deps.storage.read('session_confirmations'),
      ])

    const today = dateKey(now)
    const nowMinute = minuteOfDay(now)
    const learning = learningStored ?? EMPTY_LEARNING
    const confirmations = confirmationsFor(confirmationsStored, today)

    // D.7 : la session confirmée en cours est une contrainte de placement, pas
    // une décision à reprendre. Elle est lue AVANT le calcul et entre dedans.
    const activeSession = activeConfirmedSession(confirmations, today, nowMinute)

    const input: PlanningInput = {
      today,
      rangeEnd: addDays(today, PLANNING_HORIZON_DAYS),
      tasks: tasksState?.tasks ?? [],
      objectives: objectivesState?.objectives ?? [],
      ancres: ancresState?.ancres ?? [],
      schedule: [
        ...sleepScheduleEntries(settings?.sleepStart, settings?.sleepEnd),
        ...(scheduleState?.entries ?? []),
      ],
      observations: learning.observations,
      anchorMissCounts: learning.anchorMissCounts,
      dailyUtilization: learning.dailyUtilization,
      weeklyObjectiveServed: learning.weeklyObjectiveServed,
      objectiveLastServed: learning.objectiveLastServed,
      lastSignalAt: learning.lastSignalAt,
      tasksCreatedPerWeek: learning.tasksCreatedPerWeek,
      consecutiveDelays: learning.consecutiveDelays,
      // Le journal des séances : rampe, durées apprises, Thompson (spec 2026-09-25).
      sessionEvents: learning.sessionEvents,
      confirmationSource: {
        getDelayMinutes: (date) => learning.dailyDelayMinutes[date] ?? 0,
        wasNeverConfirmed: () => false,
      },
      // B.5.2 : la mesure du temps réellement travaillé, enfin branchée.
      // `DurationRealSource` était déclaré depuis l'origine du moteur (B.2)
      // mais aucun appelant ne le fournissait : `estimateTask` retombait
      // toujours sur `null`, donc le travail restant ne diminuait jamais de
      // lui-même et la boucle d'apprentissage G tournait à vide.
      durationSource: {
        getActualMinutes: (taskId) => learning.workedMinutesByRef[taskId] ?? null,
      },
      activeSession,
    }

    const plan = computePlan(input, now)
    // B.5.1 : un bloc d'APERÇU (partie encore verrouillée) n'est pas
    // actionnable — ni overlay, ni blocage, ni crédit de travail. Il est écarté
    // ici, une seule fois, plutôt qu'à chacun des endroits qui consomment ces
    // blocs : en oublier un seul rouvrirait la porte à une confirmation sur une
    // partie qui n'a pas encore le droit de commencer.
    const todayBlocks = plan.blocks.filter((b) => b.date === today && b.preview !== true)

    return {
      today,
      nowMinute,
      activeSession,
      learning,
      confirmations,
      todayBlocks,
      tasks: tasksState?.tasks ?? [],
      wakeMinute: minuteOf(settings?.sleepEnd),
    }
  }

  function viewFor(block: PlacedBlock) {
    return {
      blockId: block.id,
      kind: block.kind,
      label: block.label,
      startMinute: block.startMinute,
      appsToBlock: block.appsToBlock ?? [],
    }
  }

  /** Un bloc dont la session de blocage a expiré ne doit pas traîner en mémoire (D.8, hygiène — sans effet fonctionnel : `blockSessionIsActiveAt` l'ignore déjà). */
  async function collectExpiredBlockSession(now: Date): Promise<void> {
    const rules = (await deps.storage.read('blocking_rules')) ?? EMPTY_BLOCKING_RULES
    if (rules.block !== null && !blockSessionIsActiveAt(rules.block, now)) {
      await deps.storage.write('blocking_rules', { ...rules, block: null })
    }
  }

  async function tick(): Promise<void> {
    const now = deps.now()
    const { nowMinute, activeSession, learning, confirmations, todayBlocks, tasks } =
      await loadTodayState(now)

    const confirmedIds = new Set(Object.keys(confirmations.confirmedAt))

    // D.8 : au plus un bloc peut être « en attente » à la fois. `null` dès
    // qu'il est confirmé — c'est ce que l'overlay doit montrer.
    const pending = pendingConfirmation({
      blocks: todayBlocks,
      today: confirmations.date,
      nowMinute,
      confirmedBlockIds: confirmedIds,
      observedPending: confirmations.observedPending,
    })

    // Le bloc actif MAINTENANT, confirmé ou non — sert à entretenir
    // `observedPending` (voir plus bas). Jamais `pending` pour ça : `pending`
    // devient `null` dès la confirmation, ce qui effacerait la mémoire
    // d'observation au tic suivant et ferait perdre la stabilisation
    // (bug réel du 2026-08-23, deuxième occurrence — voir `activeBlockFor`).
    const activeNow = activeBlockFor({
      blocks: todayBlocks,
      today: confirmations.date,
      nowMinute,
      observedPending: confirmations.observedPending,
    })

    // D.7 : le bloc qu'on surveillait au tic précédent (`observedPending`,
    // mémoire persistée) vient-il de fermer sans confirmation ? Ne relit
    // JAMAIS le plan pour le retrouver — depuis D.9 (`notBeforeMinute`), un
    // créneau passé n'y réapparaît plus jamais une fois "maintenant" au-delà.
    // Seule la mémoire explicite peut encore le voir.
    const closed = closedObservedBlock({
      observedPending: confirmations.observedPending,
      currentPending: pending,
      nowMinute,
    })

    let workingLearning = learning
    let workingConfirmations = confirmations
    let changed = false

    if (closed !== null) {
      const confirmedAtMs = confirmations.confirmedAt[closed.blockId]
      if (confirmedAtMs === undefined) {
        // D.7 : jamais confirmé — la fenêtre entière compte comme du retard.
        const result = applyLapsedCredit(workingLearning, workingConfirmations, closed, now.getTime())
        workingLearning = result.learning
        workingConfirmations = result.confirmations
        log.info('[planning] bloc jamais confirmé, retard crédité', {
          blockId: closed.blockId,
          kind: closed.kind,
          minutes: closed.endMinute - closed.startMinute,
        })
      } else {
        // B.5.2 : confirmé et fenêtre écoulée — c'est du travail RÉELLEMENT
        // fait. Compté à partir de la confirmation, jamais de l'heure prévue.
        const result = applyWorkCredit(
          workingLearning,
          workingConfirmations,
          closed,
          minuteOfDay(new Date(confirmedAtMs)),
        )
        // Journal : refermée sans « Stop » — tenue jusqu'au bout.
        workingLearning = closeSessionEvent(
          result.learning,
          workingConfirmations.date,
          closed.blockId,
          closed.workMinutes ?? closed.endMinute - closed.startMinute,
        )
        workingConfirmations = result.confirmations
        log.info('[planning] bloc terminé, travail crédité', {
          blockId: closed.blockId,
          kind: closed.kind,
          refId: closed.refId,
          creditedMinutes: result.creditedMinutes,
        })
      }
      changed = true
    }

    // D.7 : la session confirmée EN COURS crédite son temps au fil des
    // minutes, sans attendre la fermeture de sa fenêtre. C'est ce qui fait
    // vraiment « démarrer » le compteur : le travail restant descend pendant
    // qu'on travaille, au lieu de rester figé jusqu'à la fin du bloc.
    if (activeSession !== null) {
      const confirmedAtMs = confirmations.confirmedAt[activeSession.blockId]
      if (confirmedAtMs !== undefined) {
        const result = applyWorkCredit(
          workingLearning,
          workingConfirmations,
          { ...activeSession, endMinute: activeSession.endMinute },
          minuteOfDay(new Date(confirmedAtMs)),
          nowMinute,
        )
        if (result.creditedMinutes > 0) {
          workingLearning = result.learning
          workingConfirmations = result.confirmations
          changed = true
        }
      }
    }

    const nextObserved = activeSession
      ? {
          blockId: activeSession.blockId,
          kind: activeSession.kind,
          refId: activeSession.refId,
          startMinute: activeSession.startMinute,
          endMinute: activeSession.endMinute,
          workMinutes: activeSession.workMinutes,
        }
      : activeNow
        ? {
          blockId: activeNow.id,
          kind: activeNow.kind,
          refId: activeNow.refId,
          startMinute: activeNow.startMinute,
          endMinute: activeNow.endMinute,
          workMinutes: activeNow.workMinutes,
          ...(activeNow.category ? { category: activeNow.category } : {}),
          plannedStartMinute: Math.min(1439, activeNow.startMinute),
          }
        : null
    if (nextObserved?.blockId !== workingConfirmations.observedPending?.blockId) {
      workingConfirmations = { ...workingConfirmations, observedPending: nextObserved }
      changed = true
    }

    // B.5.2 : c'est l'application qui décide qu'une tâche est terminée — quand
    // le temps planifié a été RÉELLEMENT fait, jamais sur une déclaration.
    // Déverrouille du même coup la partie suivante (B.5.1) : elle cesse d'être
    // en aperçu au prochain recalcul, c'est-à-dire au tic suivant.
    const finished = tasksToAutoComplete({
      tasks,
      workedMinutesByRef: workingLearning.workedMinutesByRef,
    })

    if (finished.length > 0) {
      const done = new Set(finished)
      // `remainingMinutes` n'est PAS remis à zéro : il porte le total planifié,
      // et c'est lui qui fixe la ligne d'arrivée (`plannedTotalFor`). L'écraser
      // casserait « il m'en faut plus » — la cible retomberait aux seules
      // minutes ajoutées, déjà dépassées par le travail fait, et la tâche se
      // reterminerait dans la seconde. `status: 'history'` dit déjà tout.
      const nextTasks = tasks.map((t) =>
        done.has(t.id) ? { ...t, status: 'history' as const } : t,
      )

      // G.1 : une observation n'est enregistrée que sur une MESURE réelle. Le
      // temps estimé reste celui d'origine — jamais gonflé par « il m'en faut
      // plus » (B.5.2), sinon le facteur de correction ne verrait jamais que
      // la tâche a coûté plus cher que prévu.
      const completedAt = now.toISOString()
      workingLearning = {
        ...workingLearning,
        observations: [
          ...workingLearning.observations,
          ...tasks
            .filter((t) => done.has(t.id) && (workingLearning.workedMinutesByRef[t.id] ?? 0) > 0)
            .map((t) => ({
              taskId: t.id,
              category: t.category,
              workKind: t.workKind,
              estimatedMinutes: t.estimatedMinutes,
              actualMinutes: workingLearning.workedMinutesByRef[t.id]!,
              completed: true,
              createdAt: completedAt,
            })),
        ],
      }

      await deps.storage.write('tasks', { tasks: nextTasks })
      changed = true
      log.info('[planning] tâches terminées automatiquement', { taskIds: finished })
    }

    if (changed) {
      await Promise.all([
        deps.storage.write('learning', workingLearning),
        deps.storage.write('session_confirmations', workingConfirmations),
      ])
      deps.onPlanningDataChanged?.()
    }

    // Retrait progressif : en phase 3 l'overlay attend 10 min (et ne vient pas
    // un jour-test), en phase 4 il ne vient plus. La séance, elle, reste
    // démarrable par le raccourci de l'application.
    if (pending && overlayDueFor({ learning: workingLearning, block: pending, nowMinute, today: workingConfirmations.date }))
      deps.overlay.show(viewFor(pending))
    else deps.overlay.close()

    await collectExpiredBlockSession(now)
  }

  async function tickNow(): Promise<void> {
    // Un tic lent ne doit pas se faire doubler par le suivant — même garde
    // que l'horloge de blocage.
    if (running !== null) return running
    running = tick()
      .catch((err) => deps.onError?.(err))
      .finally(() => {
        running = null
      })
    return running
  }

  async function confirmBlock(blockId: string): Promise<ConfirmResult> {
    const now = deps.now()
    const { today, nowMinute, learning, confirmations, todayBlocks, wakeMinute } = await loadTodayState(now)

    if (blockId in confirmations.confirmedAt) {
      return { ok: false, reason: 'Déjà confirmé.' }
    }

    // Résolu par la même stabilisation que le tic (voir `pendingConfirmation`
    // / `stabilized` dans `@shared/planning/clock.ts`) : le `blockId` que l'overlay a reçu
    // à son ouverture peut ne plus exister tel quel dans un scan frais du
    // plan (D.9 le fait glisser à chaque minute) — c'est pourtant le MÊME
    // bloc conceptuel tant que `observedPending` le reconnaît comme tel.
    const confirmedIds = new Set(Object.keys(confirmations.confirmedAt))
    const block = pendingConfirmation({
      blocks: todayBlocks,
      today: confirmations.date,
      nowMinute,
      confirmedBlockIds: confirmedIds,
      observedPending: confirmations.observedPending,
    })
    // Filet : l'overlay a pu être ouvert sur le bloc qu'on surveillait, et le
    // scan frais avoir glissé entre-temps. Tant que c'est CE bloc-là, la
    // confirmation reste valide — refuser ici serait refuser au seul endroit
    // où l'utilisateur peut agir.
    const matchesObserved = confirmations.observedPending?.blockId === blockId
    if (!block || (block.id !== blockId && !matchesObserved)) {
      return { ok: false, reason: 'Ce bloc ne fait plus partie du plan — il a peut-être été recalculé.' }
    }

    const confirmedAtMs = now.getTime()
    const result = applyConfirmation(
      learning,
      confirmations,
      block,
      confirmedAtMs,
      nowMinute,
      journalContextFor({
        learning,
        today,
        yesterday: addDays(today, -1),
        nowMinute,
        wakeMinute,
        // Démarré avant que l'overlay ne le demande : un démarrage spontané,
        // la mesure même de l'autonomie.
        spontaneous: !overlayDueFor({ learning, block, nowMinute, today }),
      }),
    )

    const rules = (await deps.storage.read('blocking_rules')) ?? EMPTY_BLOCKING_RULES
    const session = blockSessionFor(block, confirmedAtMs)

    await Promise.all([
      deps.storage.write('learning', result.learning),
      deps.storage.write('session_confirmations', result.confirmations),
      deps.storage.write('blocking_rules', { ...rules, block: session }),
    ])

    log.info('[planning] bloc confirmé', {
      blockId: block.id,
      kind: block.kind,
      delayMinutes: result.delayMinutes,
      appsToBlock: session.appIds,
    })

    deps.overlay.close()
    deps.onBlockConfirmed?.()
    deps.onPlanningDataChanged?.()
    return { ok: true }
  }

  // Horodatages des tentatives récentes : « tentatives dans les 10 min avant
  // l'arrêt » se mesure ici, en mémoire — rien à persister.
  let attempts: number[] = []

  async function recordAttempt(): Promise<void> {
    const now = deps.now()
    attempts = [...attempts.filter((t) => now.getTime() - t < 10 * 60_000), now.getTime()]
    const { learning, confirmations } = await loadTodayState(now)
    const next = recordBlockedAttempt(learning, confirmations)
    if (next !== learning) await deps.storage.write('learning', next)
  }

  async function stopBlock(args: StopArgs): Promise<ConfirmResult> {
    const now = deps.now()
    const { nowMinute, learning, confirmations } = await loadTodayState(now)
    const result = applyStop({
      learning,
      confirmations,
      nowMs: now.getTime(),
      minute: nowMinute,
      reason: args.reason,
      ...(args.text !== undefined ? { text: args.text } : {}),
      ...(args.answerMs !== undefined ? { answerMs: args.answerMs } : {}),
      attemptsBefore: attempts.filter((t) => now.getTime() - t < 10 * 60_000).length,
    })
    if (!result) return { ok: false, reason: 'Aucune séance en cours.' }

    const rules = (await deps.storage.read('blocking_rules')) ?? EMPTY_BLOCKING_RULES
    await Promise.all([
      deps.storage.write('learning', result.learning),
      deps.storage.write('session_confirmations', result.confirmations),
      // La séance s'arrête : son blocage aussi.
      deps.storage.write('blocking_rules', { ...rules, block: null }),
    ])
    log.info('[planning] séance arrêtée', { heldMinutes: result.heldMinutes, reason: args.reason })
    deps.onBlockConfirmed?.()
    deps.onPlanningDataChanged?.()
    return { ok: true }
  }

  return {
    start(intervalMs = DEFAULT_PLAN_TICK_MS) {
      if (timer !== null) return
      void tickNow()
      timer = setInterval(() => void tickNow(), intervalMs)
    },
    stop() {
      if (timer === null) return
      clearInterval(timer)
      timer = null
    },
    tickNow,
    confirmBlock,
    stopBlock,
    recordBlockedAttempt: recordAttempt,
  }
}
