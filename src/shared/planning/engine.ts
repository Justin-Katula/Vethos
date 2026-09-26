import type {
  AncreItem,
  DayCapacity,
  DurationRealSource,
  ObjectiveItem,
  PlacedBlock,
  PlanningInput,
  PlanningResult,
  TaskItem,
  TaskVerdict,
} from './types'
import {
  buildDayCapacity,
  measureFragmentThreshold,
  scheduleEntriesForDate,
  wakeMinutes,
  wakeZoneFor,
} from './capacity'
import {
  addDays,
  dateKey,
  datesBetween,
  daysBetween,
  dayOfWeek,
  minutesUntilEndOf,
  startOfWeek,
} from './dates'
import { COULEUR_TACHE } from '../palettes'
import { isPartLocked } from './estimation'
import {
  buildFeasibilityResult,
  computeMargin,
  postPlacementCheck,
  produceSignals,
  stolenFraction,
  tensionFor,
  type DayCapacityPoint,
} from './feasibility'
import { buildWindowMap, hasEnoughData, windowLookup } from './learning'
import { apprenable, BLOC_MAX, BLOC_MIN, betaMean, dureeCible, GAMMA, inheritedPosterior, rng, sampleBeta, seedFrom, survieDe, trancheDe, type Tranche } from './bayes'
import { doseSemaine, niveauDifficulte, phaseHabitude, rupturePossible, tenue, TOLERANCE_DEPART_MINUTES } from './habitudes'
import { ajustementPour, diagnostiquer, pauseAnticipee } from './arrets'
import type { SessionEvent } from '@shared/schemas'
import {
  computeObjectiveQuota,
  computeTaskDayTarget,
  computeWIPLimit,
  dailyRhythm,
  DayAllocator,
  DAYS_PER_WEEK,
  SCORE_DEFAULTS,
  scoreSlot,
  sortTasksByCascade,
  TASK_CONSTANTS,
  type TaskWithMargin,
} from './placement'
import {
  computeBreakMinutes,
  settleBreaks,
  workOfFootprint,
  computeFatigue,
  computeRestFloor,
  computeWeeklyBreathing,
} from './rest'

/**
 * Horizon du plan : la semaine qui vient, aujourd'hui inclus.
 *
 * Source unique — le renderer (vue semaine) et le processus main (horloge de
 * planification D.7/D.8) doivent calculer EXACTEMENT le même plan pour
 * aujourd'hui, sinon l'overlay de confirmation pourrait se déclencher sur un
 * bloc que la vue semaine ne montre plus de la même façon.
 */
export const PLANNING_HORIZON_DAYS = 6

/** D.6 : semaines cibles pour finir une tâche typique (W de L = λ × W). */
const WIP_TARGET_WEEKS = 2

/**
 * D.5/A.4 : budget de travail profond d'une journée — 2 blocs de 90 minutes,
 * la limite ultradienne. Il se partage entre tâches et objectifs, et ne se
 * consomme qu'en fenêtre PROFONDE : au démarrage, aucune heure n'est profonde
 * tant que l'usage ne l'a pas montrée (A.4), donc rien n'est rationné sur une
 * qualité supposée.
 */
const DEEP_BUDGET_MINUTES = TASK_CONSTANTS.maxDeepBlocksPerDay * TASK_CONSTANTS.targetBlockMinutes

/** L'empreinte réelle d'un bloc : le travail plus sa pause (E.1). */
function footprintFor(workMinutes: number): number {
  return workMinutes + computeBreakMinutes(workMinutes)
}

/**
 * Point d'entrée du moteur : computePlan(input) → PlanningResult.
 *
 * Fonction pure : mêmes entrées, même plan. Elle ne pose jamais de question,
 * n'affiche rien et ne notifie personne (F, C.3.2, B.6) — elle produit des
 * faits chiffrés que d'autres points consommeront.
 */
