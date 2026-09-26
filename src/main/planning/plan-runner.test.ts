import { describe, it, expect, vi } from 'vitest'
import { createPlanRunner } from './plan-runner'
import { LearningStateSchema } from '@shared/schemas'
import type { ConfirmationOverlay, PendingBlockView } from './confirmation-overlay'
import type { Storage } from '@shared/storage'
import type {
  Settings,
  TasksState,
  BlockingRulesState,
  LearningState,
  SessionConfirmationsState,
} from '@shared/schemas'

/**
 * Réserve mémoire minimale qui respecte la forme de `Storage` — pas de disque,
 * pas de validation Zod (les fixtures sont déjà correctes par construction).
 * Suffisant pour vérifier le CÂBLAGE du runner : storage → computePlan →
 * décisions pures → overlay/apprentissage/session de blocage. Le placement
 * lui-même (où et quand un bloc tombe) est déjà couvert en profondeur par
 * `shared/planning/engine.test.ts` — ce fichier ne le re-teste pas.
 */
function fakeStorage(seed: Record<string, unknown>): Storage {
  const mem = new Map<string, unknown>(Object.entries(seed))
  return {
    read: (async (key: string) => (mem.has(key) ? mem.get(key) : null)) as Storage['read'],
    write: (async (key: string, data: unknown) => {
      mem.set(key, data)
    }) as Storage['write'],
    exists: (async (key: string) => mem.has(key)) as Storage['exists'],
    // Exposé pour les assertions — pas une méthode réelle de `Storage`.
    __mem: mem,
  } as unknown as Storage & { __mem: Map<string, unknown> }
}

function fakeOverlay(): ConfirmationOverlay & { shown: PendingBlockView[]; closes: number } {
  const shown: PendingBlockView[] = []
  let closes = 0
  let current: string | null = null
  return {
    shown,
    get closes() {
      return closes
    },
    show: (b) => {
      shown.push(b)
      current = b.blockId
    },
    close: () => {
      closes++
      current = null
    },
    currentBlockId: () => current,
  }
}

// Lundi 17 août, 09h30. Depuis le placement par score (spec moteur 2026-09-25),
// rien d'exigeant ne tombe dans l'heure qui suit le réveil (07h00) et la
// journée vise le pic du matin : c'est là que le premier bloc s'ouvre.
const WAKE = new Date(2026, 7, 17, 9, 30, 0, 0)

const settings: Settings = { sleepStart: '23:00', sleepEnd: '07:00' }

function oneTaskSeed(over: Partial<TasksState['tasks'][number]> = {}) {
  const tasks: TasksState = {
    tasks: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        title: 'Réviser',
        plan: 'Réviser les cours à mon bureau ce matin.',
        deadline: '2026-08-17',
        importance: 5,
        category: 'général',
        workKind: 'routine',
        estimatedMinutes: 60,
        remainingMinutes: 60,
        correctionFactor: 1,
        parentTaskId: null,
        partOrder: null,
        extraMinutes: 0,
        appsToBlock: ['discord.exe'],
        status: 'active',
        createdAt: '2026-08-01T10:00:00.000Z',
        ...over,
      },
    ],
  }
  return {
    settings,
    tasks,
    objectives: { objectives: [] },
    ancres: { ancres: [] },
    schedule: { entries: [] },
  }
}

