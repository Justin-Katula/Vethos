import log from '@main/logging/setup'
import { lireTexteArret } from '@shared/coach/coach'
import { detecteDetresse, disciplineSuspendue, MESSAGE_AIDE, SUJET_DETRESSE } from '@shared/coach/garde-fous'
import type { Storage } from '@shared/storage'
import { computePlan, PLANNING_HORIZON_DAYS } from '@shared/planning/engine'
import { addDays, dateKey } from '@shared/planning/dates'
import { sleepScheduleEntries } from '@shared/sleep'
import type { PlacedBlock, PlanningInput } from '@shared/planning/types'
import type { BlockingRulesState, LearningState, SessionConfirmationsState, StopReason } from '@shared/schemas'
import { blockSessionIsActiveAt } from '@main/blocking/schedule'
import { accepterProlongation, marquerOffre, proposerProlongation } from '@shared/planning/prolongation'
import { jourLibrePropose, joursLibresPris } from '@shared/planning/jours-libres'
import { scheduleEntriesForDate } from '@shared/planning/capacity'
import { dayOfWeek } from '@shared/planning/dates'
import {
  activeBlockFor,
  activeConfirmedSession,
  applyConfirmation,
  applyStop,
  applyLapsedCredit,
  closeSessionEvent,
  heldOfWindow,
  recordDailyUtilization,
  recordBlockedAttempt,
  journalContextFor,
  decalageAncre,
  decalerAncre,
  overlayDueFor,
  applyWorkCredit,
  blockSessionFor,
  closedObservedBlock,
  confirmationsFor,
  pendingConfirmation,
  tasksToAutoComplete,
} from '@shared/planning/clock'
import type { ConfirmationOverlay } from './confirmation-overlay'
import { elementPliable, figerIdeaux, historiqueCreations, pliesDuJour } from '@shared/planning/pliement'
import {
  ATTENTE_STOP_MINUTES,
  choisirRattrapage,
  accorderDixMinutes,
  continuer,
  demanderStop,
  dixMinutesEchues,
  executerStop,
  optionsUrgence,
  preparerStop,
  reporterEnUrgence,
  stopEchu,
  tentativePendantUrgence,
  urgenceActive,
  type PlanApres,
  fermerPause,
  finUrgence,
  niveauConfiance,
  ouvrirUrgence,
  prendreSouffle,
  promessesAPoser,
  promesseDuBloc,
  retourDuSouffle,
  retourDuSouffleAvant,
  souffleAvant,
  souffleDisponible,
  stopPermis,
  ticConfiance,
  urgenceTropFrequente,
  URGENCE_APPS_MAX,
  type OptionRattrapage,
  type StopResult,
  type TrustView,
} from '@shared/planning/trust'

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
  extensionOffers: [],
  freeDays: {},
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

export type ConfirmResult = { ok: true; help?: string } | { ok: false; reason: string }

export type PlanRunner = {
  start: (intervalMs?: number) => void
  stop: () => void
  tickNow: () => Promise<void>
  confirmBlock: (blockId: string) => Promise<ConfirmResult>
  /** Une ancre : « In 5 min », 15 min au plus après son heure. */
  delayAnchor: (blockId: string) => Promise<ConfirmResult>
  /**
   * « Stop » : la raison donnée, l'app regarde la place et montre sa réaction
   * (rien n'est arrêté). Sans raison : la fin d'une prolongation.
   */
  stopBlock: (args: { reason: StopReason | null; text?: string; answerMs?: number }) => Promise<StopResult>
  /** « Oui, j'arrête » : l'attente commence, bloquée ; le tic arrête ensuite. */
  confirmStop: (args: StopArgs) => Promise<ConfirmResult>
  /** Une tentative d'ouvrir une app ou un site bloqué pendant la séance. */
  recordBlockedAttempt: () => Promise<void>
  /** Prolongation : l'offre du moment (comptée dès qu'elle est lue), ou null. */
  extensionOffer: () => Promise<{ minutes: number } | null>
  /** « Oui » : la séance et son blocage s'allongent. */
  acceptExtension: () => Promise<ConfirmResult>
  /** Le jour libre proposable cette semaine, ou null. */
  freeDay: () => Promise<string | null>
  /** Le jour libre pris, ou la journée gardée normale. */
  decideFreeDay: (date: string, decision: 'taken' | 'kept') => Promise<void>
  trust: () => Promise<TrustView>
  /** « Je continue » : l'attente s'annule. */
  waiveStop: () => Promise<void>
  /** « 10 more minutes » : on continue, « Stop ? » revient dans 10 min. */
  tenMore: (args: StopArgs) => Promise<void>
  /** Le rattrapage choisi parmi ceux proposés : une promesse. */
  choosePromise: (option: OptionRattrapage) => Promise<ConfirmResult>
  /** L'urgence : jusqu'à quand on peut repousser. */
  urgentOptions: () => Promise<{ options: OptionRattrapage[]; minutes: number } | null>
  /** L'urgence prise : repoussé à `option`, tout bloqué sauf `apps` (3 au plus). */
  urgent: (option: OptionRattrapage, minutes: number, apps: string[]) => Promise<ConfirmResult>
  /** Urgence sans place pour repousser (ou dans une promesse) : 15 min, 3 apps. */
  emergency: (apps: string[]) => Promise<ConfirmResult>
  /** « J'ai besoin de 15 min » : avant la promesse (`blockId`) ou pendant. */
  breather: (blockId?: string) => Promise<ConfirmResult>
  /** « Je reprends ». */
  resume: () => Promise<void>
}