export function computePlan(rawInput: PlanningInput, now: Date = new Date()): PlanningResult {
  // Rampe de départ (spec 2026-09-25) : l'obligation de placement porte sur
  // la DOSE de la semaine, pas sur la cible complète. Toute la suite du moteur
  // — faisabilité, rythme, quota — voit la dose ; la cible reste dans le
  // contrat, et l'écart se montre comme une progression.
  const events = rawInput.sessionEvents
  const objectiveDoses: Record<string, { dose: number; cible: number }> = {}
  for (const o of rawInput.objectives) {
    if (!events) {
      objectiveDoses[o.id] = { dose: o.weeklyTargetMinutes, cible: o.weeklyTargetMinutes }
      continue
    }
    // Figée pour la semaine : mesurée sur ce qui précède le lundi, jamais
    // recalculée d'un jour à l'autre.
    const t = tenue(events.filter(apprenable), o.id, startOfWeek(rawInput.today))
    objectiveDoses[o.id] = {
      dose: doseSemaine(o.weeklyTargetMinutes, t.tenuRecent, t.tauxTenue, t.observations),
      cible: o.weeklyTargetMinutes,
    }
  }
  const input: PlanningInput = {
    ...rawInput,
    objectives: rawInput.objectives.map((o) => ({ ...o, weeklyTargetMinutes: objectiveDoses[o.id]!.dose })),
  }
  const learn = events ? buildLearningContext(events.filter(apprenable), rawInput.today, rawInput.schedule, objectiveDoses) : null

  const dates = datesBetween(input.today, input.rangeEnd)
  const nowMinute = dateKey(now) === input.today ? now.getHours() * 60 + now.getMinutes() : 0

  const windowAt = windowLookup(buildWindowMap(input.observations))

  // B.5 : une tâche découpée devient un simple regroupement visuel. Ce sont
  // ses sous-parties qui portent le travail — la compter aussi doublerait la
  // charge.
  const groupIds = new Set(
    input.tasks.map((t) => t.parentTaskId).filter((id): id is string => id !== null),
  )
  const activeTasks = input.tasks.filter((t) => t.status === 'active' && !groupIds.has(t.id))

  // ─── B. Ce qu'il reste à placer ─────────────────────────────────────────
  //
  // `remainingMinutes` est le travail restant suivi par le store : déjà
  // corrigé par le facteur à la création (B.1/B.4), puis décrémenté au fil des
  // sessions. Quand une mesure de session existe (B.2), elle prime sur toute
  // comptabilité : c'est du temps réellement passé, pas une déclaration.
  const needByTask = new Map<string, number>()
  for (const task of activeTasks) {
    needByTask.set(task.id, remainingWorkFor(task, input.durationSource))
  }

  const ancresFor = (dow: number): AncreItem[] =>
    input.ancres.filter((a) => a.daysOfWeek.includes(dow))

  // D.7 : le retard est MESURÉ par le composant « Je commence », jamais déduit
  // ici. Sans ce composant, il n'y a pas de retard connu — et surtout pas un
  // retard supposé (G.3).
  const delayFor = (date: string): number =>
    Math.max(0, input.confirmationSource?.getDelayMinutes(date) ?? 0)
  const neverConfirmed = (date: string, kind: PlacedBlock['kind'], refId: string): boolean =>
    input.confirmationSource?.wasNeverConfirmed(date, kind, refId) ?? false

  // A.2.1 : seuil de fragment personnalisé dès 5 observations, défaut sinon.
  const fragmentThreshold = Math.min(
    measureFragmentThreshold(input.observations, 'routine').threshold,
    measureFragmentThreshold(input.observations, 'novel').threshold,
  )

  // ─── A + E. Capacité de chaque jour ─────────────────────────────────────
  //
  // `crisisDates` ne contient que des jours dont la crise est PROUVÉE (densité
  // > 1, C.2). C'est la seule clé qui ouvre les deux réductions permises : la
  // version minimale d'une ancre (D.3) et la zone de réveil rognée (A.2).
  // Jours libres acceptés : aucune tâche, aucun objectif ; les ancres restent
  // en version minimale (D.3) — ce sont les déclencheurs des habitudes.
  const freeDays = new Set(input.freeDays ?? [])
  const buildDayFor = (date: string, crisisDates: Set<string>, fullDay = false): DayCapacity => {
    const day = buildDayForRaw(date, crisisDates, fullDay)
    return freeDays.has(date) ? { ...day, effectiveCapacityMinutes: 0, freeDay: true } : day
  }
  const buildDayForRaw = (date: string, crisisDates: Set<string>, fullDay = false): DayCapacity => {
    const dow = dayOfWeek(date)
    // Une occurrence unique (date renseignée) ne compte que ce jour-là ; une
    // entrée récurrente (le défaut historique) compte chaque semaine.
    const entries = scheduleEntriesForDate(input.schedule, date, dow)
    const isCrisis = crisisDates.has(date)
    const dayAncres = ancresFor(dow).map((a) =>
      // D.3 : la version minimale ne répond qu'à la saturation réelle du jour,
      // ou à un jour libre accepté.
      isCrisis || freeDays.has(date) ? { ...a, normalMaxMinutes: a.minimumMinutes } : a,
    )
    // A.2 : 30 min protégées après le lever ; 10 seulement si la crise est
    // prouvée — jamais moins, et l'écart reste chiffré sur le jour (C.3).
    const wakeZoneMinutes = wakeZoneFor(isCrisis)
    // Aujourd'hui seulement : rien avant "maintenant" n'est placeable — le
    // temps déjà passé ne peut plus accueillir un nouveau bloc (D.9). Un jour
    // futur (ou un jour écoulé reconstruit pour E.3, toujours strictement
    // avant `input.today`) garde ses créneaux entiers.
    //
    // Câblé UNIFORMÉMENT pour tous les consommateurs — renderer ET horloge de
    // planification (`plan-runner.ts`). Une version précédente ne clippait que
    // pour le renderer : l'horloge gardait alors une vue non clippée pour
    // détecter les fenêtres fermées, mais ça la faisait vivre dans un plan
    // différent de celui affiché à l'écran (un plan encore ancré au matin
    // alors que l'écran montrait déjà la soirée) — une fois les créneaux du
    // matin refermés dans SA vue à elle, elle n'avait plus jamais rien à
    // observer, et l'overlay ne s'est déclenché qu'une seule fois de toute la
    // journée du 2026-08-22. La détection des fenêtres fermées vit maintenant
    // dans `observedPending` (mémoire explicite, `@shared/planning/clock.ts`), plus dans
    // une deuxième vue du plan — donc les deux consommateurs peuvent enfin
    // partager la même.
    const notBeforeMinute = date === input.today && !fullDay ? nowMinute : undefined

    const restFloor = computeRestFloor(
      buildDayCapacity({
        date,
        dayOfWeek: dow,
        entries,
        ancres: dayAncres,
        restReservedMinutes: 0,
        fatiguePenaltyMinutes: 0,
        fragmentThreshold,
        wakeZoneMinutes,
        notBeforeMinute,
        windowAt,
      }).rawCapacityMinutes,
    )

    // E.4 : la fatigue se mesure sur les jours écoulés, jamais sur une
    // projection — sans mesure, pas de pénalité (G.3).
    const history = pastUtilization(date, input.dailyUtilization)
    const effectiveCapacityBeforePenalty = buildDayCapacity({
      date,
      dayOfWeek: dow,
      entries,
      ancres: dayAncres,
      restReservedMinutes: restFloor,
      fatiguePenaltyMinutes: 0,
      fragmentThreshold,
      wakeZoneMinutes,
      notBeforeMinute,
      windowAt,
    }).effectiveCapacityMinutes

    // E.4 : une crise PROUVÉE (densité > 1) rogne partiellement la protection
    // de fatigue, sans jamais l'annuler — plancher absolu à 60 % de la
    // capacité normale. Les deux versions sont calculées pour que l'écart
    // rendu par ce plancher soit chiffré, jamais silencieux (C.3).
    const fatigueSansCrise = computeFatigue({
      consecutiveHighDays: history,
      effectiveCapacityBeforePenalty,
      isCrisis: false,
    })
    const fatigue = computeFatigue({
      consecutiveHighDays: history,
      effectiveCapacityBeforePenalty,
      isCrisis,
    })

    // D.7 : le retard entre en DERNIER, après la fatigue. La pénalité de
    // fatigue se calcule sur la capacité d'avant le retard — sinon un jour
    // retardé recevrait mécaniquement moins de protection de fatigue, ce qui
    // inverserait le sens des deux mécanismes.
    return buildDayCapacity({
      date,
      dayOfWeek: dow,
      entries,
      ancres: dayAncres,
      restReservedMinutes: restFloor,
      fatiguePenaltyMinutes: fatigue.penaltyMinutes,
      fatigueCrisisReliefMinutes: fatigueSansCrise.penaltyMinutes - fatigue.penaltyMinutes,
      fragmentThreshold,
      wakeZoneMinutes,
      delayMinutes: delayFor(date),
      notBeforeMinute,
      windowAt,
    })
  }

  const buildCapacities = (crisisDates: Set<string>): DayCapacity[] =>
    dates.map((date) => buildDayFor(date, crisisDates))

  let capacities = buildCapacities(new Set())

  const dailyPoints = (caps: DayCapacity[]): DayCapacityPoint[] =>
    caps.map((c) => ({ date: c.date, capacityMinutes: c.effectiveCapacityMinutes }))

  const feasibilityInput = () =>
    activeTasks.map((t) => ({
      title: t.title,
      deadline: t.deadline,
      remainingMinutes: needByTask.get(t.id) ?? t.remainingMinutes,
    }))

  // ─── C.2. Test de charge, puis D.3 saturation réelle ────────────────────
  let feasibility = buildFeasibilityResult({
    tasks: feasibilityInput(),
    dailyCapacity: dailyPoints(capacities),
    today: input.today,
  })

  // Un jour est vraiment saturé quand une deadline prouvée en déficit le
  // recouvre. Recalculé frais chaque jour, jamais déduit d'un historique.
  const saturated = new Set<string>()
  for (const d of feasibility.densities) {
    if (d.feasible) continue
    for (const date of dates) if (date <= d.deadline) saturated.add(date)
  }

  if (saturated.size > 0) {
    capacities = buildCapacities(saturated)
    feasibility = buildFeasibilityResult({
      tasks: feasibilityInput(),
      dailyCapacity: dailyPoints(capacities),
      today: input.today,
    })
  }

  // ─── E.3. Respiration hebdomadaire ──────────────────────────────────────
  // Les jours écoulés de la semaine ne sont pas dans `capacities` (l'horizon
  // part d'aujourd'hui) : ils sont reconstruits avec la même recette que les
  // jours à venir, pour que leur capacité soit mesurée et non supposée.
  const breathing = applyWeeklyBreathing({
    capacities,
    input,
    buildDay: (date) => buildDayFor(date, saturated),
  })

  // D.4/E.3 : la semaine est calendaire (lundi → dimanche). La moyenne sert
  // uniquement à savoir si un jour est plus libre ou plus chargé que les
  // autres — le rythme quotidien, lui, reste la cible ÷ 7.
  const averageCapacityByWeek = averageEffectiveCapacityByWeek(capacities)

  // ─── C.1 + D.6. Marges et cascade ───────────────────────────────────────
  const withMargin: TaskWithMargin[] = activeTasks.map((t) => {
    const need = needByTask.get(t.id) ?? t.remainingMinutes
    return {
      ...t,
      remainingMinutes: need,
      ...computeMargin(minutesUntilEndOf(t.deadline, input.today, nowMinute), need),
    }
  })
  const ordered = sortTasksByCascade(withMargin)

  // B.5.1 : les parties dont une sœur antérieure n'est pas encore TERMINÉE
  // (statut stocké, pas le compteur de cette passe). Elles sont bien placées —
  // il faut voir où elles tomberont — mais en aperçu : ni confirmation, ni
  // blocage, ni crédit de travail.
  const previewTaskIds = new Set(
    activeTasks.filter((t) => isPartLocked(t, activeTasks)).map((t) => t.id),
  )

  // ─── D.1. Placement, dans l'ordre de l'immobilité ───────────────────────
  const blocks: PlacedBlock[] = []
  const placedByTask = new Map<string, number>()

  // D.4 : le compteur d'un objectif est CALENDAIRE. `weeklyObjectiveServed`
  // décrit la semaine en cours, pas les suivantes : passé le dimanche, la
  // semaine repart de zéro et la cadence normale revient d'elle-même le lundi.
  const currentWeek = startOfWeek(input.today)
  const servedKey = (week: string, objectiveId: string) => `${week}|${objectiveId}`
  const objectiveServed = new Map<string, number>(
    Object.entries(input.weeklyObjectiveServed).map(([id, minutes]) => [
      servedKey(currentWeek, id),
      minutes,
    ]),
  )
  // C.4 : photo de départ des compteurs, pour mesurer ce qui a réellement été
  // débité une fois le placement terminé.
  const objectiveServedAtStart = new Map(objectiveServed)
  const remainingNeed = new Map(needByTask)

  // C.4 : la part de la session confirmée qui reste à produire. Elle débite
  // bien les compteurs de source, mais son bloc n'est PAS une décision de la
  // cascade (il était déjà là) : sans ce report explicite, les deux côtés de
  // la comptabilité en partie double divergeraient d'exactement ce montant.
  let pinnedWorkMinutes = 0

  // Les promesses débitent leur source AVANT tout placement : sinon les jours
  // qui les précèdent placeraient déjà ce travail, et il le serait deux fois.
  for (const p of input.promises ?? []) {
    if (!dates.includes(p.date)) continue
    const end = Math.min(1440, p.startMinute + p.minutes)
    if (p.date === input.today && end <= nowMinute) continue
    const work = end - p.startMinute
    if (p.kind === 'task') {
      if (!activeTasks.some((t) => t.id === p.refId)) continue
      const left = remainingNeed.get(p.refId)
      if (left !== undefined) {
        const debit = Math.min(left, work)
        remainingNeed.set(p.refId, left - debit)
        placedByTask.set(p.refId, (placedByTask.get(p.refId) ?? 0) + debit)
        pinnedWorkMinutes += debit
      }
    } else if (input.objectives.some((o) => o.id === p.refId)) {
      const key = servedKey(startOfWeek(p.date), p.refId)
      objectiveServed.set(key, (objectiveServed.get(key) ?? 0) + work)
      pinnedWorkMinutes += work
    }
  }

  // Placement par score : le chronotype s'estime sans question, depuis le
  // milieu du sommeil — celui des jours libres d'abord (méthode de Munich).
  const midSleepMinute = estimateMidSleep(input.schedule, dates)
  // La constance : même heure par type de jour (jours occupés / jours libres),
  // lue dans l'HISTOIRE — la médiane des vrais départs. Jamais tirée du
  // placement du jour, qui dépend de l'heure du calcul.
  const habitual = learn ? learn.habitual : new Map<string, number>()
  // Les jours off se choisissent sur des journées ENTIÈRES : aujourd'hui,
  // rogné par « maintenant », serait sinon choisi comme jour off chaque soir.
  // Sa capacité pleine est celle du même jour la semaine prochaine (l'horaire
  // est hebdomadaire) — jamais celle qui reste.
  const capaciteJourEntier = learn
    ? capacities.map((c) => (c.date === input.today ? buildDayFor(c.date, saturated, true) : c))
    : capacities

  for (let di = 0; di < dates.length; di++) {
    const date = dates[di]!
    const cap = capacities[di]!
    const dow = cap.dayOfWeek
    const allocator = new DayAllocator(cap.slots, windowAt)
    const dayEntries = scheduleEntriesForDate(input.schedule, date, dow)
    const wakes = wakeMinutes(dayEntries)
    const wakeMinute = wakes.length ? Math.min(...wakes) : null
    const dayType = dayEntries.some((e) => e.categoryType === 'school' || e.categoryType === 'work') ? 'busy' : 'free'
    // Les séances déjà vécues aujourd'hui comptent dans l'écart de 3 h : un
    // objectif arrêté ou fini ne revient pas à l'écran dans la minute.
    const placedToday: Array<{ refId: string; startMinute: number; endMinute: number; work: number }> =
      date === input.today && events
        ? events
            .filter((e) => e.date === date && e.started)
            .map((e) => {
              const start = e.plannedStartMinute + (e.delayMinutes ?? 0)
              const held = e.heldMinutes ?? e.plannedMinutes
              return { refId: e.refId, startMinute: start, endMinute: start + held, work: held }
            })
        : []
    // Arrêté par « Stop » aujourd'hui : l'engagement ne revient pas dans
    // l'heure — sinon le reste de la tâche se reposerait à « maintenant » et
    // l'overlay redemanderait aussitôt ce qu'on vient de refuser.
    const stoppedUntil = new Map<string, number>()
    if (date === input.today && events) {
      for (const e of events) {
        if (e.date !== date || !e.stop) continue
        const end = e.plannedStartMinute + (e.delayMinutes ?? 0) + (e.heldMinutes ?? 0)
        stoppedUntil.set(e.refId, Math.max(stoppedUntil.get(e.refId) ?? 0, end + 60))
      }
    }
    const loadBefore = (start: number) =>
      dayEntries
        .filter((e) => (e.categoryType === 'school' || e.categoryType === 'work') && e.startMinute < start)
        .reduce((t, e) => t + Math.min(e.endMinute, start) - e.startMinute, 0) +
      placedToday.filter((b) => b.endMinute <= start).reduce((t, b) => t + b.work, 0)
    const dayIsCrisis = saturated.has(date)
    // Déclencheurs-événements du jour : le premier créneau libre après une
    // obligation ou une ancre — jamais le réveil, qui a sa propre règle.
    // Un déclencheur nommé (plan si-alors) : le premier créneau libre qui suit
    // CET événement-là. Sinon, la fin de n'importe quelle obligation.
    const nommes = (input.triggerLabels ?? []).map((l) => l.trim().toLowerCase()).filter(Boolean)
    const finsNommees = nommes.length
      ? [
          ...dayEntries.filter((e) => nommes.includes(e.label.trim().toLowerCase())).map((e) => e.endMinute),
          ...ancresFor(dow)
            .filter((a) => nommes.includes(a.name.trim().toLowerCase()))
            .map((a) => a.anchorMinute + a.normalMaxMinutes),
        ]
      : null
    const dayTriggerStarts = (
      finsNommees
        ? finsNommees
            .map((fin) => cap.slots.find((s) => s.startMinute >= fin)?.startMinute)
            .filter((x): x is number => x !== undefined)
        : cap.slots.map((s) => s.startMinute)
    )
      .filter((start) => wakeMinute === null || start > wakeMinute + 60)
      // Le créneau coupé à « maintenant » ne suit aucun événement.
      .filter((start) => !(date === input.today && start === nowMinute))
    const scorer = (
      refId: string,
      session: number,
      hardGap: number,
      softGap = true,
      category?: string,
      family?: { ids: ReadonlySet<string>; notBefore?: number },
    ) => {
      const key = `${refId}|${dayType}|${session}`
      // Les parties d'une même tâche s'écartent entre elles comme les blocs
      // d'une seule tâche : c'est le même travail.
      const sameRefToday = placedToday.filter((b) => b.refId === refId || family?.ids.has(b.refId))
      const stopped = stoppedUntil.get(refId)
      const notBefore =
        family?.notBefore === undefined ? stopped : Math.max(stopped ?? 0, family.notBefore)
      const learnedQuality = learn && category ? learn.quality(category, date, dow, dayIsCrisis) : undefined
      const triggerStarts = learn && learn.phase(refId) >= 2 ? dayTriggerStarts : undefined
      return (start: number, minutes: number) =>
        scoreSlot(start, minutes, {
          windowAt,
          learnedQuality,
          triggerStarts,
          wakeMinute,
          midSleepMinute,
          habitualStart: habitual.get(key) ?? null,
          sameRefToday,
          hardGapMinutes: hardGap,
          softGap,
          // La première heure après le réveil : interdite, sauf crise prouvée.
          inertiaHard: !dayIsCrisis,
          eveningPenalty: learn?.eveningPenalty(refId),
          comfort: learn?.comfort(refId),
          notBefore,
          loadBefore,
        })
    }
    const remember = (refId: string, start: number, end: number, work: number) => {
      placedToday.push({ refId, startMinute: start, endMinute: end, work })
    }
    let budget = cap.effectiveCapacityMinutes

    // D.5/A.4 : budget profond du jour — 2 blocs de 90 min, PARTAGÉ entre les
    // tâches ET les objectifs. Les ancres n'y touchent jamais : elles sont
    // placées avant, par immobilité (D.1). Une fois le budget consommé, le
    // travail suivant se place en fenêtre NORMALE/BASSE — jamais bloqué.
    let deepWindowMinutes = 0

    // D.1.1 La réalité fixe est déjà hors des créneaux (A.1).

    // D.1.1bis LA SESSION CONFIRMÉE EN COURS — plus immobile encore qu'une
    // ancre : elle ne va pas se produire, elle se produit. Elle est donc posée
    // AVANT tout le reste, à son heure réelle, et son créneau est retiré de la
    // journée pour que rien d'autre ne vienne s'y superposer.
    //
    // Sans cet épinglage, chaque recalcul (toutes les 5 s) reposait le bloc en
    // cours à « maintenant » — `notBeforeMinute` (D.9) interdisant le passé —
    // et il glissait à l'infini : 71 confirmations pour un seul objectif le
    // 2026-08-23, une par minute, jamais aucune minute de travail créditée.
    const session = date === input.today ? (input.activeSession ?? null) : null
    if (session !== null) {
      const source =
        session.kind === 'task'
          ? activeTasks.find((t) => t.id === session.refId)
          : session.kind === 'objective'
            ? input.objectives.find((o) => o.id === session.refId)
            : ancresFor(dow).find((a) => a.id === session.refId)

      if (source !== undefined) {
        allocator.reserve(session.startMinute, session.endMinute)
        if (session && !placedToday.some((b) => b.refId === session.refId && b.startMinute <= session.startMinute && session.startMinute < b.endMinute)) {
        placedToday.push({ refId: session.refId, startMinute: session.startMinute, endMinute: session.endMinute, work: session.workMinutes })
      }
      blocks.push({
          id: session.blockId,
          date,
          startMinute: session.startMinute,
          endMinute: session.endMinute,
          durationMinutes: session.endMinute - session.startMinute,
          breakMinutes: session.endMinute - session.startMinute - session.workMinutes,
          workMinutes: session.workMinutes,
          kind: session.kind,
          refId: session.refId,
          label: 'title' in source ? source.title : source.name,
          color: 'color' in source && typeof source.color === 'string' ? source.color : COULEUR_TACHE,
          cognitiveWindow: windowAt(Math.floor(session.startMinute / 60)),
          confirmed: true,
          appsToBlock: source.appsToBlock,
        })

        // Ce que cette session va ENCORE produire — les minutes déjà écoulées
        // sont créditées en continu par l'horloge et ont donc déjà fait
        // baisser le besoin restant. Ne débiter que le reste évite de compter
        // deux fois les mêmes minutes.
        const workEnd = session.startMinute + session.workMinutes
        const stillToCome = Math.max(0, Math.min(workEnd - nowMinute, session.workMinutes))

        budget = Math.max(0, budget - (session.endMinute - session.startMinute))
        if (session.kind === 'task') {
          const left = remainingNeed.get(session.refId)
          if (left !== undefined) {
            const debit = Math.min(left, stillToCome)
            remainingNeed.set(session.refId, left - debit)
            placedByTask.set(session.refId, (placedByTask.get(session.refId) ?? 0) + debit)
            pinnedWorkMinutes += debit
          }
        } else if (session.kind === 'objective') {
          const key = servedKey(startOfWeek(date), session.refId)
          objectiveServed.set(key, (objectiveServed.get(key) ?? 0) + stillToCome)
          pinnedWorkMinutes += stillToCome
        }
      }
    }

    // D.1.1ter LES PROMESSES — un rattrapage choisi après un Stop se tient à
    // l'heure choisie. Posé comme une ancre ; il débite le besoin de sa
    // source comme la session en cours, pour ne pas être placé deux fois.
    for (const p of input.promises ?? []) {
      if (p.date !== date) continue
      const id = `promesse-${p.id}`
      if (session?.blockId === id) continue
      const end = Math.min(1440, p.startMinute + p.minutes)
      if (date === input.today && end <= nowMinute) continue
      const source =
        p.kind === 'task' ? activeTasks.find((t) => t.id === p.refId) : input.objectives.find((o) => o.id === p.refId)
      if (source === undefined) continue
      allocator.reserve(p.startMinute, end)
      const work = end - p.startMinute
      blocks.push({
        id,
        date,
        startMinute: p.startMinute,
        endMinute: end,
        durationMinutes: work,
        breakMinutes: 0,
        workMinutes: work,
        kind: p.kind,
        refId: p.refId,
        label: 'title' in source ? source.title : source.name,
        color: 'color' in source && typeof source.color === 'string' ? source.color : COULEUR_TACHE,
        cognitiveWindow: windowAt(Math.floor(p.startMinute / 60)),
        appsToBlock: source.appsToBlock,
        promiseId: p.id,
      })
      budget = Math.max(0, budget - work)
      placedToday.push({ refId: p.refId, startMinute: p.startMinute, endMinute: end, work })
    }

    // D.1.2 ANCRES — heure fixe, gelées, jamais déplacées.
    for (const ancre of ancresFor(dow)) {
      const reduced = saturated.has(date) || freeDays.has(date)
      const duration = reduced ? ancre.minimumMinutes : ancre.normalMaxMinutes
      allocator.reserve(ancre.anchorMinute, ancre.anchorMinute + duration)
      blocks.push({
        id: `ancre-${ancre.id}-${date}`,
        date,
        startMinute: ancre.anchorMinute,
        endMinute: ancre.anchorMinute + duration,
        durationMinutes: duration,
        breakMinutes: 0,
        workMinutes: duration,
        kind: 'ancre',
        refId: ancre.id,
        label: ancre.name,
        color: ancre.color,
        cognitiveWindow: windowAt(Math.floor(ancre.anchorMinute / 60)),
        reducedToMinimum: reduced,
        // D.8 : une ancre passe elle aussi par « Je commence » — uniquement
        // pour déclencher son blocage et mesurer sa confirmation. Jamais
        // confirmée, elle alimente le signal « ancre ratée » (C.3.4, signal 2)
        // et RIEN d'autre : aucun débit de repos ni de capacité (D.7).
        neverConfirmed: neverConfirmed(date, 'ancre', ancre.id) || undefined,
        appsToBlock: ancre.appsToBlock,
      })
    }

    // D.1.3 Le repos réservé est déjà retiré de la capacité effective (E.2).

    // D.2 Préemption : le quota d'un objectif cède une part CROISSANTE à la
    // tâche en tension — jamais tout ou rien. Jamais le sommeil, une ancre ni
    // le plancher de repos. Le déclencheur est la tension du jour (densité
    // C.2 la plus haute parmi les échéances qui le couvrent), pas la marge
    // d'une seule tâche : une tâche déjà prouvée en retard (marge < 0)
    // implique mécaniquement une tension > 100 % sur son échéance, donc
    // `stolen` vaut déjà 1 dans ce cas — rien n'est perdu par rapport à
    // l'ancien comportement, la zone 85-100 % est simplement couverte en plus.
    const stolen = stolenFraction(tensionFor(date, feasibility.densities))

    // D.7 : ordre de sacrifice quand un retard a rogné la journée — l'INVERSE
    // de l'ordre de placement (D.6). Ce qui a le PLUS de marge cède en
    // premier : d'abord les objectifs les plus en avance sur leur rythme, dont
    // le quota se reporte par le mécanisme D.4 déjà en place ; ensuite
    // seulement les tâches, replacées sur un autre jour par le fonctionnement
    // normal du moteur (leur budget a déjà fondu, rien à coder de plus) ; les
    // ancres, jamais — elles sont déjà hors capacité (A.1) et leur propre échec
    // suit un tout autre chemin (D.8).
    //
    // Le sacrifice s'arrête dès que le compte y est : jamais plus large que
    // nécessaire.
    let sacrificeLeft = cap.delayExcessMinutes
    const week = startOfWeek(date)
    const objectivesBySacrificeOrder =
      sacrificeLeft > 0
        ? [...input.objectives].sort(
            (a, b) =>
              rhythmMargin(b, objectiveServed.get(servedKey(week, b.id)) ?? 0, date) -
              rhythmMargin(a, objectiveServed.get(servedKey(week, a.id)) ?? 0, date),
          )
        : input.objectives

    // D.1.4 OBJECTIFS — quota du jour, de préférence en fenêtre PROFONDE.
    for (const objective of objectivesBySacrificeOrder) {
      const lastServed = input.objectiveLastServed[objective.id]
      const key = servedKey(week, objective.id)
      let quota = computeObjectiveQuota({
        objective,
        servedThisWeekMinutes: objectiveServed.get(key) ?? 0,
        todayCapacityMinutes: cap.effectiveCapacityMinutes,
        averageDayCapacityMinutes: averageCapacityByWeek.get(week) ?? 0,
        daysSinceLastService: lastServed ? Math.max(0, daysBetween(lastServed, date)) : 0,
        activeDaysPerWeek: learn ? learn.activeDays(objective.id) : undefined,
      })
      if (learn && learn.isDayOff(objective.id, date, capaciteJourEntier)) quota = 0

      // D.2 : part progressive cédée à la tâche en tension (85-100 % de
      // densité C.2). Débit AVANT celui de D.7 juste en dessous : deux causes
      // indépendantes de perte de quota, chacune calculée sur le quota
      // "normal" du jour, jamais l'une sur le résultat de l'autre.
      quota = Math.round(quota * (1 - stolen))

      // D.7 : le quota cédé n'est pas perdu — il est REPORTÉ. D.4 le
      // redistribue sur les jours restants de la semaine (2 jours de report
      // au plus), exactement comme n'importe quel quota non servi.
      if (sacrificeLeft > 0) {
        const given = Math.min(quota, sacrificeLeft)
        quota -= given
        sacrificeLeft -= given
      }

      let left = Math.min(quota, budget)
      // Au plus 2 séances par objectif et par jour, à 3 h d'écart au moins.
      // Si le quota tient en un bloc, une seule. Ce qui ne trouve pas sa place
      // part dans le report de D.4 — jamais en blocs collés.
      // Les séances déjà vécues aujourd'hui (journal) comptent dans le plafond.
      let session = placedToday.filter((b) => b.refId === objective.id).length
      while (
        left >= TASK_CONSTANTS.minBlockMinutes &&
        session < SCORE_DEFAULTS.maxSessionsPerObjectivePerDay
      ) {
        const objCategory = `objectif:${objective.id}`
        // Le plafond : la plus longue des tranches ; la longueur de CHAQUE départ
        // est ensuite celle de sa tranche (lengthAt).
        const work = Math.min(left, learn ? learn.blockMaxToutesTranches(objective.id, objCategory) : TASK_CONSTANTS.targetBlockMinutes)
        const footprint = footprintFor(work)
        const deepExhausted = deepWindowMinutes + work > DEEP_BUDGET_MINUTES
        const slot = allocator.take(Math.min(footprint, budget), {
          avoid: deepExhausted ? 'PROFONDE' : undefined,
          score: scorer(objective.id, session, SCORE_DEFAULTS.minGapSameObjective, true, objCategory),
          // La longueur apprise suit la tranche horaire du départ choisi.
          ...(learn
            ? { lengthAt: (start: number) => footprintFor(Math.min(left, learn.blockMax(objective.id, objCategory, trancheDe(start)))) }
            : {}),
        })
        if (!slot) break
        session++

        const size = slot.endMinute - slot.startMinute
        const brk = size - workOfFootprint(size)
        const workMinutes = size - brk

        blocks.push({
          // Stable entre deux calculs : `slot.startMinute` ne dépend que du
          // placement du jour, jamais de l'ordre dans lequel les blocs ont
          // été poussés. La confirmation de session (D.7/D.8) a besoin de
          // reconnaître « le même bloc » d'un tic à l'autre.
          id: `obj-${objective.id}-${date}-${slot.startMinute}`,
          date,
          startMinute: slot.startMinute,
          endMinute: slot.endMinute,
          durationMinutes: size,
          breakMinutes: brk,
          workMinutes,
          kind: 'objective',
          refId: objective.id,
          label: objective.name,
          color: objective.color,
          cognitiveWindow: slot.cognitiveWindow,
          neverConfirmed: neverConfirmed(date, 'objective', objective.id) || undefined,
          appsToBlock: objective.appsToBlock,
          category: `objectif:${objective.id}`,
          breakAtMinute: learn?.pause(objective.id, size),
        })

        if (slot.cognitiveWindow === 'PROFONDE') deepWindowMinutes += workMinutes
        remember(objective.id, slot.startMinute, slot.endMinute, workMinutes)
        budget -= size
        left -= workMinutes
        objectiveServed.set(key, (objectiveServed.get(key) ?? 0) + workMinutes)
      }
    }

    // D.1.5 TÂCHES — cascade D.6, découpage encouragé, plafond 40 %.
    // La cible du jour se calcule pour la tâche ENTIÈRE, parties comprises :
    // jugée partie par partie, chacune se croyait à l'aise (4 h sur 10 jours)
    // et la pression n'apparaissait qu'au dernier jour, qui recevait tout.
    const familyLeft = new Map<string, { left: number; capOverride: boolean; ids: ReadonlySet<string> }>()
    for (const task of ordered) {
      if (budget < TASK_CONSTANTS.minBlockMinutes) break
      const need = remainingNeed.get(task.id) ?? 0
      if (need <= 0) continue
      // Rien n'est placé après la deadline : ce serait un plan qui ment.
      if (date > task.deadline) continue

      // B.5.1 : une partie ne reçoit AUCUNE minute tant qu'une sœur de rang
      // antérieur n'a pas reçu la totalité des siennes. Le test porte sur
      // `remainingNeed` — le compteur VIVANT de cette passe de calcul, qui se
      // vide au fil des jours — et non sur le statut stocké : c'est ce qui
      // force la Partie 1 à se remplir sur tout l'horizon avant que la
      // Partie 2 n'obtienne son premier créneau. Sans ça, la boucle par jour
      // servait chaque partie un peu chaque jour : exactement le travail en
      // parallèle que le découpage doit empêcher.
      if (waitsForEarlierSibling(task, ordered, remainingNeed)) continue

      const familyKey = task.parentTaskId ?? task.id
      let family = familyLeft.get(familyKey)
      if (!family) {
        const members = task.parentTaskId === null ? [task] : ordered.filter((t) => t.parentTaskId === task.parentTaskId)
        const deadline = members.reduce((d, t) => (t.deadline > d ? t.deadline : d), task.deadline)
        const remainingDayCapacities = capacities
          .filter((c) => c.date >= date && c.date <= deadline)
          .map((c) => c.effectiveCapacityMinutes)
        // Une échéance au-delà de l'horizon calculé : les jours qui manquent
        // comptent aussi, à la capacité moyenne de l'horizon. Sans eux, 28 h
        // dues dans 10 jours se tassaient dans les 7 jours visibles.
        if (deadline > input.rangeEnd && capacities.length > 0) {
          const moyenne = capacities.reduce((t, c) => t + c.effectiveCapacityMinutes, 0) / capacities.length
          for (let k = daysBetween(input.rangeEnd, deadline); k > 0; k--) remainingDayCapacities.push(moyenne)
        }
        const { target, capOverride } = computeTaskDayTarget({
          remainingNeed: members.reduce((s, t) => s + (remainingNeed.get(t.id) ?? 0), 0),
          dayCapacity: cap.effectiveCapacityMinutes,
          remainingDayCapacities,
          isCrisis: members.some((t) => t.marginMinutes < 0),
        })
        family = { left: target, capOverride, ids: new Set(members.map((t) => t.id)) }
        familyLeft.set(familyKey, family)
      }
      // B.5.1 dans la journée aussi : une partie commence après la fin de
      // celles qui la précèdent, jamais plus tôt sur l'horloge.
      const earlierIds = new Set(
        ordered
          .filter((t) => task.parentTaskId !== null && t.parentTaskId === task.parentTaskId && (t.partOrder ?? 0) < (task.partOrder ?? 0))
          .map((t) => t.id),
      )
      const earlierEnd = placedToday.filter((b) => earlierIds.has(b.refId)).reduce<number | undefined>((m, b) => Math.max(m ?? 0, b.endMinute), undefined)
      const familyScore = { ids: family.ids, notBefore: earlierEnd }
      const capOverride = family.capOverride

      // Une miette sous 25 min ne se place jamais seule : le bloc la prend.
      let dayTarget = absorbCrumb(Math.min(family.left, need), need)
      while (
        dayTarget >= TASK_CONSTANTS.minBlockMinutes &&
        budget >= TASK_CONSTANTS.minBlockMinutes
      ) {
        const work = absorbCrumb(
          Math.min(dayTarget, learn ? learn.blockMaxToutesTranches(task.id, task.category) : TASK_CONSTANTS.targetBlockMinutes),
          remainingNeed.get(task.id) ?? 0,
        )

        let footprint = Math.min(footprintFor(work), budget)
        if (footprint > allocator.largestFree()) footprint = allocator.largestFree()
        // Raccourci par la place du jour, le bloc ne doit pas laisser derrière
        // lui une miette qu'aucun bloc ne pourra plus jamais prendre.
        const crumb = (remainingNeed.get(task.id) ?? 0) - workOfFootprint(footprint)
        if (crumb > 0 && crumb < TASK_CONSTANTS.minBlockMinutes) footprint -= TASK_CONSTANTS.minBlockMinutes - crumb
        if (workOfFootprint(footprint) < TASK_CONSTANTS.minBlockMinutes) break

        // D.5 : le budget profond du jour est déjà partagé avec les objectifs.
        // Épuisé, il ne bloque rien : le bloc part en fenêtre NORMALE/BASSE.
        const taskSession = placedToday.filter((b) => b.refId === task.id).length
        const slot = allocator.take(footprint, {
          avoid: deepWindowMinutes + work > DEEP_BUDGET_MINUTES ? 'PROFONDE' : undefined,
          score: scorer(task.id, taskSession, 0, task.marginMinutes >= 0, task.category, familyScore),
          ...(learn
            ? {
                lengthAt: (start: number) =>
                  Math.min(footprint, footprintFor(absorbCrumb(Math.min(dayTarget, learn.blockMax(task.id, task.category, trancheDe(start))), remainingNeed.get(task.id) ?? 0))),
              }
            : {}),
        })
        if (!slot) break

        const size = slot.endMinute - slot.startMinute
        const brk = size - workOfFootprint(size)
        const workMinutes = size - brk

        blocks.push({
          // Même raison que pour les objectifs juste au-dessus : un id fondé
          // sur l'heure de placement, pas sur la position dans le tableau.
          id: `task-${task.id}-${date}-${slot.startMinute}`,
          date,
          startMinute: slot.startMinute,
          endMinute: slot.endMinute,
          durationMinutes: size,
          breakMinutes: brk,
          workMinutes,
          kind: 'task',
          refId: task.id,
          label: task.title,
          color: 'color' in task && typeof task.color === 'string' ? task.color : COULEUR_TACHE,
          cognitiveWindow: slot.cognitiveWindow,
          capOverride: capOverride || undefined,
          neverConfirmed: neverConfirmed(date, 'task', task.id) || undefined,
          preview: previewTaskIds.has(task.id) || undefined,
          appsToBlock: task.appsToBlock,
          category: task.category,
          breakAtMinute: learn?.pause(task.id, size),
        })

        if (slot.cognitiveWindow === 'PROFONDE') deepWindowMinutes += workMinutes
        remember(task.id, slot.startMinute, slot.endMinute, workMinutes)
        budget -= size
        dayTarget -= workMinutes
        family.left -= workMinutes
        remainingNeed.set(task.id, Math.max(0, (remainingNeed.get(task.id) ?? 0) - workMinutes))
        placedByTask.set(task.id, (placedByTask.get(task.id) ?? 0) + workMinutes)
      }
    }

    // E.1 : la pause vient APRÈS le travail, et seulement si quelque chose
    // commence dans les 30 min qui suivent. Sinon le bloc finit avec le travail.
    settleBreaks(blocks, date, dayEntries)
  }

  // ─── C.3.1. Un verdict par tâche, jamais un verdict binaire global ──────
  const verdicts: TaskVerdict[] = activeTasks.map((t) => {
    const needed = needByTask.get(t.id) ?? t.remainingMinutes
    const placed = placedByTask.get(t.id) ?? 0
    return {
      taskId: t.id,
      title: t.title,
      neededMinutes: needed,
      placedMinutes: placed,
      status: placed <= 0 ? 'unplaced' : placed >= needed ? 'placed' : 'partial',
    }
  })

  // ─── C.4. Contrôle post-placement ───────────────────────────────────────
  //
  // Comptabilité en partie double, et c'est tout l'intérêt : d'un côté le
  // CALENDRIER (les blocs réellement posés), de l'autre les COMPTEURS DE
  // SOURCE (besoin restant des tâches, quota servi des objectifs). Les deux
  // totaux sont agrégés par des chemins et des structures différents — un
  // bloc posé sans débit, un débit sans bloc, ou un bloc compté deux fois
  // font diverger les deux chiffres. Comparer une somme avec elle-même
  // n'aurait jamais rien pu attraper.
  const totalPlaced =
    blocks
      .filter((b) => b.kind !== 'ancre' && b.confirmed !== true && b.promiseId === undefined)
      .reduce((s, b) => s + b.workMinutes, 0) + pinnedWorkMinutes

  const debitedFromTasks = [...needByTask].reduce(
    (sum, [id, need]) => sum + (need - (remainingNeed.get(id) ?? need)),
    0,
  )
  const debitedFromObjectives = [...objectiveServed].reduce(
    (sum, [key, served]) => sum + (served - (objectiveServedAtStart.get(key) ?? 0)),
    0,
  )
  const totalDebited = debitedFromTasks + debitedFromObjectives

  // ─── C.3.4 + F.2. Signaux ───────────────────────────────────────────────
  const signals = produceSignals({
    deficits: feasibility.deficits,
    anchorMissCounts: input.anchorMissCounts,
    objectives: input.objectives.map((o) => ({
      objectiveId: o.id,
      name: o.name,
      // D.4 : une semaine partielle se juge sur les jours où l'objectif
      // existait, jamais sur les sept — sinon elle serait signalée en déficit
      // pour des jours qui ne lui appartenaient pas.
      quotaMet:
        (objectiveServed.get(servedKey(currentWeek, o.id)) ?? 0) >=
        weeklyTargetForWeekOf(o, input.today),
      daysSinceLastService: input.objectiveLastServed[o.id]
        ? daysBetween(input.objectiveLastServed[o.id]!, input.today)
        : 0,
    })),
    // D.7/C.3.4 (signal 4) : le retard répété est un signal PASSIF de plus, au
    // même titre que l'ancre ratée. Le moteur a déjà absorbé le retard dans le
    // placement — il n'y a plus rien à décider, seulement un fait à rendre
    // visible si l'utilisateur va le chercher (C.3.2).
    consecutiveDelays: input.consecutiveDelays,
    lastSignalAt: input.lastSignalAt,
    now,
  })

  const wipLimit = computeWIPLimit({
    tasksCreatedPerWeek: input.tasksCreatedPerWeek,
    targetWeeks: WIP_TARGET_WEEKS,
  })

  return {
    blocks: blocks.sort((a, b) => a.date.localeCompare(b.date) || a.startMinute - b.startMinute),
    capacities,
    feasibility,
    signals,
    verdicts,
    totalMinutesPlaced: totalPlaced,
    totalMinutesPlanned: totalDebited,
    internalError: postPlacementCheck(totalPlaced, totalDebited),
    wip: {
      activeCount: activeTasks.length,
      limit: wipLimit,
      overLimit: activeTasks.length > wipLimit,
    },
    breathing,
    objectiveDoses,
    // E.3/E.4 : la capacité de la journée ENTIÈRE d'aujourd'hui, pas celle qui
    // reste — la base de l'utilisation réelle que les horloges enregistrent.
    todayFullCapacityMinutes: dates.includes(input.today)
      ? buildDayFor(input.today, saturated, true).effectiveCapacityMinutes
      : 0,
  }
}