describe('createPlanRunner — le pont D.7/D.8 mis en mouvement', () => {
  it('un bloc dont la fenêtre vient de s’ouvrir déclenche l’overlay « Je commence »', async () => {
    const storage = fakeStorage(oneTaskSeed())
    const overlay = fakeOverlay()
    const runner = createPlanRunner({ storage, overlay, now: () => WAKE })

    await runner.tickNow()

    expect(overlay.shown).toHaveLength(1)
    expect(overlay.shown[0]!.appsToBlock).toEqual(['discord.exe'])
    expect(overlay.shown[0]!.kind).toBe('task')
  })

  it('BUG RÉEL DU 2026-08-22 : l’overlay se redéclenche pour un bloc PLUS TARD dans la journée, pas seulement le tout premier', async () => {
    // C'était exactement le bug rapporté : l'overlay ne s'affichait qu'une
    // seule fois de toute la journée, jamais plus, alors même que d'autres
    // blocs ouvraient et fermaient leur fenêtre dans les heures qui
    // suivaient. Une tâche avec beaucoup de travail restant produit
    // plusieurs blocs dans la journée (D.5) — le second doit lui aussi
    // déclencher l'overlay, sans jamais avoir besoin de fermer et rouvrir
    // l'application.
    let nowRef = WAKE
    const storage = fakeStorage(oneTaskSeed({ estimatedMinutes: 300, remainingMinutes: 300 })) as Storage & {
      __mem: Map<string, unknown>
    }
    const overlay = fakeOverlay()
    const runner = createPlanRunner({ storage, overlay, now: () => nowRef })

    await runner.tickNow()
    expect(overlay.shown).toHaveLength(1)
    const firstBlockId = overlay.shown[0]!.blockId

    // Bien plus tard dans la journée, sans jamais confirmer le premier bloc :
    // sa fenêtre est fermée depuis longtemps, un autre a dû prendre le relais.
    nowRef = new Date(WAKE.getTime() + 3 * 60 * 60_000)
    await runner.tickNow()

    expect(overlay.shown.length).toBeGreaterThanOrEqual(2)
    const secondBlockId = overlay.shown[overlay.shown.length - 1]!.blockId
    expect(secondBlockId).not.toBe(firstBlockId)

    // Et le premier bloc, jamais confirmé, a bien été crédité en retard —
    // l'oubli ne s'est pas juste déplacé du côté de l'overlay.
    const learning = storage.__mem.get('learning') as LearningState
    expect(learning.dailyDelayMinutes['2026-08-17']).toBeGreaterThan(0)
  })

  it('confirmer démarre réellement une session de blocage, avec les bonnes apps', async () => {
    const storage = fakeStorage(oneTaskSeed()) as Storage & { __mem: Map<string, unknown> }
    const overlay = fakeOverlay()
    const runner = createPlanRunner({ storage, overlay, now: () => WAKE })

    await runner.tickNow()
    const blockId = overlay.shown[0]!.blockId

    const result = await runner.confirmBlock(blockId)
    expect(result).toEqual({ ok: true })

    const rules = storage.__mem.get('blocking_rules') as BlockingRulesState
    expect(rules.block?.blockId).toBe(blockId)
    expect(rules.block?.appIds).toEqual(['discord.exe'])
    expect(rules.block?.startedAt).toBe(WAKE.getTime())

    const learning = storage.__mem.get('learning') as LearningState
    // Confirmé pile à l'ouverture de la fenêtre : zéro retard.
    expect(learning.dailyDelayMinutes['2026-08-17']).toBe(0)

    expect(overlay.closes).toBeGreaterThan(0)
  })

  it('confirmer une deuxième fois le même bloc est refusé, pas silencieusement ignoré', async () => {
    const storage = fakeStorage(oneTaskSeed())
    const overlay = fakeOverlay()
    const runner = createPlanRunner({ storage, overlay, now: () => WAKE })

    await runner.tickNow()
    const blockId = overlay.shown[0]!.blockId
    await runner.confirmBlock(blockId)

    const second = await runner.confirmBlock(blockId)
    expect(second.ok).toBe(false)
  })

  it('appelle onBlockConfirmed pour que le contrôleur de blocage se réconcilie tout de suite', async () => {
    const storage = fakeStorage(oneTaskSeed())
    const overlay = fakeOverlay()
    const onBlockConfirmed = vi.fn()
    const runner = createPlanRunner({ storage, overlay, now: () => WAKE, onBlockConfirmed })

    await runner.tickNow()
    await runner.confirmBlock(overlay.shown[0]!.blockId)

    expect(onBlockConfirmed).toHaveBeenCalledTimes(1)
  })

  it('appelle onPlanningDataChanged sur confirmation — sans lui, une fenêtre déjà ouverte ne rechargerait jamais', async () => {
    const storage = fakeStorage(oneTaskSeed())
    const overlay = fakeOverlay()
    const onPlanningDataChanged = vi.fn()
    const runner = createPlanRunner({ storage, overlay, now: () => WAKE, onPlanningDataChanged })

    // Le premier tic découvre un nouveau bloc en attente (observedPending
    // passe de rien à quelque chose) — ça aussi, c'est un changement à
    // notifier, pas seulement un retard crédité ou une confirmation.
    await runner.tickNow()
    expect(onPlanningDataChanged).toHaveBeenCalledTimes(1)

    // Un deuxième tic sans rien de neuf ne renotifie pas pour rien.
    await runner.tickNow()
    expect(onPlanningDataChanged).toHaveBeenCalledTimes(1)

    await runner.confirmBlock(overlay.shown[0]!.blockId)
    expect(onPlanningDataChanged).toHaveBeenCalledTimes(2)
  })

  it('appelle onPlanningDataChanged quand un retard est crédité, pas seulement sur confirmation', async () => {
    const storage = fakeStorage(oneTaskSeed())
    const overlay = fakeOverlay()

    const discoverRunner = createPlanRunner({ storage, overlay, now: () => WAKE })
    await discoverRunner.tickNow()

    const onPlanningDataChanged = vi.fn()
    const afterEnd = new Date(WAKE.getTime() + 90 * 60_000)
    const lateRunner = createPlanRunner({ storage, overlay, now: () => afterEnd, onPlanningDataChanged })
    await lateRunner.tickNow()

    expect(onPlanningDataChanged).toHaveBeenCalledTimes(1)

    // Un tic qui ne trouve rien de neuf à créditer ne notifie pas pour rien.
    await lateRunner.tickNow()
    expect(onPlanningDataChanged).toHaveBeenCalledTimes(1)
  })

  it('une fenêtre fermée sans confirmation crédite le retard plein et fait avancer le compteur de ratés', async () => {
    const storage = fakeStorage(oneTaskSeed()) as Storage & { __mem: Map<string, unknown> }
    const overlay = fakeOverlay()

    // Découvre où le moteur place le bloc, sans jamais le confirmer.
    const discoverRunner = createPlanRunner({ storage, overlay, now: () => WAKE })
    await discoverRunner.tickNow()
    const block = overlay.shown[0]!

    // Avance directement après la fin de sa fenêtre : jamais confirmé.
    const afterEnd = new Date(WAKE.getTime() + 90 * 60_000)
    const lateRunner = createPlanRunner({ storage, overlay, now: () => afterEnd })
    await lateRunner.tickNow()

    const learning = storage.__mem.get('learning') as LearningState
    expect(learning.dailyDelayMinutes['2026-08-17']).toBeGreaterThan(0)
    expect(
      learning.consecutiveDelays['11111111-1111-4111-8111-111111111111'],
    ).toBe(1)

    // Un deuxième tic ne double pas le crédit.
    const before = learning.dailyDelayMinutes['2026-08-17']
    await lateRunner.tickNow()
    const learningAfter = storage.__mem.get('learning') as LearningState
    expect(learningAfter.dailyDelayMinutes['2026-08-17']).toBe(before)
    void block
  })

  it('une session de blocage expirée est nettoyée, jamais laissée active en mémoire', async () => {
    const storage = fakeStorage(oneTaskSeed()) as Storage & { __mem: Map<string, unknown> }
    const overlay = fakeOverlay()
    const runner = createPlanRunner({ storage, overlay, now: () => WAKE })

    await runner.tickNow()
    await runner.confirmBlock(overlay.shown[0]!.blockId)
    const active = (storage.__mem.get('blocking_rules') as BlockingRulesState).block
    expect(active).not.toBeNull()

    // Bien après la fin de la session confirmée.
    const later = new Date(WAKE.getTime() + 6 * 60 * 60_000)
    const laterRunner = createPlanRunner({ storage, overlay, now: () => later })
    await laterRunner.tickNow()

    const rules = storage.__mem.get('blocking_rules') as BlockingRulesState
    expect(rules.block).toBeNull()
  })

  it('BUG RÉEL DU 2026-08-23 : un bloc confirmé ne redéclenche pas l’overlay une minute plus tard, toujours dans sa propre fenêtre', async () => {
    // C'était exactement le bug rapporté : « Je commence » semblait n'avoir
    // aucun effet — l'overlay revenait dans la minute, le retard ne se
    // mesurait jamais. Cause : l'id d'un bloc encode `slot.startMinute`
    // (`engine.ts`), et `notBeforeMinute` (D.9) cale le début du premier
    // créneau disponible d'aujourd'hui sur `nowMinute` à CHAQUE recalcul —
    // le bloc actif change donc d'id à chaque minute qui passe, et une
    // confirmation faite sous l'ancien id ne matchait plus rien au tic
    // suivant.
    const storage = fakeStorage(oneTaskSeed()) as Storage & { __mem: Map<string, unknown> }
    const overlay = fakeOverlay()
    let nowRef = WAKE
    const runner = createPlanRunner({ storage, overlay, now: () => nowRef })

    await runner.tickNow()
    const blockId = overlay.shown[0]!.blockId
    const confirmResult = await runner.confirmBlock(blockId)
    expect(confirmResult).toEqual({ ok: true })
    const shownAfterConfirm = overlay.shown.length

    // En vrai, l'horloge tique toutes les 5 secondes — plusieurs tics ont
    // largement le temps de passer AVANT que la minute change. Un premier tic
    // à la même minute que la confirmation doit précéder l'avance dans le
    // temps, pas être sauté : c'est justement ce tic-là qui, dans la version
    // bogguée, effaçait `observedPending` (plus rien à afficher une fois
    // confirmé) et perdait la stabilisation avec.
    await runner.tickNow()
    await runner.tickNow()

    // Toujours dans la fenêtre de la tâche (60 min) : 2 minutes plus tard seulement.
    nowRef = new Date(WAKE.getTime() + 2 * 60_000)
    await runner.tickNow()

    expect(overlay.shown.length).toBe(shownAfterConfirm)
  })

  it('sans rien à confirmer, aucun overlay ne s’affiche', async () => {
    const storage = fakeStorage({
      settings,
      tasks: { tasks: [] },
      objectives: { objectives: [] },
      ancres: { ancres: [] },
      schedule: { entries: [] },
    })
    const overlay = fakeOverlay()
    const runner = createPlanRunner({ storage, overlay, now: () => WAKE })

    await runner.tickNow()
    expect(overlay.shown).toEqual([])
  })
})

