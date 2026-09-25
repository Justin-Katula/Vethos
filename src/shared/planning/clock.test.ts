import { describe, it, expect } from 'vitest'
import {
  applyConfirmation,
  applyLapsedCredit,
  applyStop,
  applyWorkCredit,
  blockSessionFor,
  closeSessionEvent,
  overlayDue,
  recordBlockedAttempt,
  closedObservedBlock,
  computeBlockDelayMinutes,
  confirmationsFor,
  pendingConfirmation,
  tasksToAutoComplete,
  uncoveredMinutes,
} from './clock'
import type { PlacedBlock, TaskItem } from '@shared/planning/types'
import type { LearningState, ObservedPendingBlock, SessionConfirmationsState } from '@shared/schemas'

const TODAY = '2026-08-17'

const block = (over: Partial<PlacedBlock> = {}): PlacedBlock => ({
  id: 'task-1-2026-08-17-600',
  date: TODAY,
  startMinute: 600, // 10h00
  endMinute: 660, // 11h00
  durationMinutes: 60,
  breakMinutes: 0,
  workMinutes: 60,
  kind: 'task',
  refId: 'ref-1',
  label: 'Réviser',
  color: '#E8E8E8',
  cognitiveWindow: 'NORMALE',
  appsToBlock: ['discord.exe'],
  ...over,
})

describe('pendingConfirmation', () => {
  it('le bloc dont la fenêtre couvre maintenant, jamais confirmé', () => {
    const b = block()
    const result = pendingConfirmation({
      blocks: [b],
      today: TODAY,
      nowMinute: 620,
      confirmedBlockIds: new Set(),
    })
    expect(result?.id).toBe(b.id)
  })

  it('déjà confirmé aujourd’hui : rien à afficher', () => {
    const b = block()
    const result = pendingConfirmation({
      blocks: [b],
      today: TODAY,
      nowMinute: 620,
      confirmedBlockIds: new Set([b.id]),
    })
    expect(result).toBeNull()
  })

  it('pas encore commencé : rien à afficher', () => {
    const result = pendingConfirmation({
      blocks: [block({ startMinute: 700, endMinute: 760 })],
      today: TODAY,
      nowMinute: 620,
      confirmedBlockIds: new Set(),
    })
    expect(result).toBeNull()
  })

  it('fenêtre déjà fermée : rien à afficher (c’est lapsedBlocks qui le prend)', () => {
    const result = pendingConfirmation({
      blocks: [block({ startMinute: 500, endMinute: 560 })],
      today: TODAY,
      nowMinute: 620,
      confirmedBlockIds: new Set(),
    })
    expect(result).toBeNull()
  })

  it('un autre jour n’est jamais candidat', () => {
    const result = pendingConfirmation({
      blocks: [block({ date: '2026-08-18' })],
      today: TODAY,
      nowMinute: 620,
      confirmedBlockIds: new Set(),
    })
    expect(result).toBeNull()
  })

  it('exactement à T0 (limite basse incluse) : déjà candidat', () => {
    const b = block({ startMinute: 600, endMinute: 660 })
    const result = pendingConfirmation({
      blocks: [b],
      today: TODAY,
      nowMinute: 600,
      confirmedBlockIds: new Set(),
    })
    expect(result?.id).toBe(b.id)
  })

  it('exactement à la fin (limite haute exclue) : plus candidat', () => {
    const result = pendingConfirmation({
      blocks: [block({ startMinute: 600, endMinute: 660 })],
      today: TODAY,
      nowMinute: 660,
      confirmedBlockIds: new Set(),
    })
    expect(result).toBeNull()
  })

  describe('stabilisation par `observedPending` — BUG RÉEL DU 2026-08-23', () => {
    it('même référence, id frais différent : reconnu comme déjà confirmé quand même', () => {
      // D.9 (`notBeforeMinute`) fait glisser `slot.startMinute` — donc l'id —
      // du bloc actif à chaque minute. Sans stabilisation, une confirmation
      // faite sous l'ancien id ne matcherait plus ce scan frais.
      const fresh = block({ id: 'task-1-2026-08-17-602', startMinute: 602, endMinute: 662 })
      const result = pendingConfirmation({
        blocks: [fresh],
        today: TODAY,
        nowMinute: 602,
        confirmedBlockIds: new Set(['task-1-2026-08-17-600']),
        observedPending: {
          blockId: 'task-1-2026-08-17-600',
          kind: 'task',
          refId: 'ref-1',
          startMinute: 600,
          endMinute: 660,
        },
      })
      expect(result).toBeNull()
    })

    it('pas encore confirmé : l’id et l’horaire renvoyés restent ceux de la première observation, pas ceux du scan frais', () => {
      const fresh = block({ id: 'task-1-2026-08-17-602', startMinute: 602, endMinute: 662 })
      const result = pendingConfirmation({
        blocks: [fresh],
        today: TODAY,
        nowMinute: 602,
        confirmedBlockIds: new Set(),
        observedPending: {
          blockId: 'task-1-2026-08-17-600',
          kind: 'task',
          refId: 'ref-1',
          startMinute: 600,
          endMinute: 660,
        },
      })
      expect(result?.id).toBe('task-1-2026-08-17-600')
      expect(result?.startMinute).toBe(600)
      expect(result?.endMinute).toBe(660)
    })

    it('référence différente de celle observée : jamais stabilisé sur l’ancienne identité', () => {
      const fresh = block({ id: 'task-2-2026-08-17-602', refId: 'ref-2', startMinute: 602, endMinute: 662 })
      const result = pendingConfirmation({
        blocks: [fresh],
        today: TODAY,
        nowMinute: 602,
        confirmedBlockIds: new Set(['task-1-2026-08-17-600']),
        observedPending: {
          blockId: 'task-1-2026-08-17-600',
          kind: 'task',
          refId: 'ref-1',
          startMinute: 600,
          endMinute: 660,
        },
      })
      expect(result?.id).toBe('task-2-2026-08-17-602')
    })

    it('la fenêtre observée est dépassée : la stabilisation se relâche, le scan frais reprend la main', () => {
      const fresh = block({ id: 'task-1-2026-08-17-660', startMinute: 660, endMinute: 720 })
      const result = pendingConfirmation({
        blocks: [fresh],
        today: TODAY,
        nowMinute: 660,
        confirmedBlockIds: new Set(),
        observedPending: {
          blockId: 'task-1-2026-08-17-600',
          kind: 'task',
          refId: 'ref-1',
          startMinute: 600,
          endMinute: 660,
        },
      })
      expect(result?.id).toBe('task-1-2026-08-17-660')
    })

    it('sans observedPending (comportement historique) : le résultat brut du scan frais, inchangé', () => {
      const fresh = block({ id: 'task-1-2026-08-17-602', startMinute: 602, endMinute: 662 })
      const result = pendingConfirmation({
        blocks: [fresh],
        today: TODAY,
        nowMinute: 602,
        confirmedBlockIds: new Set(),
      })
      expect(result?.id).toBe('task-1-2026-08-17-602')
    })
  })
})