/**
 * D.5/B.5 : si poser ce bloc laisserait derrière lui une MIETTE — un reste
 * strictement positif mais sous le bloc minimum utile (25 min, A.2) — le bloc
 * l'avale au lieu de l'abandonner.
 *
 * Ce n'est pas un confort : sans ça, une miette n'est JAMAIS plaçable (la
 * boucle exige `>= 25`), donc le besoin de la tâche ne retombe jamais à zéro.
 * Défaut réel trouvé le 2026-08-23 en vérifiant dans le navigateur : une partie
 * de 280 minutes recevait 3 blocs de 90 (270) et gardait 10 minutes
 * increvables — la tâche ne pouvait donc plus jamais se terminer, et avec le
 * verrouillage séquentiel (B.5.1) les parties suivantes restaient bloquées POUR
 * TOUJOURS. C'est exactement le garde-fou que B.5 impose déjà au découpage
 * (« aucune sous-partie sous le seuil du fragment minimum »), appliqué ici au
 * découpage en blocs.
 *
 * Le dépassement est borné par construction : au plus 24 minutes au-dessus de
 * la cible, et il reste soumis au budget du jour et à la place réellement
 * libre — les deux clamps qui suivent l'appel.
 */
export function absorbCrumb(work: number, remainingNeed: number): number {
  const crumb = remainingNeed - work
  return crumb > 0 && crumb < TASK_CONSTANTS.minBlockMinutes ? remainingNeed : work
}