describe('B.5.2 — l’application termine la tâche elle-même, quand le temps a été fait', () => {
  /** Un découpage en 3 parties de 60 min, échéance lointaine, sans emploi du temps. */
  function splitSeed() {
    const base = {
      plan: 'Plan d’action pour la tâche découpée.',
      deadline: '2026-08-24',
      importance: 5,
      category: 'général',
      workKind: 'routine' as const,
      correctionFactor: 1,
      appsToBlock: [],
      status: 'active' as const,
      createdAt: '2026-08-01T10:00:00.000Z',
    }
    const tasks: TasksState = {
      tasks: [
        // Le regroupement : aucune minute propre (B.5).
        {
          ...base,
          id: '00000000-0000-4000-8000-000000000000',
          title: 'Dossier',
          estimatedMinutes: 180,
          remainingMinutes: 0,
          parentTaskId: null,
          partOrder: null,
          extraMinutes: 0,
        },
        ...[1, 2, 3].map((n) => ({
          ...base,
          id: `0000000${n}-0000-4000-8000-00000000000${n}`,
          title: `Dossier — Partie ${n}`,
          estimatedMinutes: 60,
          remainingMinutes: 60,
          parentTaskId: '00000000-0000-4000-8000-000000000000',
          partOrder: n,
          extraMinutes: 0,
        })),
      ],
    }
    return { settings, tasks, objectives: { objectives: [] }, ancres: { ancres: [] }, schedule: { entries: [] } }
  }

  const partId = (n: number) => `0000000${n}-0000-4000-8000-00000000000${n}`

  const readTasks = (storage: Storage & { __mem: Map<string, unknown> }) =>
    (storage.__mem.get('tasks') as TasksState).tasks

  const readLearning = (storage: Storage & { __mem: Map<string, unknown> }) =>
    storage.__mem.get('learning') as LearningState | undefined

  it('confirmer puis laisser la fenêtre s’écouler crédite le travail — et TERMINE la tâche sans aucun clic', async () => {
    let nowRef = WAKE
    const storage = fakeStorage(splitSeed()) as Storage & { __mem: Map<string, unknown> }
    const overlay = fakeOverlay()
    const runner = createPlanRunner({ storage, overlay, now: () => nowRef })

    // La fenêtre de la partie 1 s'ouvre : l'overlay demande « Je commence ».
    await runner.tickNow()
    expect(overlay.shown).toHaveLength(1)
    const blockId = overlay.shown[0]!.blockId

    // L'utilisateur confirme pile à l'heure.
    expect(await runner.confirmBlock(blockId)).toEqual({ ok: true })

    // Rien n'est encore crédité : le travail n'a pas eu lieu, seulement démarré.
    expect(readLearning(storage)?.workedMinutesByRef[partId(1)] ?? 0).toBe(0)
    expect(readTasks(storage).find((t) => t.id === partId(1))!.status).toBe('active')

    // Deux heures plus tard : la fenêtre s'est écoulée pour de bon.
    nowRef = new Date(WAKE.getTime() + 120 * 60_000)
    await runner.tickNow()

    // Le temps a été fait — l'application le constate et termine, seule.
    expect(readLearning(storage)!.workedMinutesByRef[partId(1)]).toBeGreaterThanOrEqual(60)
    expect(readTasks(storage).find((t) => t.id === partId(1))!.status).toBe('history')

    // G.1 : une observation est née d'une MESURE, jamais d'une déclaration.
    const observation = readLearning(storage)!.observations.find((o) => o.taskId === partId(1))
    expect(observation).toMatchObject({ estimatedMinutes: 60, completed: true })
    expect(observation!.actualMinutes).toBeGreaterThanOrEqual(60)

    // Et les parties suivantes n'ont jamais été touchées entre-temps.
    expect(readTasks(storage).find((t) => t.id === partId(2))!.status).toBe('active')
    expect(readTasks(storage).find((t) => t.id === partId(3))!.status).toBe('active')
  })

  it('une partie VERROUILLÉE ne déclenche jamais l’overlay, même si son aperçu couvre maintenant', async () => {
    const storage = fakeStorage(splitSeed()) as Storage & { __mem: Map<string, unknown> }
    const overlay = fakeOverlay()
    const runner = createPlanRunner({ storage, overlay, now: () => WAKE })

    await runner.tickNow()

    // Un seul overlay, et c'est celui de la partie 1 — jamais 2 ni 3.
    expect(overlay.shown).toHaveLength(1)
    expect(overlay.shown[0]!.label).toBe('Dossier — Partie 1')
  })

  it('un bloc jamais confirmé ne crédite AUCUN travail — seulement du retard (D.7)', async () => {
    let nowRef = WAKE
    const storage = fakeStorage(splitSeed()) as Storage & { __mem: Map<string, unknown> }
    const overlay = fakeOverlay()
    const runner = createPlanRunner({ storage, overlay, now: () => nowRef })

    await runner.tickNow() // la fenêtre s'ouvre, personne ne confirme
    nowRef = new Date(WAKE.getTime() + 120 * 60_000)
    await runner.tickNow() // elle se ferme

    expect(readLearning(storage)!.workedMinutesByRef[partId(1)] ?? 0).toBe(0)
    expect(readTasks(storage).find((t) => t.id === partId(1))!.status).toBe('active')
    // Le retard, lui, a bien été mesuré.
    expect(readLearning(storage)!.dailyDelayMinutes['2026-08-17']).toBeGreaterThan(0)
  })
})