describe('uncoveredMinutes — le cœur de la protection contre le double crédit', () => {
  it('rien de couvert : la fenêtre entière est neuve', () => {
    expect(uncoveredMinutes({ startMinute: 450, endMinute: 560 }, [])).toBe(110)
  })

  it('entièrement couvert par un seul intervalle : rien de neuf', () => {
    expect(uncoveredMinutes({ startMinute: 544, endMinute: 638 }, [{ start: 450, end: 773 }])).toBe(0)
  })

  it('BUG RÉEL DU 2026-08-22, rejoué : trois blocs d’un recalcul plus tardif, tous déjà couverts par le premier calcul', () => {
    // Le premier tic (19:46:30) avait couvert [450,773) via l'objectif +
    // deux tâches. Le second tic (19:46:35), 5 s plus tard, a replacé
    // différemment le début de journée : trois blocs à 450, 544 et 638 — AUCUN
    // ne partage une minute de départ avec le premier calcul, mais tous
    // tombent dans son recouvrement. La correction par simple égalité de
    // minute de départ ratait ces trois-là (189 min en trop) ; le
    // recouvrement d'intervalle les attrape tous.
    const covered = [{ start: 450, end: 773 }]
    expect(uncoveredMinutes({ startMinute: 450, endMinute: 544 }, covered)).toBe(0)
    expect(uncoveredMinutes({ startMinute: 544, endMinute: 638 }, covered)).toBe(0)
    expect(uncoveredMinutes({ startMinute: 638, endMinute: 733 }, covered)).toBe(0)
  })

  it('chevauchement partiel : seule la partie neuve compte', () => {
    // [700,850) chevauche [450,773) sur [700,773) — reste 773→850 = 77 neuves.
    expect(uncoveredMinutes({ startMinute: 700, endMinute: 850 }, [{ start: 450, end: 773 }])).toBe(77)
  })

  it('deux intervalles déjà couverts, un trou entre eux : le trou compte', () => {
    const covered = [
      { start: 400, end: 460 },
      { start: 500, end: 560 },
    ]
    // [400,560) moins les deux segments couverts = le trou [460,500) = 40 min.
    expect(uncoveredMinutes({ startMinute: 400, endMinute: 560 }, covered)).toBe(40)
  })

  it('aucun chevauchement avec un intervalle plus tard dans la journée', () => {
    expect(uncoveredMinutes({ startMinute: 100, endMinute: 200 }, [{ start: 900, end: 960 }])).toBe(100)
  })
})

const observed = (over: Partial<ObservedPendingBlock> = {}): ObservedPendingBlock => ({
  blockId: 'task-1-2026-08-17-500',
  kind: 'task',
  refId: 'ref-1',
  startMinute: 500,
  endMinute: 560,
  ...over,
})