/**
 * Le travail qui reste à placer pour une tâche.
 *
 * `remainingMinutes` porte le total PLANIFIÉ, figé à la création : c'est là que
 * le facteur de correction s'applique (B.1, `addTask`), et nulle part ailleurs.
 * Le recalculer à chaque plan avec le facteur du jour ferait glisser la ligne
 * d'arrivée d'une tâche déjà commencée — le facteur bouge quand d'autres tâches
 * se terminent (B.2), ce qui n'a rien à voir avec celle-ci.
 *
 * `extraMinutes` (B.5.2) s'y ajoute, le temps déjà fait s'en retranche. C'est
 * la MÊME définition qui décide de la complétion automatique
 * (`tasksToAutoComplete`) : deux définitions divergentes feraient viser au
 * placement une cible que la complétion n'atteindrait jamais.
 */
export function remainingWorkFor(task: TaskItem, source?: DurationRealSource): number {
  return Math.max(0, plannedTotalFor(task) - (source?.getActualMinutes(task.id) ?? 0))
}

/** Le total à faire pour cette tâche : planifié à la création, plus les rallonges. */
export function plannedTotalFor(task: Pick<TaskItem, 'remainingMinutes' | 'extraMinutes'>): number {
  return task.remainingMinutes + (task.extraMinutes ?? 0)
}