describe('BUG RAPPORTÉ LE 2026-08-23 — « le Début ne commence jamais, le bloc se repousse indéfiniment »', () => {
  /** Avance l'horloge minute par minute, en tiquant à chaque fois. */
  async function tickThroughMinutes(runner: { tickNow: () => Promise<void> }, setNow: (d: Date) => void, count: number) {
    for (let i = 0; i < count; i++) {
      setNow(new Date(WAKE.getTime() + i * 60_000))
      await runner.tickNow()
    }
  }

  it('l’overlay s’affiche UNE fois et ne se rouvre pas à chaque minute', async () => {
    let nowRef = WAKE
    const storage = fakeStorage(oneTaskSeed({ estimatedMinutes: 300, remainingMinutes: 300 }))
    const overlay = fakeOverlay()
    const runner = createPlanRunner({ storage, overlay, now: () => nowRef })

    await tickThroughMinutes(runner, (d) => { nowRef = d }, 6)

    // Ce qui compte n'est pas le nombre d'APPELS à `show` (le vrai overlay est
    // idempotent sur le blockId, `confirmation-overlay.ts`) mais le nombre
    // d'IDENTITÉS distinctes : chacune détruit la fenêtre et en reconstruit
    // une. C'est ça, « l'overlay revient toutes les minutes ».
    const identites = new Set(overlay.shown.map((b) => b.blockId))
    expect([...identites]).toHaveLength(1)
  })

  it('CONFIRMER avec l’id AFFICHÉ marche encore après plusieurs recalculs', async () => {
    // Le cœur du bug rapporté : l'overlay affiche un id stabilisé, mais
    // `confirmBlock` le cherchait dans un plan FRAÎCHEMENT recalculé où le
    // bloc a déjà glissé à « maintenant » — donc un autre id. Le bouton
    // « Je commence » répondait « ce bloc ne fait plus partie du plan », et le
    // temps de travail ne démarrait jamais.
    let nowRef = WAKE
    const storage = fakeStorage(oneTaskSeed({ estimatedMinutes: 300, remainingMinutes: 300 }))
    const overlay = fakeOverlay()
    const runner = createPlanRunner({ storage, overlay, now: () => nowRef })

    await runner.tickNow()
    const affiche = overlay.shown[0]!.blockId

    // Quelques minutes passent sans confirmation : le plan se recalcule et le
    // bloc glisse, exactement comme sur les captures (15:24 → 16:02).
    await tickThroughMinutes(runner, (d) => { nowRef = d }, 5)

    expect(await runner.confirmBlock(affiche)).toEqual({ ok: true })
  })
})