describe('closedObservedBlock — D.7 : détecte une fenêtre fermée sans jamais relire un plan qui l’a déjà oublié', () => {
  it('rien observé : rien à fermer', () => {
    const result = closedObservedBlock({
      observedPending: null,
      currentPending: null,
      nowMinute: 620,
    })
    expect(result).toBeNull()
  })

  it('toujours le même bloc actif : pas fermé', () => {
    const o = observed()
    const result = closedObservedBlock({
      observedPending: o,
      currentPending: block({ id: o.blockId, startMinute: o.startMinute, endMinute: o.endMinute }),
      nowMinute: 520,
    })
    expect(result).toBeNull()
  })

  it('BUG RÉEL DU 2026-08-22 : un plan frais qui ne propose plus RIEN pour aujourd’hui laisse quand même détecter la fermeture', () => {
    // C'est exactement le scénario réel : depuis D.9 (`notBeforeMinute`), une
    // fois "maintenant" passé la fin du bloc observé, un recalcul frais ne le
    // propose plus JAMAIS — `currentPending` peut très bien être `null` alors
    // même que le bloc observé s'est bel et bien fermé sans confirmation.
    const o = observed({ startMinute: 500, endMinute: 560 })
    const result = closedObservedBlock({
      observedPending: o,
      currentPending: null,
      nowMinute: 620,
    })
    expect(result).toEqual(o)
  })

  it('remplacé par un bloc différent, après la fermeture de sa fenêtre : détecté fermé', () => {
    const o = observed({ blockId: 'task-1-2026-08-17-500', startMinute: 500, endMinute: 560 })
    const nextBlock = block({ id: 'task-2-2026-08-17-620', startMinute: 620, endMinute: 680 })
    const result = closedObservedBlock({
      observedPending: o,
      currentPending: nextBlock,
      nowMinute: 620,
    })
    expect(result).toEqual(o)
  })

  it('remplacé AVANT que sa fenêtre soit prouvée fermée : pas encore fermé', () => {
    // Les données ont changé et le plan a été reconstruit pendant que
    // `observed` était encore, en théorie, dans sa fenêtre. On ne peut pas
    // prouver qu'il a fermé sans réponse — "maintenant" n'a pas encore
    // atteint sa fin.
    const o = observed({ startMinute: 500, endMinute: 560 })
    const result = closedObservedBlock({
      observedPending: o,
      currentPending: block({ id: 'autre-chose', startMinute: 540, endMinute: 600 }),
      nowMinute: 540,
    })
    expect(result).toBeNull()
  })

  it('B.5.2 : un bloc CONFIRMÉ qui se ferme est renvoyé lui aussi — l’appelant tranche', () => {
    // Changement volontaire : une version précédente renvoyait `null` sur un
    // bloc confirmé, si bien que le temps réellement travaillé n'était jamais
    // compté nulle part. C'est cette information qui décide de la complétion
    // automatique d'une tâche — elle ne peut plus être jetée ici.
    const o = observed({ blockId: 'task-1-2026-08-17-500' })
    const result = closedObservedBlock({
      observedPending: o,
      currentPending: null,
      nowMinute: 620,
    })
    expect(result).toEqual(o)
  })
})

describe('computeBlockDelayMinutes — D.7, sans fenêtre de grâce', () => {
  it('confirmé pile à T0 : zéro retard', () => {
    expect(computeBlockDelayMinutes(block({ startMinute: 600 }), 600)).toBe(0)
  })

  it('confirmé 12 minutes après T0 : 12 minutes de retard, exactement', () => {
    expect(computeBlockDelayMinutes(block({ startMinute: 600 }), 612)).toBe(12)
  })

  it('jamais négatif, même si la confirmation précède T0', () => {
    expect(computeBlockDelayMinutes(block({ startMinute: 600 }), 590)).toBe(0)
  })
})

describe('blockSessionFor — D.8 : le pont vers le blocage réel', () => {
  it('démarre à la confirmation, pas à T0 — jamais avant que le travail ne commence vraiment', () => {
    const confirmedAt = new Date(2026, 7, 17, 10, 12, 0, 0).getTime() // 12 min de retard
    const session = blockSessionFor(block({ startMinute: 600, endMinute: 660 }), confirmedAt)
    expect(session.startedAt).toBe(confirmedAt)
    // 60 minutes complètes après la confirmation, malgré les 12 minutes de retard.
    expect(session.endsAt).toBe(new Date(2026, 7, 17, 11, 12, 0, 0).getTime())
    expect(session.appIds).toEqual(['discord.exe'])
    expect(session.blockId).toBe('task-1-2026-08-17-600')
  })

  it('un bloc sans apps_à_bloquer déclarées bloque une liste vide, pas undefined', () => {
    const now = Date.now()
    const session = blockSessionFor(block({ appsToBlock: undefined }), now)
    expect(session.appIds).toEqual([])
  })
})

const emptyLearning = (over: Partial<LearningState> = {}): LearningState => ({
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
  ...over,
})

const emptyConfirmations = (date: string): SessionConfirmationsState => ({
  date,
  confirmedAt: {},
  lapsedCreditedRanges: [],
  workCreditedRanges: [],
  streakBumpedRefs: [],
  stoppedBlockIds: [],
  observedPending: null,
})