/**
 * B.5.1 : cette partie doit-elle attendre qu'une sœur de rang antérieur soit
 * entièrement placée ? Contrairement à `isPartLocked` (qui regarde le statut
 * STOCKÉ pour décider de l'aperçu), ce test regarde le besoin restant de la
 * passe de calcul EN COURS — c'est ce qui sérialise les parties à l'intérieur
 * d'un même plan, sans quoi chaque journée en servirait plusieurs à la fois.
 */
function waitsForEarlierSibling(
  task: TaskWithMargin,
  ordered: TaskWithMargin[],
  remainingNeed: Map<string, number>,
): boolean {
  const order = task.partOrder
  if (task.parentTaskId === null || order === null) return false
  return ordered.some(
    (t) =>
      t.parentTaskId === task.parentTaskId &&
      t.partOrder !== null &&
      t.partOrder < order &&
      // Soupape de sécurité : un reste sous le bloc minimum ne peut plus rien
      // recevoir (la boucle de placement exige `>= 25`). `absorbCrumb` évite
      // normalement d'en produire, mais si la place manquait vraiment ce
      // jour-là, il peut en rester un. Le traiter comme bloquant condamnerait
      // toutes les parties suivantes POUR TOUJOURS — un blocage définitif est
      // bien pire que le chevauchement de moins de 25 minutes qu'on autorise
      // ici, et qui ne survient que dans une journée déjà saturée.
      (remainingNeed.get(t.id) ?? 0) >= TASK_CONSTANTS.minBlockMinutes,
  )
}