describe('DÉFAUT RÉEL DU 2026-08-23 — le bloc confirmé glissait à l’infini, le travail n’était jamais crédité', () => {
  const readLearning2 = (s: Storage & { __mem: Map<string, unknown> }) =>
    s.__mem.get('learning') as LearningState | undefined

  it('un bloc confirmé reste ÉPINGLÉ à son heure de début, il ne glisse plus avec « maintenant »', async () => {
    let nowRef = WAKE
    const storage = fakeStorage(oneTaskSeed({ estimatedMinutes: 300, remainingMinutes: 300 })) as Storage & {
      __mem: Map<string, unknown>
    }
    const overlay = fakeOverlay()
    const runner = createPlanRunner({ storage, overlay, now: () => nowRef })

    await runner.tickNow()
    const blockId = overlay.shown[0]!.blockId
    const debutReel = overlay.shown[0]!.startMinute
    expect(await runner.confirmBlock(blockId)).toEqual({ ok: true })

    // 20 minutes de travail plus tard, toujours dans la fenêtre du bloc.
    nowRef = new Date(WAKE.getTime() + 20 * 60_000)
    await runner.tickNow()

    const confirmations = storage.__mem.get('session_confirmations') as SessionConfirmationsState
    // L'état persisté garde UNE seule confirmation — pas une par minute.
    // C'est exactement ce qui avait produit 71 entrées le 2026-08-23.
    expect(Object.keys(confirmations.confirmedAt)).toEqual([blockId])
    // Et le bloc surveillé n'a pas bougé d'une minute.
    expect(confirmations.observedPending?.startMinute).toBe(debutReel)
  })

  it('le temps de travail AVANCE pendant la session, sans attendre la fin du bloc', async () => {
    let nowRef = WAKE
    const storage = fakeStorage(oneTaskSeed({ estimatedMinutes: 300, remainingMinutes: 300 })) as Storage & {
      __mem: Map<string, unknown>
    }
    const overlay = fakeOverlay()
    const runner = createPlanRunner({ storage, overlay, now: () => nowRef })

    await runner.tickNow()
    await runner.confirmBlock(overlay.shown[0]!.blockId)
    const refId = '11111111-1111-4111-8111-111111111111'

    // Rien encore : la session vient de démarrer.
    expect(readLearning2(storage)?.workedMinutesByRef[refId] ?? 0).toBe(0)

    nowRef = new Date(WAKE.getTime() + 20 * 60_000)
    await runner.tickNow()
    const apres20 = readLearning2(storage)!.workedMinutesByRef[refId] ?? 0

    nowRef = new Date(WAKE.getTime() + 45 * 60_000)
    await runner.tickNow()
    const apres45 = readLearning2(storage)!.workedMinutesByRef[refId] ?? 0

    // Le compteur monte AU FIL des minutes — c'est ça, « le temps se lance ».
    expect(apres20).toBeGreaterThan(0)
    expect(apres45).toBeGreaterThan(apres20)
    expect(apres45).toBeLessThanOrEqual(45)
  })

  it('les mêmes minutes ne sont jamais créditées deux fois, même en tiquant sans arrêt', async () => {
    let nowRef = WAKE
    const storage = fakeStorage(oneTaskSeed({ estimatedMinutes: 300, remainingMinutes: 300 })) as Storage & {
      __mem: Map<string, unknown>
    }
    const overlay = fakeOverlay()
    const runner = createPlanRunner({ storage, overlay, now: () => nowRef })

    await runner.tickNow()
    await runner.confirmBlock(overlay.shown[0]!.blockId)
    const refId = '11111111-1111-4111-8111-111111111111'

    // 30 tics à la même minute : le tic réel tourne toutes les 5 secondes.
    nowRef = new Date(WAKE.getTime() + 30 * 60_000)
    for (let i = 0; i < 30; i++) await runner.tickNow()

    expect(readLearning2(storage)!.workedMinutesByRef[refId]).toBeLessThanOrEqual(30)
  })
})