describe('confirmationsFor — le bookkeeping ne franchit jamais le jour', () => {
  it('rien de stocké : repart d’un état vide pour aujourd’hui', () => {
    expect(confirmationsFor(null, TODAY)).toEqual(emptyConfirmations(TODAY))
  })

  it('même jour : le stocké passe tel quel', () => {
    const stored: SessionConfirmationsState = {
      date: TODAY,
      confirmedAt: { x: 1 },
      lapsedCreditedRanges: [{ start: 500, end: 560 }],
      workCreditedRanges: [],
      streakBumpedRefs: ['ref-1'],
      stoppedBlockIds: [],
      observedPending: observed(),
    }
    expect(confirmationsFor(stored, TODAY)).toBe(stored)
  })

  it('jour différent (minuit passé) : jamais hérité, repart vide', () => {
    const stored: SessionConfirmationsState = {
      date: '2026-08-16',
      confirmedAt: { x: 1 },
      lapsedCreditedRanges: [{ start: 500, end: 560 }],
      workCreditedRanges: [],
      streakBumpedRefs: ['ref-1'],
      stoppedBlockIds: [],
      observedPending: observed(),
    }
    expect(confirmationsFor(stored, TODAY)).toEqual(emptyConfirmations(TODAY))
  })
})

describe('applyLapsedCredit — D.7 : crédite la part neuve, fait avancer le bon compteur UNE FOIS PAR JOUR', () => {
  it('tâche manquée : consecutiveDelays avance, anchorMissCounts intact', () => {
    const b = block({ kind: 'task', refId: 'task-9', startMinute: 600, endMinute: 690 })
    const result = applyLapsedCredit(emptyLearning(), emptyConfirmations(TODAY), b)
    expect(result.learning.dailyDelayMinutes[TODAY]).toBe(90)
    expect(result.learning.consecutiveDelays['task-9']).toBe(1)
    expect(result.learning.anchorMissCounts).toEqual({})
    expect(result.confirmations.lapsedCreditedRanges).toEqual([{ start: 600, end: 690 }])
    expect(result.confirmations.streakBumpedRefs).toEqual(['task-9'])
  })

  it('ancre manquée : anchorMissCounts avance, consecutiveDelays intact', () => {
    const b = block({ kind: 'ancre', refId: 'ancre-9', startMinute: 600, endMinute: 660 })
    const result = applyLapsedCredit(emptyLearning(), emptyConfirmations(TODAY), b)
    expect(result.learning.anchorMissCounts['ancre-9']).toBe(1)
    expect(result.learning.consecutiveDelays).toEqual({})
  })

  it('BUG RÉEL DU 2026-08-17 : un bloc entièrement redondant ne fait PAS avancer le compteur de ratés', () => {
    // Une référence dont la SEULE apparition du jour est un doublon parfait
    // (déjà couvert par le crédit d'une AUTRE référence, comme un recalcul
    // superflu quelques secondes plus tard peut en produire) ne doit pas être
    // comptée « ratée » — elle n'a jamais eu de fenêtre à elle qui soit
    // vraiment restée sans réponse. Sur les vraies données, une tâche s'était
    // vue créditer un raté ce jour-là alors que son seul créneau, entièrement
    // recouvert par le crédit de l'objectif, ne lui appartenait pas du tout.
    const first = block({ kind: 'objective', refId: 'obj-1', startMinute: 990, endMinute: 1131 })
    const afterFirst = applyLapsedCredit(emptyLearning(), emptyConfirmations(TODAY), first)

    const redundant = block({ kind: 'task', refId: 'task-fantome', startMinute: 990, endMinute: 1038 })
    const afterRedundant = applyLapsedCredit(afterFirst.learning, afterFirst.confirmations, redundant)

    expect(afterRedundant.learning.consecutiveDelays['task-fantome']).toBeUndefined()
    expect(afterRedundant.confirmations.streakBumpedRefs).not.toContain('task-fantome')
    // Les minutes, elles, n'ont pas bougé non plus — rien de neuf à créditer.
    expect(afterRedundant.learning.dailyDelayMinutes[TODAY]).toBe(afterFirst.learning.dailyDelayMinutes[TODAY])
  })

  it('un deuxième bloc manqué le même jour s’ajoute au total, jamais ne le remplace', () => {
    const first = block({ id: 'a', refId: 'ref-a', startMinute: 400, endMinute: 460 })
    const afterFirst = applyLapsedCredit(emptyLearning(), emptyConfirmations(TODAY), first)
    const second = block({ id: 'b', refId: 'ref-b', startMinute: 500, endMinute: 530 })
    const afterSecond = applyLapsedCredit(afterFirst.learning, afterFirst.confirmations, second)
    expect(afterSecond.learning.dailyDelayMinutes[TODAY]).toBe(60 + 30)
    expect(afterSecond.confirmations.lapsedCreditedRanges).toEqual([
      { start: 400, end: 460 },
      { start: 500, end: 530 },
    ])
  })

  it('BUG RÉEL DU 2026-08-22 : un deuxième bloc manqué de la MÊME référence ne double pas le compteur de ratés', () => {
    // L'objectif reçoit 2 blocs profonds le même jour (D.5). Les deux
    // manquent. C'est UNE journée ratée, pas deux — D.8 : « ratée pour un
    // jour donné ». Sans cette garde, consecutiveDelays montait à 4 en deux
    // jours au lieu de 2 sur les vraies données de l'utilisateur.
    const first = block({ id: 'a', kind: 'objective', refId: 'obj-1', startMinute: 450, endMinute: 560 })
    const afterFirst = applyLapsedCredit(emptyLearning(), emptyConfirmations(TODAY), first)
    expect(afterFirst.learning.consecutiveDelays['obj-1']).toBe(1)

    const second = block({ id: 'b', kind: 'objective', refId: 'obj-1', startMinute: 560, endMinute: 651 })
    const afterSecond = applyLapsedCredit(afterFirst.learning, afterFirst.confirmations, second)
    // Le compteur de ratés reste à 1 — un seul jour raté...
    expect(afterSecond.learning.consecutiveDelays['obj-1']).toBe(1)
    // ...mais les minutes des DEUX blocs sont bien créditées, chacune est du
    // temps réellement perdu.
    expect(afterSecond.learning.dailyDelayMinutes[TODAY]).toBe(110 + 91)
  })

  it('un compteur de retard déjà existant s’incrémente, ne repart pas de zéro', () => {
    const b = block({ kind: 'task', refId: 'task-9' })
    const learning = emptyLearning({ consecutiveDelays: { 'task-9': 2 } })
    const result = applyLapsedCredit(learning, emptyConfirmations(TODAY), b)
    expect(result.learning.consecutiveDelays['task-9']).toBe(3)
  })
})