/**
 * D.4 : capacité effective moyenne par semaine calendaire (lundi → dimanche).
 * Elle ne sert qu'à comparer un jour aux autres jours de SA semaine ; elle
 * n'entre jamais dans le rythme quotidien, qui reste la cible ÷ 7.
 */
function averageEffectiveCapacityByWeek(capacities: DayCapacity[]): Map<string, number> {
  const totals = new Map<string, { minutes: number; days: number }>()
  for (const c of capacities) {
    const week = startOfWeek(c.date)
    const acc = totals.get(week) ?? { minutes: 0, days: 0 }
    totals.set(week, { minutes: acc.minutes + c.effectiveCapacityMinutes, days: acc.days + 1 })
  }
  return new Map([...totals].map(([week, t]) => [week, t.days > 0 ? t.minutes / t.days : 0]))
}

/**
 * D.4 : cible de la semaine en cours pour un objectif — le rythme quotidien
 * multiplié par les jours où l'objectif existait vraiment cette semaine. Un
 * objectif créé un jeudi ne doit rien pour lundi, mardi et mercredi : le total
 * de cette semaine-là est simplement plus bas, jamais un déficit à signaler.
 */
function weeklyTargetForWeekOf(objective: ObjectiveItem, today: string): number {
  const weekStart = startOfWeek(today)
  const createdAt = new Date(objective.createdAt)
  const created = Number.isNaN(createdAt.getTime()) ? weekStart : dateKey(createdAt)
  const activeDays =
    created <= weekStart
      ? DAYS_PER_WEEK
      : Math.max(0, Math.min(DAYS_PER_WEEK, DAYS_PER_WEEK - daysBetween(weekStart, created)))
  return dailyRhythm(objective.weeklyTargetMinutes) * activeDays
}