describe('DÉFAUT DU 2026-08-23 — « ce bloc ne fait plus partie du plan » alors qu’il est là', () => {
  it('confirmer avec l’id vu une minute plus tôt reste ACCEPTÉ', async () => {
    // Reproduit la capture : l'utilisateur voit le bloc, clique, et se fait
    // répondre qu'il n'existe plus. L'id d'un bloc encode sa minute de début
    // (D.9 la recale sur « maintenant » à chaque recalcul), donc l'id vu à
    // T ne correspond plus au scan frais fait à T+1.
    let nowRef = WAKE
    const storage = fakeStorage(oneTaskSeed({ estimatedMinutes: 300, remainingMinutes: 300 }))
    const overlay = fakeOverlay()
    const runner = createPlanRunner({ storage, overlay, now: () => nowRef })

    await runner.tickNow()
    const vu = overlay.shown[0]!.blockId

    // Le temps passe pendant que l'overlay est affiché — l'utilisateur lit,
    // hésite, puis clique.
    nowRef = new Date(WAKE.getTime() + 3 * 60_000)

    const res = await runner.confirmBlock(vu)
    expect(res).toEqual({ ok: true })
  })

  it('un id qui n’a jamais rien à voir avec le plan reste REFUSÉ', async () => {
    // Le filet ne doit pas devenir un passe-partout : confirmer n'importe quoi
    // écrirait une session de blocage sur un bloc inexistant.
    const storage = fakeStorage(oneTaskSeed())
    const overlay = fakeOverlay()
    const runner = createPlanRunner({ storage, overlay, now: () => WAKE })

    await runner.tickNow()
    const res = await runner.confirmBlock('task-inexistant-2026-08-17-999')
    expect(res.ok).toBe(false)
  })
})