describe('applyConfirmation — D.7 : jamais une « ratée », le compteur retombe à zéro', () => {
  it('confirmation tardive : le retard s’ajoute, le compteur de ratés retombe à zéro', () => {
    const b = block({ kind: 'task', refId: 'task-9', startMinute: 600 })
    const learning = emptyLearning({ consecutiveDelays: { 'task-9': 2 } })
    const confirmedAtMs = new Date(2026, 7, 17, 10, 12, 0, 0).getTime()
    const result = applyConfirmation(learning, emptyConfirmations(TODAY), b, confirmedAtMs, 612)

    expect(result.delayMinutes).toBe(12)
    expect(result.learning.dailyDelayMinutes[TODAY]).toBe(12)
    expect(result.learning.consecutiveDelays['task-9']).toBe(0)
    expect(result.confirmations.confirmedAt[b.id]).toBe(confirmedAtMs)
    expect(result.confirmations.observedPending).toMatchObject({
      blockId: b.id,
      startMinute: 612,
      endMinute: 672,
      workMinutes: 60,
    })
  })

  it('confirmation pile à l’heure : zéro retard ajouté', () => {
    const b = block({ startMinute: 600 })
    const result = applyConfirmation(emptyLearning(), emptyConfirmations(TODAY), b, Date.now(), 600)
    expect(result.delayMinutes).toBe(0)
    expect(result.learning.dailyDelayMinutes[TODAY]).toBe(0)
  })

  it('ancre confirmée : anchorMissCounts retombe à zéro, consecutiveDelays intact', () => {
    const b = block({ kind: 'ancre', refId: 'ancre-9', startMinute: 600 })
    const learning = emptyLearning({ anchorMissCounts: { 'ancre-9': 3 } })
    const result = applyConfirmation(learning, emptyConfirmations(TODAY), b, Date.now(), 605)
    expect(result.learning.anchorMissCounts['ancre-9']).toBe(0)
  })

  it('retire la référence de streakBumpedRefs : elle ne reste pas marquée « déjà ratée » après confirmation', () => {
    const confirmations: SessionConfirmationsState = { ...emptyConfirmations(TODAY), streakBumpedRefs: ['ref-1'] }
    const b = block({ refId: 'ref-1', startMinute: 600 })
    const result = applyConfirmation(emptyLearning(), confirmations, b, Date.now(), 600)
    expect(result.confirmations.streakBumpedRefs).toEqual([])
  })

  it('deux confirmations le même jour cumulent le retard, sans s’écraser', () => {
    const a = block({ id: 'a', refId: 'ref-a', startMinute: 400 })
    const afterA = applyConfirmation(emptyLearning(), emptyConfirmations(TODAY), a, Date.now(), 410)
    const b = block({ id: 'b', refId: 'ref-b', startMinute: 500 })
    const afterB = applyConfirmation(afterA.learning, afterA.confirmations, b, Date.now(), 505)
    expect(afterB.learning.dailyDelayMinutes[TODAY]).toBe(10 + 5)
    expect(Object.keys(afterB.confirmations.confirmedAt).sort()).toEqual(['a', 'b'])
  })
})