/**
 * D.7 : marge de rythme d'un objectif — ce qu'il a déjà reçu cette semaine
 * moins ce que la cadence ÷ 7 attendait à ce stade. Positif = en avance sur son
 * rythme, donc le premier à céder quand un retard a rogné la journée ; négatif
 * = déjà en retard de rythme, donc le dernier qu'on touche.
 *
 * C'est bien une marge de RYTHME, jamais une marge de deadline : un objectif
 * n'a pas d'échéance, et n'a donc aucune urgence au sens de C.1.
 */
function rhythmMargin(objective: ObjectiveItem, servedThisWeek: number, date: string): number {
  const daysElapsed = daysBetween(startOfWeek(date), date) + 1
  return servedThisWeek - dailyRhythm(objective.weeklyTargetMinutes) * daysElapsed
}

/** Jours consécutifs >85 % juste avant `date`, d'après les mesures seules (E.4). */
function pastUtilization(date: string, utilization: Record<string, number>): number {
  let count = 0
  let cursor = date
  for (let i = 0; i < 14; i++) {
    cursor = addDays(cursor, -1)
    const u = utilization[cursor]
    if (u === undefined) break
    // E.4 : un jour sous 50 % remet le compteur à zéro.
    if (u < 50) break
    if (u > 85) count++
    else break
  }
  return count
}

const NO_BREATHING = {
  targetMinutes: 0,
  restTakenMinutes: 0,
  gapMinutes: 0,
  adjustment: 'none' as const,
  reducedDates: [] as string[],
  capPercent: 100,
}

/**
 * E.3 : si le repos déjà pris cette semaine est sous la cible de 20 %,
 * l'application réduit elle-même le jour restant le moins perturbant.
 *
 * G.3 : sans jour mesuré cette semaine, il n'y a rien à comparer — aucun
 * manque de repos n'est inventé.
 */
function applyWeeklyBreathing(args: {
  capacities: DayCapacity[]
  input: PlanningInput
  /** Capacité d'un jour écoulé, reconstruite comme celle des jours à venir. */
  buildDay: (date: string) => DayCapacity
}) {
  const weekStart = startOfWeek(args.input.today)
  const elapsed = Object.entries(args.input.dailyUtilization)
    .filter(([date]) => date >= weekStart && date < args.input.today)
    .map(([date, utilization]) => {
      const day = args.buildDay(date)
      return {
        date,
        // E.3 : le brut d'un jour écoulé se calcule comme celui de n'importe
        // quel autre jour — sommeil et obligations fixes déduits. Les 1440
        // minutes d'une journée entière ne sont jamais de la capacité.
        rawCapacityMinutes: day.rawCapacityMinutes,
        effectiveCapacityMinutes: day.effectiveCapacityMinutes,
        // `dailyUtilization` est un pourcentage de la capacité EFFECTIVE
        // (G.1, comme en E.4) : c'est elle qui le convertit en minutes.
        workedMinutes: Math.round((utilization / 100) * day.effectiveCapacityMinutes),
      }
    })

  if (elapsed.length === 0) return NO_BREATHING

  const remainingRaw = args.capacities
    .filter((c) => startOfWeek(c.date) === weekStart)
    .reduce((s, c) => s + c.rawCapacityMinutes, 0)

  const breathing = computeWeeklyBreathing({
    elapsedDays: elapsed,
    weekRawCapacityMinutes: remainingRaw + elapsed.reduce((s, e) => s + e.rawCapacityMinutes, 0),
    remainingDays: args.capacities
      .filter((c) => c.date >= args.input.today && startOfWeek(c.date) === weekStart)
      .map((c) => ({ date: c.date, demandMinutes: c.effectiveCapacityMinutes })),
  })

  // Le plafond s'applique en réduisant la capacité effective du jour choisi.
  for (const date of breathing.reducedDates) {
    const cap = args.capacities.find((c) => c.date === date)
    if (!cap) continue
    const capped = Math.round(cap.effectiveCapacityMinutes * (breathing.capPercent / 100))
    cap.breathingReductionMinutes = cap.effectiveCapacityMinutes - capped
    cap.effectiveCapacityMinutes = capped
  }

  return breathing
}

/**
 * Le milieu du sommeil, en minutes depuis minuit : la nuit qui finit un jour
 * libre (ni école ni travail) d'abord, n'importe quelle nuit sinon. Null s'il
 * n'y a aucune nuit déclarée — le score se passe alors de synchronie.
 */
function estimateMidSleep(schedule: PlanningInput['schedule'], dates: string[]): number | null {
  let fallback: number | null = null
  for (const date of dates) {
    const dow = dayOfWeek(date)
    const entries = scheduleEntriesForDate(schedule, date, dow)
    const wake = entries.find((e) => e.categoryType === 'sleep' && e.startMinute === 0 && e.endMinute < 1440)
    if (!wake) continue
    const prevDate = addDays(date, -1)
    const prev = scheduleEntriesForDate(schedule, prevDate, dayOfWeek(prevDate))
    const bed = prev.find((e) => e.categoryType === 'sleep' && e.endMinute === 1440)
    const start = bed ? bed.startMinute - 1440 : 0
    const mid = (((start + wake.endMinute) / 2) % 1440 + 1440) % 1440
    const free = !entries.some((e) => e.categoryType === 'school' || e.categoryType === 'work')
    if (free) return Math.round(mid)
    fallback ??= Math.round(mid)
  }
  return fallback
}

// ─── Apprentissage implicite (spec 2026-09-25) ────────────────────────────

/** Valeurs de départ du score appris : pStart × (V_START + pTient × V_TIENT). */
const V_START = 40
const V_TIENT = 40
/** Un prior neutre (0,5 / 0,5) donne 30 : recentré sur 0, il pèse comme une fenêtre NORMALE. */
const V_NEUTRE = 0.5 * (V_START + 0.5 * V_TIENT)
/** Au moins 4 séances par semaine pour une habitude (valeur soutenue par la spec). */
const MIN_JOURS_ACTIFS = 4

const chrono = (a: SessionEvent, b: SessionEvent) =>
  a.date.localeCompare(b.date) || a.plannedStartMinute - b.plannedStartMinute