describe('« Stop » pendant une séance (spec moteur 2026-09-25)', () => {
  it('arrête, lève le blocage, garde la raison — et l’overlay ne redemande pas dans la foulée', async () => {
    let nowRef = WAKE
    const storage = fakeStorage(oneTaskSeed({ estimatedMinutes: 300, remainingMinutes: 300 })) as Storage & {
      __mem: Map<string, unknown>
    }
    const overlay = fakeOverlay()
    const runner = createPlanRunner({ storage, overlay, now: () => nowRef })

    await runner.tickNow()
    const blockId = overlay.shown[0]!.blockId
    expect(await runner.confirmBlock(blockId)).toEqual({ ok: true })

    nowRef = new Date(WAKE.getTime() + 20 * 60_000)
    await runner.tickNow()
    // « Stop » touché 1 min avant la réponse : l'arrêt date du toucher.
    const stop = await runner.stopBlock({ reason: 'tired', text: 'so tired', answerMs: 60_000 })
    // Un Stop repousse le travail, il ne l'efface jamais : des créneaux où le promettre.
    expect(stop).toMatchObject({ ok: true, step: 'stopped', minutes: expect.any(Number) })
    expect(stop.ok && stop.step === 'stopped' && stop.options.length).toBeGreaterThan(0)

    const rules = storage.__mem.get('blocking_rules') as BlockingRulesState
    expect(rules.block).toBeNull()
    const learning = storage.__mem.get('learning') as LearningState
    const e = learning.sessionEvents.find((x) => x.blockId === blockId)!
    expect(e).toMatchObject({ stoppedEarly: true, heldMinutes: 19, stop: { reason: 'tired', text: 'so tired', textReason: 'tired' } })

    const avant = overlay.shown.length
    for (const m of [21, 30, 60]) {
      nowRef = new Date(WAKE.getTime() + m * 60_000)
      await runner.tickNow()
    }
    expect(overlay.shown.length).toBe(avant)
    // Un second « Stop » sur une séance déjà arrêtée ne fait rien.
    expect((await runner.stopBlock({ reason: 'boring' })).ok).toBe(false)
  })

  it('un texte de détresse : l’aide humaine, et plus d’overlay pendant 24 h', async () => {
    let nowRef = WAKE
    const storage = fakeStorage(oneTaskSeed({ estimatedMinutes: 300, remainingMinutes: 300 }))
    const overlay = fakeOverlay()
    const runner = createPlanRunner({ storage, overlay, now: () => nowRef })
    await runner.tickNow()
    await runner.confirmBlock(overlay.shown[0]!.blockId)
    nowRef = new Date(WAKE.getTime() + 10 * 60_000)
    const r = await runner.stopBlock({ reason: null, text: 'I want to die' })
    expect(r.ok && r.step === 'stopped' && r.help).toBeTruthy()
    const avant = overlay.shown.length
    const apprisAvant = (storage as Storage & { __mem: Map<string, unknown> }).__mem.get('learning') as LearningState
    const nonDemarresAvant = apprisAvant.sessionEvents.filter((e) => !e.started).length
    for (const m of [180, 240, 300, 360]) {
      nowRef = new Date(WAKE.getTime() + m * 60_000)
      await runner.tickNow()
    }
    expect(overlay.shown.length).toBe(avant)
    // Pendant la pause de détresse, rien n'est compté : ni raté, ni retard.
    const apres = (storage as Storage & { __mem: Map<string, unknown> }).__mem.get('learning') as LearningState
    expect(apres.sessionEvents.filter((e) => !e.started).length).toBe(nonDemarresAvant)
    expect(Object.values(apres.consecutiveDelays).every((n) => n === 0)).toBe(true)
  })

  it('les tentatives d’apps bloquées comptent dans la séance en cours, sous le même verrou', async () => {
    const storage = fakeStorage(oneTaskSeed()) as Storage & { __mem: Map<string, unknown> }
    const overlay = fakeOverlay()
    const runner = createPlanRunner({ storage, overlay, now: () => WAKE })
    await runner.tickNow()
    const blockId = overlay.shown[0]!.blockId
    await runner.confirmBlock(blockId)
    await Promise.all([runner.recordBlockedAttempt(), runner.tickNow(), runner.recordBlockedAttempt()])
    const learning = storage.__mem.get('learning') as LearningState
    expect(learning.sessionEvents.find((x) => x.blockId === blockId)!.blockedAttempts).toBe(2)
  })
})