describe('applyWorkCredit — B.5.2 : le temps RÉELLEMENT fait, mesuré et jamais déclaré', () => {
  it('confirmé pile à l’heure : toute la part de travail est créditée', () => {
    const b = block({ refId: 'ref-1', startMinute: 600, endMinute: 660, workMinutes: 60 })
    const r = applyWorkCredit(emptyLearning(), emptyConfirmations(TODAY), b, 600)
    expect(r.creditedMinutes).toBe(60)
    expect(r.learning.workedMinutesByRef['ref-1']).toBe(60)
  })

  it('confirmé 20 minutes en retard : 20 minutes de travail en moins, jamais un bloc plein offert', () => {
    const b = block({ refId: 'ref-1', startMinute: 600, endMinute: 660, workMinutes: 60 })
    const r = applyWorkCredit(emptyLearning(), emptyConfirmations(TODAY), b, 620)
    expect(r.creditedMinutes).toBe(40)
  })

  it('la PAUSE n’est jamais du travail fait (E.1)', () => {
    // Empreinte de 60 min dont 10 de pause : 50 minutes de travail, pas 60.
    const b = block({ startMinute: 600, endMinute: 660, durationMinutes: 60, breakMinutes: 10, workMinutes: 50 })
    const r = applyWorkCredit(emptyLearning(), emptyConfirmations(TODAY), b, 600)
    expect(r.creditedMinutes).toBe(50)
  })

  it('confirmé après la fin de la part de travail : zéro crédité, jamais négatif', () => {
    const b = block({ startMinute: 600, endMinute: 660, workMinutes: 60 })
    const r = applyWorkCredit(emptyLearning(), emptyConfirmations(TODAY), b, 700)
    expect(r.creditedMinutes).toBe(0)
  })

  it('seules les TÂCHES sont créditées — un objectif et une ancre ne se terminent jamais', () => {
    const objectif = block({ kind: 'objective', refId: 'obj-1', startMinute: 600, workMinutes: 60 })
    const ancre = block({ kind: 'ancre', refId: 'anc-1', startMinute: 600, workMinutes: 60 })
    expect(applyWorkCredit(emptyLearning(), emptyConfirmations(TODAY), objectif, 600).creditedMinutes).toBe(0)
    expect(applyWorkCredit(emptyLearning(), emptyConfirmations(TODAY), ancre, 600).creditedMinutes).toBe(0)
  })

  it('DOUBLE COMPTAGE : les mêmes minutes ne sont jamais créditées deux fois', () => {
    // Exactement le défaut du 2026-08-22 sur les retards, transposé au
    // travail : deux recalculs peuvent couvrir les mêmes minutes sans partager
    // le moindre id. Sans la fusion d'intervalles, une tâche se croirait
    // terminée avec la moitié du travail réellement fait.
    const first = block({ refId: 'ref-1', startMinute: 600, endMinute: 660, workMinutes: 60 })
    const a = applyWorkCredit(emptyLearning(), emptyConfirmations(TODAY), first, 600)

    const overlapping = block({ id: 'autre-id', refId: 'ref-1', startMinute: 630, endMinute: 690, workMinutes: 60 })
    const b = applyWorkCredit(a.learning, a.confirmations, overlapping, 630)

    // 600→660 déjà crédité ; seules les 30 minutes neuves (660→690) s'ajoutent.
    expect(b.creditedMinutes).toBe(30)
    expect(b.learning.workedMinutesByRef['ref-1']).toBe(90)
  })

  it('deux blocs distincts de la même tâche s’additionnent', () => {
    const matin = block({ refId: 'ref-1', startMinute: 500, endMinute: 560, workMinutes: 60 })
    const a = applyWorkCredit(emptyLearning(), emptyConfirmations(TODAY), matin, 500)
    const soir = block({ id: 'b2', refId: 'ref-1', startMinute: 900, endMinute: 960, workMinutes: 60 })
    const b = applyWorkCredit(a.learning, a.confirmations, soir, 900)
    expect(b.learning.workedMinutesByRef['ref-1']).toBe(120)
  })
})