function buildLearningContext(
  rawEvents: SessionEvent[],
  today: string,
  schedule: PlanningInput['schedule'],
  doses: Record<string, { dose: number; cible: number }>,
) {
  // L'oubli (gamma) suppose l'ordre chronologique : on ne le suppose pas, on le fait.
  const events = [...rawEvents].sort(chrono)
  // Une rupture probable (examens, vacances, nouveau travail) : l'ancien
  // régime s'oublie plus vite.
  const rupture = rupturePossible(events, today)
  const gamma = rupture ? 0.9 : GAMMA
  const byCategory = new Map<string, SessionEvent[]>()
  for (const e of events) {
    const arr = byCategory.get(e.category) ?? []
    arr.push(e)
    byCategory.set(e.category, arr)
  }
  const startOk = (e: SessionEvent) => e.started && (e.delayMinutes ?? 0) <= TOLERANCE_DEPART_MINUTES
  // pTient est CONDITIONNEL au démarrage : un bloc jamais démarré n'est pas
  // un bloc « pas tenu » — sinon il compterait deux fois comme un échec.
  const heldOk = (e: SessionEvent) => (e.heldMinutes ?? 0) >= 0.8 * e.plannedMinutes

  const typesJour = new Map<string, string>()
  const dayTypeOf = (date: string) => {
    let t = typesJour.get(date)
    if (!t) {
      t = scheduleEntriesForDate(schedule, date, dayOfWeek(date)).some(
        (x) => x.categoryType === 'school' || x.categoryType === 'work',
      )
        ? 'busy'
        : 'free'
      typesJour.set(date, t)
    }
    return t
  }

  // Constance : la médiane des vrais départs, par engagement, type de jour et
  // rang de la séance dans la journée.
  const habitual = new Map<string, number>()
  {
    const parCle = new Map<string, number[]>()
    const rangDuJour = new Map<string, number>()
    for (const e of events) {
      if (!e.started) continue
      const jour = `${e.refId}|${e.date}`
      const rang = rangDuJour.get(jour) ?? 0
      rangDuJour.set(jour, rang + 1)
      const cle = `${e.refId}|${dayTypeOf(e.date)}|${rang}`
      const arr = parCle.get(cle) ?? []
      arr.push(e.plannedStartMinute + (e.delayMinutes ?? 0))
      parCle.set(cle, arr)
    }
    for (const [cle, v] of parCle) {
      if (v.length < 3) continue
      const s = [...v].sort((a, b) => a - b)
      habitual.set(cle, s[Math.floor(s.length / 2)]!)
    }
  }

  const blockMaxCache = new Map<string, number>()
  const phaseCache = new Map<string, number>()
  const phaseOf = (refId: string) => {
    if (!phaseCache.has(refId)) phaseCache.set(refId, phaseHabitude(events, refId))
    return phaseCache.get(refId)!
  }

  // Le diagnostic d'arrêt est coûteux : une fois par calcul, puis mis en cache.
  const diagnostic = diagnostiquer(events)
  const ajustCache = new Map<string, ReturnType<typeof ajustementPour>>()
  const ajust = (refId: string) => {
    if (!ajustCache.has(refId)) ajustCache.set(refId, ajustementPour(events, refId, diagnostic))
    return ajustCache.get(refId)!
  }
  const niveauCache = new Map<string, number>()
  // Le niveau se lit en semaines CALENDAIRES (depuis le lundi), comme la dose :
  // la longueur des blocs ne bouge pas en pleine semaine.
  const niveau = (refId: string) => {
    if (!niveauCache.has(refId)) niveauCache.set(refId, niveauDifficulte(events, refId, startOfWeek(today)))
    return niveauCache.get(refId)!
  }

  const blockMax = (refId: string, category: string, tranche?: Tranche) => {
    const k = `${refId}|${category}|${tranche ?? ''}`
    if (!blockMaxCache.has(k)) {
      const survie = survieDe(events, category, tranche)
      const base = dureeCible(survie)
      // Une seule croissance à la fois : quand Kaplan-Meier monte déjà depuis
      // le plus long bloc tenu (+10 %), le niveau ne peut que retenir, pas pousser.
      const croitDeja = survie.length >= 5 && !survie.some((o) => o.arret)
      const d = croitDeja ? Math.min(1, niveau(refId)) : niveau(refId)
      const adj = ajust(refId)
      const len = Math.max(BLOC_MIN, Math.min(BLOC_MAX, Math.round(base * d)))
      blockMaxCache.set(k, adj.blocMax ? Math.min(len, adj.blocMax) : len)
    }
    return blockMaxCache.get(k)!
  }

  /**
   * Jours actifs d'un objectif. Phases 1-2 : contact tous les jours (÷ 7).
   * Phases 3-4 : jours off permis si joursNécessaires ≤ 6, calculés sur la
   * CIBLE (la destination), avec le bloc appris — et jamais moins de 4 jours.
   */
  const activeDays = (refId: string) => {
    if (phaseOf(refId) < 3) return DAYS_PER_WEEK
    const cible = doses[refId]?.cible ?? 0
    const maxJour = 2 * blockMax(refId, `objectif:${refId}`)
    const n = Math.ceil(cible / maxJour)
    return n <= 6 ? Math.max(MIN_JOURS_ACTIFS, n) : DAYS_PER_WEEK
  }

  // Les jours off sont choisis par JOUR DE LA SEMAINE, sur la capacité d'un
  // jour ENTIER (la prochaine occurrence qui n'est pas aujourd'hui, dont la
  // capacité est rognée par « maintenant »). Le choix ne bouge donc pas au fil
  // de la journée, et ne tombe jamais d'office sur le dimanche.
  const offCache = new Map<string, Set<number>>()
  const offDays = (refId: string, caps: DayCapacity[]) => {
    if (!offCache.has(refId)) {
      const n = activeDays(refId)
      const parJour = new Map<number, number>()
      for (const c of caps) {
        if (c.date === today && caps.some((x) => x.dayOfWeek === c.dayOfWeek && x.date !== today)) continue
        if (!parJour.has(c.dayOfWeek)) parJour.set(c.dayOfWeek, c.effectiveCapacityMinutes)
      }
      const tries = [...parJour.entries()].sort((a, b) => a[1] - b[1] || a[0] - b[0])
      offCache.set(refId, new Set(n >= DAYS_PER_WEEK ? [] : tries.slice(0, DAYS_PER_WEEK - n).map(([d]) => d)))
    }
    return offCache.get(refId)!
  }

  // Les lois par (catégorie, heure, jour de semaine) ne dépendent pas de la
  // date : calculées une fois. Seul le tirage dépend de la date (graine).
  const qualiteCache = new Map<string, number>()
  const loisCache = new Map<string, { pS: { a: number; b: number }; pT: { a: number; b: number } }>()
  const lois = (cat: SessionEvent[], category: string, hour: number, dow: number) => {
    const cle = `${category}|${hour}|${dow}`
    const connu = loisCache.get(cle)
    if (connu) return connu
    const atHour = cat.filter((e) => Math.floor(e.plannedStartMinute / 60) === hour)
    const atDow = atHour.filter((e) => dayOfWeek(e.date) === dow)
    const started = (xs: SessionEvent[]) => xs.filter((e) => e.started)
    const v = {
      pS: inheritedPosterior([cat.map(startOk), atHour.map(startOk), atDow.map(startOk)], undefined, 4, gamma),
      pT: inheritedPosterior([started(cat).map(heldOk), started(atHour).map(heldOk), started(atDow).map(heldOk)], undefined, 4, gamma),
    }
    loisCache.set(cle, v)
    return v
  }
  const qualiteBrute = (cat: SessionEvent[], hour: number, dow: number, date: string, category: string, crisis: boolean) => {
    const { pS, pT } = lois(cat, category, hour, dow)
    let a: number
    let b: number
    if (crisis) {
      a = betaMean(pS)
      b = betaMean(pT)
    } else {
      const r = rng(seedFrom(`${category}|${date}|${hour}`))
      // Après une rupture probable, on explore davantage quelques jours :
      // des lois aplaties, donc des tirages plus larges.
      const aplatir = (p: { a: number; b: number }) => (rupture ? { a: p.a * 0.5 + 0.5, b: p.b * 0.5 + 0.5 } : p)
      a = sampleBeta(aplatir(pS), r)
      b = sampleBeta(aplatir(pT), r)
    }
    return a * (V_START + b * V_TIENT) - V_NEUTRE
  }

  return {
    habitual,
    /**
     * Thompson sampling : pour un départ, tire pStart et pTient dans leurs lois
     * (catégorie → catégorie à cette heure → à cette heure ce jour de la
     * semaine). Sous 5 observations de la catégorie : aucune conclusion, la
     * qualité G.2 reste. En crise prouvée : pas d'exploration, la moyenne. La
     * graine (catégorie, date, heure) rend le tirage stable d'un recalcul à
     * l'autre.
     */
    quality(category: string, date: string, dow: number, crisis: boolean) {
      const cat = byCategory.get(category) ?? []
      if (!hasEnoughData(cat.length)) return undefined
      // Une valeur par heure : le score est demandé à chaque quart d'heure, et
      // les lois ne changent qu'avec l'heure.
      return (start: number) => {
        const hour = Math.floor(start / 60)
        const cle = `${category}|${date}|${hour}|${crisis ? 1 : 0}`
        const connu = qualiteCache.get(cle)
        if (connu !== undefined) return connu
        const v = qualiteBrute(cat, hour, dow, date, category, crisis)
        qualiteCache.set(cle, v)
        return v
      }
    },
    /**
     * La longueur de bloc apprise : la durée où l'on a encore 80 % de chances
     * de tenir (Kaplan-Meier), × la difficulté visée (~85 % de blocs tenus),
     * bornée 25-90 ; raccourcie si le diagnostic d'arrêt montre de l'évitement.
     */
    blockMax,
    /** La plus longue des trois tranches horaires. */
    blockMaxToutesTranches(refId: string, category: string) {
      return Math.max(...(['matin', 'apres-midi', 'soir'] as const).map((t) => blockMax(refId, category, t)))
    },
    /** Fatigue diagnostiquée : l'exigeant quitte le soir. */
    eveningPenalty(refId: string) {
      return ajust(refId).soirPenalite
    },
    /** « Plus dur » : un niveau au-dessus de 1 relâche l'attrait du créneau confortable. */
    comfort(refId: string) {
      const n = niveau(refId)
      return n > 1 ? Math.max(0.5, 2 - n) : 1
    },
    /** Pause anticipée, si elle tombe dans le bloc. */
    pause(refId: string, size: number) {
      const p = pauseAnticipee(events, refId, size)
      return p !== null && p < size ? p : undefined
    },
    activeDays,
    /** La phase de retrait d'une habitude (1 à 4), mesurée dans le journal. */
    phase: phaseOf,
    isDayOff(refId: string, date: string, caps: DayCapacity[]) {
      return offDays(refId, caps).has(dayOfWeek(date))
    },
  }
}