describe('Prolongation (spec moteur 2026-09-25)', () => {
  it('l’offre vient dans les 2 dernières minutes ; « Oui » allonge la séance et son blocage', async () => {
    const passe = Array.from({ length: 8 }, (_, i) => ({
      blockId: `p${i}`,
      date: `2026-08-0${i + 1}`,
      kind: 'task' as const,
      refId: 'autre',
      category: 'général',
      plannedStartMinute: 9 * 60 + 30,
      plannedMinutes: 90,
      started: true,
      delayMinutes: 0,
      spontaneous: false,
      heldMinutes: 90,
      stoppedEarly: false,
      blockedAttempts: 0,
      load48hMinutes: 0,
      createdAt: '2026-08-01T09:30:00.000Z',
    }))
    let nowRef = WAKE
    const storage = fakeStorage({
      ...oneTaskSeed({ estimatedMinutes: 60, remainingMinutes: 60 }),
      learning: LearningStateSchema.parse({ sessionEvents: passe }),
    }) as Storage & { __mem: Map<string, unknown> }
    const overlay = fakeOverlay()
    const runner = createPlanRunner({ storage, overlay, now: () => nowRef })
    await runner.tickNow()
    const blockId = overlay.shown[0]!.blockId
    expect(await runner.confirmBlock(blockId)).toEqual({ ok: true })
    const avant = (storage.__mem.get('blocking_rules') as BlockingRulesState).block!.endsAt

    // Trop tôt : rien.
    nowRef = new Date(WAKE.getTime() + 20 * 60_000)
    expect(await runner.extensionOffer()).toBeNull()

    const conf = storage.__mem.get('session_confirmations') as { observedPending: { workMinutes: number } }
    nowRef = new Date(WAKE.getTime() + (conf.observedPending.workMinutes - 1) * 60_000)
    const offre = await runner.extensionOffer()
    expect(offre?.minutes).toBeGreaterThan(0)
    // Relue, la même offre revient sans être recomptée.
    expect(await runner.extensionOffer()).toEqual(offre)

    expect(await runner.acceptExtension()).toEqual({ ok: true })
    const learning = storage.__mem.get('learning') as LearningState
    expect(learning.sessionEvents.find((e) => e.blockId === blockId)!.extensionMinutes).toBe(offre!.minutes)
    expect(learning.extensionOffers).toEqual([{ date: '2026-08-17', accepted: true }])
    const apres = (storage.__mem.get('blocking_rules') as BlockingRulesState).block!.endsAt
    expect(apres).toBeGreaterThan(avant)
  })
})