describe('tasksToAutoComplete — B.5.2 : c’est l’application qui décide, pas l’utilisateur', () => {
  const t = (over: Partial<TaskItem> = {}): TaskItem => ({
    id: 'task-1',
    title: 'Dossier',
    plan: 'Plan d’action pour le dossier.',
    deadline: '2026-08-20',
    importance: 5,
    category: 'général',
    workKind: 'routine',
    estimatedMinutes: 100, // × 1,4 (défaut B.3) = 140 minutes planifiées
    remainingMinutes: 140,
    correctionFactor: 1.4,
    parentTaskId: null,
    partOrder: null,
    extraMinutes: 0,
    status: 'active',
    appsToBlock: [],
    createdAt: '2026-08-01T10:00:00.000Z',
    ...over,
  })

  it('aucun temps fait : rien n’est terminé', () => {
    expect(tasksToAutoComplete({ tasks: [t()], workedMinutesByRef: {} })).toEqual([])
  })

  it('le temps prévu presque atteint : toujours pas terminé', () => {
    expect(
      tasksToAutoComplete({ tasks: [t()], workedMinutesByRef: { 'task-1': 139 } }),
    ).toEqual([])
  })

  it('le temps prévu atteint PILE : terminé, sans que personne ne le déclare', () => {
    expect(
      tasksToAutoComplete({ tasks: [t()], workedMinutesByRef: { 'task-1': 140 } }),
    ).toEqual(['task-1'])
  })

  it('« il m’en faut plus » repousse la fin d’exactement ce qui a été accordé', () => {
    const avecRab = t({ extraMinutes: 25 }) // 140 + 25 = 165
    expect(
      tasksToAutoComplete({ tasks: [avecRab], workedMinutesByRef: { 'task-1': 140 } }),
    ).toEqual([])
    expect(
      tasksToAutoComplete({ tasks: [avecRab], workedMinutesByRef: { 'task-1': 165 } }),
    ).toEqual(['task-1'])
  })

  it('une tâche déjà terminée n’est jamais reterminée', () => {
    expect(
      tasksToAutoComplete({
        tasks: [t({ status: 'history' })],

        workedMinutesByRef: { 'task-1': 500 },
      }),
    ).toEqual([])
  })

  it('un REGROUPEMENT ne se termine que quand toutes ses parties sont finies', () => {
    const groupe = t({ id: 'groupe', remainingMinutes: 0 })
    const p1 = t({ id: 'p1', parentTaskId: 'groupe', partOrder: 1 })
    const p2 = t({ id: 'p2', parentTaskId: 'groupe', partOrder: 2 })

    // Seule la partie 1 a fait son temps : ni la 2 ni le regroupement.
    expect(
      tasksToAutoComplete({
        tasks: [groupe, p1, p2],

        workedMinutesByRef: { p1: 140 },
      }).sort(),
    ).toEqual(['p1'])

    // Les deux parties faites : le regroupement suit.
    expect(
      tasksToAutoComplete({
        tasks: [groupe, p1, p2],

        workedMinutesByRef: { p1: 140, p2: 140 },
      }).sort(),
    ).toEqual(['groupe', 'p1', 'p2'])
  })

  it('un regroupement ne se termine JAMAIS sur son propre compteur de minutes', () => {
    // Il ne porte aucun travail : le créditer reviendrait à terminer toute la
    // tâche parce qu'une seule partie a été faite.
    const groupe = t({ id: 'groupe', remainingMinutes: 0 })
    const p1 = t({ id: 'p1', parentTaskId: 'groupe', partOrder: 1 })
    expect(
      tasksToAutoComplete({
        tasks: [groupe, p1],

        workedMinutesByRef: { groupe: 9999 },
      }),
    ).toEqual([])
  })
})

describe('B.5.2 — « il m’en faut plus » après une complétion automatique', () => {
  const t = (over: Partial<TaskItem> = {}): TaskItem => ({
    id: 'task-1',
    title: 'Dossier',
    plan: 'Plan d’action pour le dossier.',
    deadline: '2026-08-20',
    importance: 5,
    category: 'général',
    workKind: 'routine',
    estimatedMinutes: 100,
    remainingMinutes: 140,
    correctionFactor: 1.4,
    parentTaskId: null,
    partOrder: null,
    extraMinutes: 0,
    status: 'active',
    appsToBlock: [],
    createdAt: '2026-08-01T10:00:00.000Z',
    ...over,
  })

  it('la tâche relancée ne se retermine PAS instantanément', () => {
    // Le piège : 140 minutes faites, la tâche s'était terminée seule. On
    // demande 25 minutes de plus. Si `remainingMinutes` avait été remis à zéro
    // à la complétion, la cible retomberait à 25 — déjà dépassée — et la tâche
    // se reterminerait dans la seconde, sans jamais accorder la rallonge.
    const relancee = t({ status: 'active', extraMinutes: 25 })
    expect(
      tasksToAutoComplete({ tasks: [relancee], workedMinutesByRef: { 'task-1': 140 } }),
    ).toEqual([])

    // Elle se termine à 165, pas avant.
    expect(
      tasksToAutoComplete({ tasks: [relancee], workedMinutesByRef: { 'task-1': 164 } }),
    ).toEqual([])
    expect(
      tasksToAutoComplete({ tasks: [relancee], workedMinutesByRef: { 'task-1': 165 } }),
    ).toEqual(['task-1'])
  })
})