export type { StopResult, TrustView }

export type StopArgs = {
  reason: StopReason
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
      // Pliés aujourd'hui : leur reste épaissit les jours suivants.
      folded: pliesDuJour(learning, confirmations),
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
      // Jours libres pris : le moteur les vide (ancres minimales exceptées).
      freeDays: joursLibresPris(learning),
      // Les rattrapages promis : posés à l'heure choisie.
      promises: promessesAPoser(learning),
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
      sleepMinute: minuteOf(settings?.sleepStart),
      input,
      plan,
    }
  }

  /** Le prochain engagement du jour après `after` : bloc, ancre ou obligation (sommeil exclu). */
  function nextStartAfter(state: Awaited<ReturnType<typeof loadTodayState>>, after: number, excludeId: string): number | null {
    const starts = [
      ...state.todayBlocks.filter((b) => b.id !== excludeId && b.confirmed !== true).map((b) => b.startMinute),
      ...scheduleEntriesForDate(state.input.schedule, state.today, dayOfWeek(state.today))
        .filter((e) => e.categoryType !== 'sleep')
        .map((e) => e.startMinute),
    ].filter((m) => m >= after)
    return starts.length ? Math.min(...starts) : null
  }

  async function extensionOffer(): Promise<{ minutes: number } | null> {
    const now = deps.now()
    const state = await loadTodayState(now)
    const { learning, confirmations, activeSession, nowMinute, today } = state
    if (!activeSession || disciplineSuspendue(learning.lastSignalAt, now)) return null
    const o = confirmations.observedPending
    if (!o || o.blockId !== activeSession.blockId) return null
    const event = (learning.sessionEvents ?? []).find((e) => e.blockId === o.blockId && e.date === today)
    if (!event) return null
    // Déjà montrée pour cette séance : on la rend telle quelle, sans la recompter.
    if (offered?.blockId === o.blockId) return event.extensionMinutes === undefined ? { minutes: offered.minutes } : null
    const work = o.workMinutes ?? o.endMinute - o.startMinute
    const workEnd = o.startMinute + work
    const cap = state.plan.capacities.find((c) => c.date === today)
    const minutes = proposerProlongation({
      event,
      session: { blockId: o.blockId, startMinute: o.startMinute, workMinutes: work },
      nowMinute,
      nowMs: now.getTime(),
      today,
      events: learning.sessionEvents ?? [],
      historique: learning.extensionOffers ?? [],
      dejaOfferte: (confirmations.extensionOfferedBlockIds ?? []).includes(o.blockId),
      prochainDebut: nextStartAfter(state, workEnd, o.blockId),
      coucher: state.sleepMinute,
      travailDuJour:
        Math.max(0, workEnd - nowMinute) +
        state.todayBlocks
          .filter((b) => b.kind !== 'ancre' && b.id !== o.blockId && b.confirmed !== true)
          .reduce((t, b) => t + b.workMinutes, 0),
      capaciteDuJour: cap?.effectiveCapacityMinutes ?? 0,
    })
    if (minutes === null) return null
    const marked = marquerOffre(learning, confirmations, o.blockId)
    await Promise.all([
      deps.storage.write('learning', marked.learning),
      deps.storage.write('session_confirmations', marked.confirmations),
    ])
    offered = { blockId: o.blockId, minutes }
    return { minutes }
  }

  // L'offre montrée, gardée pour le « Oui » : une fois comptée, elle ne se
  // recalcule plus (la proposer à nouveau la refuserait — une par bloc).
  let offered: { blockId: string; minutes: number } | null = null

  async function acceptExtension(): Promise<ConfirmResult> {
    const now = deps.now()
    const state = await loadTodayState(now)
    const o = state.confirmations.observedPending
    if (!o || !offered || offered.blockId !== o.blockId) return { ok: false, reason: 'Aucune offre en cours.' }
    const workEnd = o.startMinute + (o.workMinutes ?? o.endMinute - o.startMinute)
    const result = accepterProlongation({
      learning: state.learning,
      confirmations: state.confirmations,
      minutes: offered.minutes,
      prochainDebut: nextStartAfter(state, workEnd, o.blockId),
    })
    offered = null
    if (!result) return { ok: false, reason: 'Aucune séance en cours.' }
    const rules = (await deps.storage.read('blocking_rules')) ?? EMPTY_BLOCKING_RULES
    const end = result.confirmations.observedPending?.endMinute ?? o.endMinute
    const midnight = new Date(now)
    midnight.setHours(0, 0, 0, 0)
    const endsAt = midnight.getTime() + end * 60_000
    await Promise.all([
      deps.storage.write('learning', result.learning),
      deps.storage.write('session_confirmations', result.confirmations),
      // Le blocage suit la séance prolongée.
      ...(rules.block && rules.block.blockId === o.blockId
        ? [deps.storage.write('blocking_rules', { ...rules, block: { ...rules.block, endsAt: Math.max(rules.block.endsAt, endsAt) } })]
        : []),
    ])
    log.info('[planning] séance prolongée', { blockId: o.blockId })
    deps.onBlockConfirmed?.()
    deps.onPlanningDataChanged?.()
    return { ok: true }
  }

  async function freeDay(): Promise<string | null> {
    const now = deps.now()
    const state = await loadTodayState(now)
    return jourLibrePropose({ input: state.input, learning: state.learning, plan: state.plan, now })
  }

  async function decideFreeDay(date: string, decision: 'taken' | 'kept'): Promise<void> {
    const learning = (await deps.storage.read('learning')) ?? EMPTY_LEARNING
    await deps.storage.write('learning', { ...learning, freeDays: { ...(learning.freeDays ?? {}), [date]: decision } })
    deps.onPlanningDataChanged?.()
  }

  function viewFor(block: PlacedBlock, learning?: LearningState, confirmations?: SessionConfirmationsState) {
    return {
      ...(block.promiseId && learning && souffleDisponible(learning, block.id) ? { breather: true } : {}),
      ...(block.kind === 'ancre' ? { anchorShift: confirmations ? decalageAncre(confirmations, block.id) : 0 } : {}),
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
    const state = await loadTodayState(now)
    const { nowMinute, activeSession, learning, confirmations, todayBlocks, tasks, wakeMinute, plan, today } = state

    const confirmedIds = new Set(Object.keys(confirmations.confirmedAt))

    // D.8 : au plus un bloc peut être « en attente » à la fois. `null` dès
    // qu'il est confirmé — c'est ce que l'overlay doit montrer.
    const pending = pendingConfirmation({
      blocks: todayBlocks,
      today: confirmations.date,
      nowMinute,
      confirmedBlockIds: confirmedIds,
      observedPending: confirmations.observedPending,
      stoppedBlockIds: confirmations.stoppedBlockIds,
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
      stoppedBlockIds: confirmations.stoppedBlockIds,
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

    // La version idéale de chaque tâche : figée la première fois que le plan la pose.
    let workingLearning = figerIdeaux(learning, plan, { tasks: state.input.tasks, objectives: state.input.objectives, today })
    let workingConfirmations = confirmations
    let changed = workingLearning !== learning

    if (closed !== null) {
      const confirmedAtMs = confirmations.confirmedAt[closed.blockId]
      if (confirmedAtMs === undefined && disciplineSuspendue(workingLearning.lastSignalAt, now)) {
        // Détresse vue il y a moins de 24 h : l'app n'exige rien — un bloc
        // non démarré n'est ni un retard, ni un raté, ni un recul de phase.
      } else if (confirmedAtMs === undefined) {
        // D.7 : jamais confirmé — la fenêtre entière compte comme du retard.
        const result = applyLapsedCredit(
          workingLearning,
          workingConfirmations,
          closed,
          now.getTime(),
          journalContextFor({
            learning: workingLearning,
            today: workingConfirmations.date,
            yesterday: addDays(workingConfirmations.date, -1),
            nowMinute: closed.plannedStartMinute ?? closed.startMinute,
            wakeMinute,
          }),
        )
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
          heldOfWindow(closed),
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

    // L'attente d'un Stop est finie : la séance s'arrête, le blocage se lève,
    // et le reste se plie dans les séances à venir.
    const due = stopEchu(workingConfirmations, now.getTime())
    if (due) {
      const r = executerStop({
        learning: workingLearning,
        confirmations: workingConfirmations,
        nowMs: now.getTime(),
        textReason: due.text ? lireTexteArret(due.text) : null,
      })
      workingLearning = r.learning
      workingConfirmations = r.confirmations
      changed = true
      await pauseBlocking(null)
    }

    // Stop, promesses et confiance : pauses échues (le blocage revient),
    // promesses tenues ou rompues.
    const pauseBefore = workingConfirmations.pause ?? null
    const trustTick = ticConfiance(workingLearning, workingConfirmations, today, nowMinute, now.getTime())
    if (trustTick.change) {
      workingLearning = trustTick.learning
      workingConfirmations = trustTick.confirmations
      changed = true
      if (pauseBefore && !workingConfirmations.pause) await restoreBlocking(workingConfirmations, todayBlocks, now)
    }

    // E.3/E.4 : l'utilisation RÉELLE du jour, enfin enregistrée — sans elle,
    // la fatigue accumulée et la respiration de la semaine ne voyaient rien.
    const measured = recordDailyUtilization(workingLearning, today, plan.todayFullCapacityMinutes)
    if (measured !== workingLearning) {
      workingLearning = measured
      changed = true
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
    if (
      pending &&
      !disciplineSuspendue(workingLearning.lastSignalAt, now) &&
      (pending.promiseId !== undefined ||
        overlayDueFor({
          learning: workingLearning,
          block: pending,
          nowMinute,
          today: workingConfirmations.date,
          decalage: decalageAncre(workingConfirmations, pending.id),
        }))
    )
      deps.overlay.show(viewFor(pending, workingLearning, workingConfirmations))
    else deps.overlay.close()

    await collectExpiredBlockSession(now)
  }

  // UN seul verrou pour tout ce qui lit puis réécrit `learning` et
  // `session_confirmations` : le tic, « Je commence », « Stop », une tentative
  // d'app. Sans lui, un tic parti avant un « Stop » réécrivait son instantané
  // périmé par-dessus — l'arrêt disparaissait, le blocage restait levé.
  let lock: Promise<unknown> = Promise.resolve()
  function serialize<T>(f: () => Promise<T>): Promise<T> {
    const run = lock.then(f, f)
    lock = run.catch(() => undefined)
    return run
  }

  async function tickNow(): Promise<void> {
    // Un tic lent ne doit pas se faire doubler par le suivant — même garde
    // que l'horloge de blocage.
    if (running !== null) return running
    running = serialize(tick)
      .catch((err) => deps.onError?.(err))
      .finally(() => {
        running = null
      })
    return running
  }

  /** « In 5 min » : l'ancre se décale (15 min au plus après son heure), l'overlay se ferme. */
  async function delayAnchor(blockId: string): Promise<ConfirmResult> {
    const now = deps.now()
    const { nowMinute, confirmations, todayBlocks } = await loadTodayState(now)
    const block = todayBlocks.find((b) => b.id === blockId)
    const next = block ? decalerAncre(confirmations, block, nowMinute) : null
    if (!next) return { ok: false, reason: 'It’s time.' }
    await deps.storage.write('session_confirmations', next)
    deps.overlay.close()
    return { ok: true }
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
      stoppedBlockIds: confirmations.stoppedBlockIds,
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

    // Le retour d'un souffle pris AVANT la promesse se juge ici.
    const promised = promesseDuBloc(result.learning, block.id)
    if (promised) result.learning = retourDuSouffleAvant(result.learning, promised.id, nowMinute)

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
    const { learning, confirmations, nowMinute, todayBlocks } = await loadTodayState(now)
    const next = tentativePendantUrgence(recordBlockedAttempt(learning, confirmations, now.getTime()), confirmations, now.getTime())
    // Urgence : ouvrir une app NON choisie arrête la pause tout de suite.
    if (confirmations.pause?.kind === 'emergency') {
      const r = finUrgence(next, confirmations, { nowMinute, nowMs: now.getTime(), end: 'attempt' })
      await Promise.all([deps.storage.write('learning', r.learning), deps.storage.write('session_confirmations', r.confirmations)])
      await restoreBlocking(r.confirmations, todayBlocks, now)
      deps.onPlanningDataChanged?.()
      return
    }
    if (next !== learning) await deps.storage.write('learning', next)
  }

  /**
   * Le blocage de la séance revient après une pause : les apps du bloc, de
   * maintenant jusqu'à la fin de la fenêtre (allongée par la pause).
   */
  async function restoreBlocking(
    confirmations: Awaited<ReturnType<typeof loadTodayState>>['confirmations'],
    todayBlocks: Awaited<ReturnType<typeof loadTodayState>>['todayBlocks'],
    now: Date,
  ): Promise<void> {
    const o = confirmations.observedPending
    if (!o || !(o.blockId in confirmations.confirmedAt)) return
    const minutesLeft = o.endMinute - minuteOfDay(now)
    if (minutesLeft <= 0) return
    const rules = (await deps.storage.read('blocking_rules')) ?? EMPTY_BLOCKING_RULES
    const block = todayBlocks.find((b) => b.id === o.blockId)
    await deps.storage.write('blocking_rules', {
      ...rules,
      block: {
        blockId: o.blockId,
        startedAt: now.getTime(),
        endsAt: now.getTime() + minutesLeft * 60_000,
        appIds: block?.appsToBlock ?? rules.block?.appIds ?? [],
        blockedSites: rules.block?.blockedSites ?? [],
      },
    })
    deps.onBlockConfirmed?.()
  }

  /** Pendant une pause, le blocage est levé — sauf, en urgence, pour les apps non choisies. */
  async function pauseBlocking(keepApps: string[] | null): Promise<void> {
    const rules = (await deps.storage.read('blocking_rules')) ?? EMPTY_BLOCKING_RULES
    if (!rules.block) return
    const block = keepApps === null ? null : { ...rules.block, appIds: keepApps }
    await deps.storage.write('blocking_rules', { ...rules, block })
    deps.onBlockConfirmed?.()
  }

  /** Le plan recalculé comme si l'arrêt (et ses promesses) étaient acceptés. */
  function planApresFor(state: Awaited<ReturnType<typeof loadTodayState>>, now: Date): PlanApres {
    return (l, c) => {
      const next: PlanningInput = {
        ...state.input,
        sessionEvents: l.sessionEvents,
        activeSession: activeConfirmedSession(c, state.today, state.nowMinute),
        promises: promessesAPoser(l),
        folded: pliesDuJour(l, c),
      }
      return { plan: computePlan(next, now), input: next }
    }
  }

  /** Ce qui se plie, et les créations passées pour la probabilité. */
  const pliageFor = (state: Awaited<ReturnType<typeof loadTodayState>>, o: { kind: 'task' | 'objective' | 'ancre'; refId: string }) => ({
    element: elementPliable(o, { tasks: state.input.tasks, objectives: state.input.objectives, today: state.today }),
    creations: historiqueCreations({ tasks: state.input.tasks, objectives: state.input.objectives, ancres: state.input.ancres }),
  })

  const sleptHoursOf = (state: Awaited<ReturnType<typeof loadTodayState>>) =>
    state.sleepMinute !== null && state.wakeMinute !== null ? ((state.wakeMinute - state.sleepMinute + 1440) % 1440) / 60 : null

  /**
   * La raison est donnée : l'app regarde s'il y a la place de repousser, puis
   * montre la réaction propre à la raison. Rien n'est arrêté ici — sauf une
   * détresse lue dans le texte : on arrête tout de suite, sans attente, et on
   * oriente vers une aide humaine.
   */
  async function stopReason(args: StopArgs): Promise<StopResult> {
    const now = deps.now()
    const state = await loadTodayState(now)
    const { learning, confirmations } = state
    const o = confirmations.observedPending
    if (!o) return { ok: false, reason: 'No session running.' }
    const minute = state.nowMinute
    const attemptsBefore = attempts.filter((t) => now.getTime() - t < 10 * 60_000).length

    if (args.text && detecteDetresse(args.text)) {
      const r = applyStop({ learning, confirmations, nowMs: now.getTime(), minute, reason: args.reason, text: args.text, attemptsBefore })
      if (!r) return { ok: false, reason: 'No session running.' }
      await Promise.all([
        deps.storage.write('learning', { ...r.learning, lastSignalAt: { ...r.learning.lastSignalAt, [SUJET_DETRESSE]: now.toISOString() } }),
        deps.storage.write('session_confirmations', r.confirmations),
      ])
      await pauseBlocking(null)
      deps.onPlanningDataChanged?.()
      return { ok: true, step: 'help', message: MESSAGE_AIDE }
    }

    const task = o.kind === 'task' ? state.tasks.find((t) => t.id === o.refId) : undefined
    const prep = preparerStop({
      learning,
      confirmations,
      nowMs: now.getTime(),
      minute,
      reason: args.reason,
      attemptsBefore,
      sleptHours: sleptHoursOf(state),
      coucher: state.sleepMinute,
      tache: task ? { id: task.id, deadline: task.deadline } : null,
      planApres: planApresFor(state, now),
      pliage: pliageFor(state, o),
    })
    if (!prep) return { ok: false, reason: 'No Stop in this session.' }
    if (prep.etape === 'pas-de-place') {
      await Promise.all([deps.storage.write('learning', prep.learning), deps.storage.write('session_confirmations', prep.confirmations)])
      // Une pause : le blocage revient dans 15 min.
      await pauseBlocking(null)
      deps.onPlanningDataChanged?.()
      return { ok: true, step: 'no-room', message: prep.message }
    }
    return { ok: true, step: 'reaction', lines: prep.reaction.lignes, tenMinutes: prep.reaction.dixMinutes, waitMinutes: prep.attenteMinutes }
  }

  /**
   * « Oui, j'arrête » : l'attente commence. Le blocage tient jusqu'à la fin
   * de l'attente, puis la séance s'arrête d'elle-même (le tic l'exécute).
   */
  async function confirmStop(args: StopArgs): Promise<ConfirmResult> {
    const now = deps.now()
    const state = await loadTodayState(now)
    const { learning, confirmations } = state
    const o = confirmations.observedPending
    if (!o) return { ok: false, reason: 'No session running.' }
    const attemptsBefore = attempts.filter((t) => now.getTime() - t < 10 * 60_000).length
    const task = o.kind === 'task' ? state.tasks.find((t) => t.id === o.refId) : undefined
    const prep = preparerStop({
      learning,
      confirmations,
      nowMs: now.getTime(),
      minute: state.nowMinute,
      reason: args.reason,
      attemptsBefore,
      sleptHours: sleptHoursOf(state),
      coucher: state.sleepMinute,
      tache: task ? { id: task.id, deadline: task.deadline } : null,
      planApres: planApresFor(state, now),
      pliage: pliageFor(state, o),
    })
    if (!prep || prep.etape !== 'reaction') return { ok: false, reason: 'No Stop in this session.' }
    const next = demanderStop(confirmations, {
      nowMs: now.getTime(),
      minute: state.nowMinute,
      reason: args.reason,
      ...(args.text !== undefined ? { text: args.text } : {}),
      ...(args.answerMs !== undefined ? { answerMs: args.answerMs } : {}),
      attemptsBefore,
      attenteMinutes: prep.attenteMinutes,
      placement: prep.reaction.placement,
    })
    if (!next) return { ok: false, reason: 'The block ends before the wait.' }
    await deps.storage.write('session_confirmations', next)
    const rules = (await deps.storage.read('blocking_rules')) ?? EMPTY_BLOCKING_RULES
    if (rules.block) {
      await deps.storage.write('blocking_rules', { ...rules, block: { ...rules.block, endsAt: next.stopPending!.untilMs } })
      deps.onBlockConfirmed?.()
    }
    deps.onPlanningDataChanged?.()
    return { ok: true }
  }

  async function trustView(): Promise<TrustView> {
    const now = deps.now()
    const { learning, confirmations, todayBlocks, activeSession, today } = await loadTodayState(now)
    const level = niveauConfiance(learning.trust)
    const rules = (await deps.storage.read('blocking_rules')) ?? EMPTY_BLOCKING_RULES
    const knowledge = await deps.storage.read('app_knowledge')
    const ids = activeSession ? (todayBlocks.find((b) => b.id === activeSession.blockId)?.appsToBlock ?? rules.block?.appIds ?? []) : []
    const nameOf = (id: string) => {
      const p = knowledge?.profiles[id] ?? Object.values(knowledge?.profiles ?? {}).find((x) => x.identifiant === id || x.appIdInterne === id)
      return p?.nom_affiche ?? id
    }
    const pause = confirmations.pause ?? null
    const u = urgenceActive(confirmations, now.getTime())
    return {
      level,
      waitMinutes: ATTENTE_STOP_MINUTES[level],
      stopAllowed: !!activeSession && stopPermis(learning, confirmations),
      pause: pause ? { kind: pause.kind, endMinute: pause.endMinute } : null,
      awaitingReturn: !!confirmations.awaitingReturn,
      stopPending: confirmations.stopPending ? { untilMs: confirmations.stopPending.untilMs } : null,
      promiseChoice: confirmations.promiseChoice ?? null,
      urgence: u ? { untilMinute: u.untilMinute } : null,
      urgentTooOften: urgenceTropFrequente(learning, today),
      breatherNow: !!activeSession && souffleDisponible(learning, activeSession.blockId) && !pause,
      sessionApps: ids.map((id) => ({ id, name: nameOf(id) })),
      anchor: !!activeSession && confirmations.observedPending?.kind === 'ancre',
      tenMinutesUp: activeSession && stopPermis(learning, confirmations) ? dixMinutesEchues(confirmations, now.getTime()) : null,
    }
  }

  /** « Je continue » : l'attente s'annule, le blocage retrouve la fin du bloc. */
  async function waiveStop(): Promise<void> {
    const now = deps.now()
    const { learning, confirmations, todayBlocks } = await loadTodayState(now)
    const r = continuer(learning, confirmations)
    await Promise.all([deps.storage.write('learning', r.learning), deps.storage.write('session_confirmations', r.confirmations)])
    if (confirmations.stopPending) await restoreBlocking(r.confirmations, todayBlocks, now)
  }

  async function tenMore(args: StopArgs): Promise<void> {
    const now = deps.now()
    const { learning, confirmations, todayBlocks } = await loadTodayState(now)
    const r = accorderDixMinutes(learning, confirmations, { nowMs: now.getTime(), reason: args.reason, ...(args.text !== undefined ? { text: args.text } : {}) })
    if (!r) return waiveStop()
    await Promise.all([deps.storage.write('learning', r.learning), deps.storage.write('session_confirmations', r.confirmations)])
    if (confirmations.stopPending) await restoreBlocking(r.confirmations, todayBlocks, now)
  }

  async function choosePromise(option: OptionRattrapage): Promise<ConfirmResult> {
    const now = deps.now()
    const { learning, confirmations } = await loadTodayState(now)
    const r = choisirRattrapage(learning, confirmations, option, now.getTime())
    if (!r) return { ok: false, reason: 'This slot is no longer offered.' }
    await Promise.all([deps.storage.write('learning', r.learning), deps.storage.write('session_confirmations', r.confirmations)])
    deps.onPlanningDataChanged?.()
    return { ok: true }
  }

  /** L'urgence : jusqu'à quand on peut repousser (heures tenables seulement). */
  async function urgentOptions(): Promise<{ options: OptionRattrapage[]; minutes: number } | null> {
    const now = deps.now()
    const state = await loadTodayState(now)
    const o = state.confirmations.observedPending
    return optionsUrgence({
      learning: state.learning,
      confirmations: state.confirmations,
      nowMs: now.getTime(),
      minute: state.nowMinute,
      deadline: o?.kind === 'task' ? (state.tasks.find((t) => t.id === o.refId)?.deadline ?? null) : null,
      planApres: planApresFor(state, now),
    })
  }

  /**
   * L'urgence prise : la séance s'arrête maintenant, la promesse est posée, et
   * d'ici là tout reste bloqué sauf les apps choisies.
   */
  async function urgent(option: OptionRattrapage, minutes: number, apps: string[]): Promise<ConfirmResult> {
    if (apps.length > URGENCE_APPS_MAX) return { ok: false, reason: '3 apps at most.' }
    const now = deps.now()
    const { learning, confirmations, nowMinute, sleepMinute, todayBlocks } = await loadTodayState(now)
    const o = confirmations.observedPending
    const r = reporterEnUrgence({
      learning,
      confirmations,
      nowMs: now.getTime(),
      minute: nowMinute,
      option,
      minutes,
      apps,
      label: todayBlocks.find((b) => b.id === o?.blockId)?.label ?? '',
      coucher: sleepMinute,
    })
    if (!r) return { ok: false, reason: 'No session running.' }
    const rules = (await deps.storage.read('blocking_rules')) ?? EMPTY_BLOCKING_RULES
    const all = todayBlocks.find((b) => b.id === o?.blockId)?.appsToBlock ?? rules.block?.appIds ?? []
    await Promise.all([
      deps.storage.write('learning', r.learning),
      deps.storage.write('session_confirmations', r.confirmations),
      deps.storage.write('blocking_rules', {
        ...rules,
        block: {
          blockId: `urgence-${o!.blockId}`,
          startedAt: now.getTime(),
          endsAt: r.confirmations.urgence!.untilMs,
          appIds: all.filter((id) => !apps.includes(id)),
          blockedSites: rules.block?.blockedSites ?? [],
        },
      }),
    ])
    deps.onBlockConfirmed?.()
    deps.onPlanningDataChanged?.()
    return { ok: true }
  }

  /** Pas de place pour repousser une urgence : 15 min, puis on finit. */
  async function emergency(apps: string[]): Promise<ConfirmResult> {
    if (apps.length > URGENCE_APPS_MAX) return { ok: false, reason: '3 apps at most.' }
    const now = deps.now()
    const { learning, confirmations, nowMinute, sleepMinute } = await loadTodayState(now)
    const r = ouvrirUrgence(learning, confirmations, {
      nowMinute,
      nowMs: now.getTime(),
      apps,
      limiteMinute: sleepMinute !== null ? sleepMinute - 30 : null,
    })
    if (!r) return { ok: false, reason: 'No session running.' }
    await Promise.all([deps.storage.write('learning', r.learning), deps.storage.write('session_confirmations', r.confirmations)])
    const rules = (await deps.storage.read('blocking_rules')) ?? EMPTY_BLOCKING_RULES
    await pauseBlocking((rules.block?.appIds ?? []).filter((id) => !apps.includes(id)))
    deps.onPlanningDataChanged?.()
    return { ok: true }
  }

  /**
   * « Stop » : avec une raison, la préparation (place, réaction) ; sans raison,
   * la fin d'une prolongation — le bloc prévu est fait, rien à rattraper.
   */
  async function stopBlock(args: { reason: StopReason | null; text?: string; answerMs?: number }): Promise<StopResult> {
    if (args.reason !== null) return stopReason({ ...args, reason: args.reason })
    const now = deps.now()
    const { learning, confirmations, nowMinute } = await loadTodayState(now)
    const r = applyStop({ learning, confirmations, nowMs: now.getTime(), minute: nowMinute, reason: null })
    if (!r) return { ok: false, reason: 'No session running.' }
    await Promise.all([deps.storage.write('learning', r.learning), deps.storage.write('session_confirmations', r.confirmations)])
    await pauseBlocking(null)
    deps.onPlanningDataChanged?.()
    return { ok: true, step: 'ended' }
  }

  async function breather(blockId?: string): Promise<ConfirmResult> {
    const now = deps.now()
    const { learning, confirmations, nowMinute, sleepMinute } = await loadTodayState(now)
    if (blockId) {
      const p = promesseDuBloc(learning, blockId)
      const next = p ? souffleAvant(learning, p.id) : null
      if (!next) return { ok: false, reason: 'Already taken.' }
      await deps.storage.write('learning', next)
      deps.overlay.close()
      deps.onPlanningDataChanged?.()
      return { ok: true }
    }
    const r = prendreSouffle(learning, confirmations, nowMinute, now.getTime(), sleepMinute !== null ? sleepMinute - 30 : null)
    if (!r) return { ok: false, reason: 'Already taken.' }
    await Promise.all([deps.storage.write('learning', r.learning), deps.storage.write('session_confirmations', r.confirmations)])
    await pauseBlocking(null)
    deps.onPlanningDataChanged?.()
    return { ok: true }
  }

  async function resume(): Promise<void> {
    const now = deps.now()
    const { learning, confirmations, nowMinute, sleepMinute, todayBlocks } = await loadTodayState(now)
    let next: { learning: typeof learning; confirmations: typeof confirmations }
    if (confirmations.awaitingReturn) next = retourDuSouffle(learning, confirmations, nowMinute, sleepMinute !== null ? sleepMinute - 30 : null)
    else if (confirmations.pause?.kind === 'emergency') next = finUrgence(learning, confirmations, { nowMinute, nowMs: now.getTime(), end: 'voluntary' })
    else if (confirmations.pause) next = { learning, confirmations: fermerPause(confirmations, nowMinute) }
    else return
    await Promise.all([deps.storage.write('learning', next.learning), deps.storage.write('session_confirmations', next.confirmations)])
    await restoreBlocking(next.confirmations, todayBlocks, now)
    deps.overlay.close()
    deps.onPlanningDataChanged?.()
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
    confirmBlock: (blockId: string) => serialize(() => confirmBlock(blockId)),
    delayAnchor: (blockId: string) => serialize(() => delayAnchor(blockId)),
    stopBlock: (args) => serialize(() => stopBlock(args)),
    confirmStop: (args: StopArgs) => serialize(() => confirmStop(args)),
    recordBlockedAttempt: () => serialize(recordAttempt),
    extensionOffer: () => serialize(extensionOffer),
    acceptExtension: () => serialize(acceptExtension),
    freeDay: () => serialize(freeDay),
    decideFreeDay: (date: string, decision: 'taken' | 'kept') => serialize(() => decideFreeDay(date, decision)),
    trust: () => serialize(trustView),
    waiveStop: () => serialize(waiveStop),
    tenMore: (args: StopArgs) => serialize(() => tenMore(args)),
    choosePromise: (option) => serialize(() => choosePromise(option)),
    urgentOptions: () => serialize(urgentOptions),
    urgent: (option, minutes, apps) => serialize(() => urgent(option, minutes, apps)),
    emergency: (apps: string[]) => serialize(() => emergency(apps)),
    breather: (blockId?: string) => serialize(() => breather(blockId)),
    resume: () => serialize(resume),
  }
}