describe('Le journal des séances (spec moteur 2026-09-25)', () => {
  const MS = new Date(2026, 7, 17, 10, 5).getTime()

  it('« Je commence » ouvre un événement : démarré, retard mesuré, catégorie du bloc', () => {
    const r = applyConfirmation(emptyLearning(), emptyConfirmations(TODAY), block({ category: 'maths' }), MS, 605, { spontaneous: true })
    expect(r.learning.sessionEvents).toHaveLength(1)
    const e = r.learning.sessionEvents[0]!
    expect(e).toMatchObject({ started: true, delayMinutes: 5, spontaneous: true, category: 'maths', plannedStartMinute: 600, heldMinutes: null })
    expect(r.confirmations.observedPending?.plannedStartMinute).toBe(600)
  })

  it('un bloc vu mais jamais démarré entre au journal comme tel — un seul événement par bloc', () => {
    const b = { kind: 'objective' as const, refId: 'o', startMinute: 600, endMinute: 660, blockId: 'obj-o-600', workMinutes: 60 }
    const once = applyLapsedCredit(emptyLearning(), emptyConfirmations(TODAY), b, MS)
    const twice = applyLapsedCredit(once.learning, once.confirmations, b, MS)
    expect(twice.learning.sessionEvents).toHaveLength(1)
    expect(twice.learning.sessionEvents[0]).toMatchObject({ started: false, category: 'objectif:o', delayMinutes: null })
  })

  it('une fenêtre refermée sans arrêt : tenue jusqu’au bout', () => {
    const c = applyConfirmation(emptyLearning(), emptyConfirmations(TODAY), block(), MS, 600)
    const l = closeSessionEvent(c.learning, TODAY, block().id, 60)
    expect(l.sessionEvents[0]!.heldMinutes).toBe(60)
    // Déjà clos : un second passage ne réécrit rien.
    expect(closeSessionEvent(l, TODAY, block().id, 10).sessionEvents[0]!.heldMinutes).toBe(60)
  })

  it('« Stop » : crédite jusqu’ici, referme la fenêtre ici, garde la raison', () => {
    const c = applyConfirmation(emptyLearning(), emptyConfirmations(TODAY), block(), MS, 600)
    const s = applyStop({ learning: c.learning, confirmations: c.confirmations, nowMs: MS, minute: 638, reason: 'tired', text: '  crevé ', answerMs: 1800 })!
    expect(s.heldMinutes).toBe(38)
    expect(s.learning.workedMinutesByRef['ref-1']).toBe(38)
    expect(s.confirmations.observedPending?.endMinute).toBe(638)
    expect(s.learning.sessionEvents[0]).toMatchObject({ stoppedEarly: true, heldMinutes: 38, stop: { reason: 'tired', text: 'crevé', answerMs: 1800 } })
    // La pendule referme ensuite la fenêtre sans créditer une minute de plus.
    const again = applyWorkCredit(s.learning, s.confirmations, s.confirmations.observedPending!, 600)
    expect(again.creditedMinutes).toBe(0)
  })

  it('« Stop » sans séance confirmée ne fait rien', () => {
    expect(applyStop({ learning: emptyLearning(), confirmations: emptyConfirmations(TODAY), nowMs: MS, minute: 620, reason: null })).toBeNull()
  })

  it('compte les tentatives d’apps bloquées de la séance en cours', () => {
    const c = applyConfirmation(emptyLearning(), emptyConfirmations(TODAY), block(), MS, 600)
    const l = recordBlockedAttempt(recordBlockedAttempt(c.learning, c.confirmations), c.confirmations)
    expect(l.sessionEvents[0]!.blockedAttempts).toBe(2)
  })
})

describe('Retrait progressif de l’overlay', () => {
  it('phases 1-2 : tout de suite ; phase 3 : 10 min après, jamais un jour-test ; phase 4 : jamais', () => {
    const at = (phase: number, now: number, testDay = false) => overlayDue({ phase, nowMinute: now, blockStartMinute: 600, testDay })
    expect(at(1, 600)).toBe(true)
    expect(at(2, 600)).toBe(true)
    expect(at(3, 605)).toBe(false)
    expect(at(3, 610)).toBe(true)
    expect(at(3, 615, true)).toBe(false)
    expect(at(4, 700)).toBe(false)
  })
})

describe('« Stop » — cas limites', () => {
  const MS = new Date(2026, 7, 17, 10, 0).getTime()
  const confirme = (over: Partial<PlacedBlock> = {}) =>
    applyConfirmation(emptyLearning(), emptyConfirmations(TODAY), block(over), MS, 600)

  it('arrêté pendant la pause : le travail était fait — tenu en entier, pas un arrêt précoce', () => {
    const c = confirme({ endMinute: 670, durationMinutes: 70, breakMinutes: 10, workMinutes: 60 })
    const s = applyStop({ learning: c.learning, confirmations: c.confirmations, nowMs: MS, minute: 665, reason: 'tired' })!
    expect(s.learning.sessionEvents[0]).toMatchObject({ heldMinutes: 60, stoppedEarly: false })
  })

  it('arrêté la minute même du départ : zéro minute créditée, ni maintenant ni à la clôture', () => {
    const c = confirme()
    const s = applyStop({ learning: c.learning, confirmations: c.confirmations, nowMs: MS, minute: 600, reason: 'boring' })!
    expect(s.heldMinutes).toBe(0)
    const clos = applyWorkCredit(s.learning, s.confirmations, s.confirmations.observedPending!, 600)
    expect(clos.creditedMinutes).toBe(0)
  })

  it('un bloc arrêté n’est plus jamais « en attente », même si son créneau reste (une ancre)', () => {
    const b = block({ kind: 'ancre' })
    const c = applyConfirmation(emptyLearning(), emptyConfirmations(TODAY), b, MS, 600)
    const s = applyStop({ learning: c.learning, confirmations: c.confirmations, nowMs: MS, minute: 620, reason: 'real-event' })!
    const pending = pendingConfirmation({
      blocks: [b],
      today: TODAY,
      nowMinute: 630,
      confirmedBlockIds: new Set(),
      stoppedBlockIds: s.confirmations.stoppedBlockIds,
    })
    expect(pending).toBeNull()
    // Et un second « Stop » ne réécrit pas la raison.
    expect(applyStop({ learning: s.learning, confirmations: s.confirmations, nowMs: MS, minute: 625, reason: 'tired' })).toBeNull()
  })
})
