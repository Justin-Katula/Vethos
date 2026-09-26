import { describe, it, expect, beforeEach, vi } from 'vitest'

const storage = new Map<string, unknown>()

vi.stubGlobal('crypto', {
  ...globalThis.crypto,
  randomUUID: (() => {
    let n = 0
    return () =>
      `${String(++n).padStart(8, '0')}-1111-4111-8111-111111111111` as `${string}-${string}-${string}-${string}-${string}`
  })(),
})

vi.stubGlobal('window', {
  nexus: {
    storage: {
      read: async (key: string) => storage.get(key) ?? null,
      write: async (key: string, data: unknown) => {
        storage.set(key, data)
        return { ok: true as const }
      },
    },
  },
})

const { usePlanningStore } = await import('./planning.store')

const taskDraft = (over: Record<string, unknown> = {}) => ({
  title: 'Dossier',
  plan: 'Travailler sur le dossier à mon bureau ce soir.',
  deadline: '2026-08-20',
  importance: 5,
  category: 'général',
  workKind: 'routine' as const,
  estimatedMinutes: 100,
  remainingMinutes: 100,
  correctionFactor: 1.4,
  status: 'active' as const,
  ...over,
})

const ancreDraft = (over: Record<string, unknown> = {}) => ({
  name: 'Sport',
  plan: 'Faire ma séance de sport à la salle à 18h.',
  color: '#3ECF8E',
  trigger: 'sport',
  anchorMinute: 1080,
  daysOfWeek: [0, 2, 4],
  normalMaxMinutes: 60,
  ...over,
})

beforeEach(() => {
  storage.clear()
  usePlanningStore.setState({
    tasks: [],
    objectives: [],
    ancres: [],
    schedule: [],
    learning: {
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
    },
  })
})

describe('B.1 — l’estimation de l’utilisateur n’entre jamais brute dans le plan', () => {
  it('le facteur par défaut est appliqué à la création : 100 × 1.4 = 140', async () => {
    await usePlanningStore.getState().addTask(taskDraft())
    const [task] = usePlanningStore.getState().tasks
    expect(task!.estimatedMinutes).toBe(100)
    expect(task!.remainingMinutes).toBe(140)
    expect(task!.correctionFactor).toBe(1.4)
  })

  it('un travail nouveau/créatif réserve davantage : 100 × 1.7 = 170', async () => {
    await usePlanningStore.getState().addTask(taskDraft({ workKind: 'novel' }))
    expect(usePlanningStore.getState().tasks[0]!.remainingMinutes).toBe(170)
  })
})

describe('B.5 — découpage automatique, jamais une question', () => {
  it('une tâche qui ne tient pas dans un jour est découpée d’office', async () => {
    // 300 × 1.4 = 420 min planifiées, plafond 90 min/jour → 5 parts de 84.
    await usePlanningStore
      .getState()
      .addTask(taskDraft({ estimatedMinutes: 300 }), { maxPerDayMinutes: 90 })
    const tasks = usePlanningStore.getState().tasks

    const group = tasks.find((t) => t.parentTaskId === null)!
    const parts = tasks.filter((t) => t.parentTaskId === group.id)

    expect(parts).toHaveLength(5)
    expect(parts.reduce((s, t) => s + t.remainingMinutes, 0)).toBe(420)
    expect(parts[0]!.title).toBe('Dossier — Partie 1')
    // La tâche d'origine n'est plus qu'un regroupement visuel.
    expect(group.remainingMinutes).toBe(0)
  })

  it('une tâche qui tient dans un jour n’est pas découpée', async () => {
    await usePlanningStore
      .getState()
      .addTask(taskDraft({ estimatedMinutes: 60 }), { maxPerDayMinutes: 90 })
    expect(usePlanningStore.getState().tasks).toHaveLength(1)
  })

  it('supprimer le regroupement supprime ses sous-parties', async () => {
    await usePlanningStore
      .getState()
      .addTask(taskDraft({ estimatedMinutes: 300 }), { maxPerDayMinutes: 90 })
    const group = usePlanningStore.getState().tasks.find((t) => t.parentTaskId === null)!
    await usePlanningStore.getState().deleteTask(group.id)
    expect(usePlanningStore.getState().tasks).toHaveLength(0)
  })
})

describe('CRITÈRE 6 — deux ancres ne peuvent jamais occuper le même créneau', () => {
  it('la création de la seconde est refusée, sans décalage automatique', async () => {
    await usePlanningStore.getState().addAncre(ancreDraft())
    await expect(
      usePlanningStore
        .getState()
        .addAncre(ancreDraft({ name: 'Lecture', trigger: 'lecture', anchorMinute: 1110 })),
    ).rejects.toThrow(/Time clash/)
    expect(usePlanningStore.getState().ancres).toHaveLength(1)
  })

  it('une seule ancre par déclencheur', async () => {
    await usePlanningStore.getState().addAncre(ancreDraft())
    await expect(
      usePlanningStore
        .getState()
        .addAncre(ancreDraft({ name: 'Sport du soir', anchorMinute: 420, daysOfWeek: [1] })),
    ).rejects.toThrow(/trigger/)
  })

  it('un autre créneau, un autre déclencheur : accepté', async () => {
    await usePlanningStore.getState().addAncre(ancreDraft())
    await usePlanningStore
      .getState()
      .addAncre(ancreDraft({ name: 'Lecture', trigger: 'lecture', anchorMinute: 1260 }))
    expect(usePlanningStore.getState().ancres).toHaveLength(2)
  })

  it('D.3 : le minimum est calculé, pas déclaré — MAX(20, 40 % × 60) = 24', async () => {
    await usePlanningStore.getState().addAncre(ancreDraft())
    expect(usePlanningStore.getState().ancres[0]!.minimumMinutes).toBe(24)
  })
})

describe('B.5.2 — l’utilisateur ne termine plus une tâche, il dit seulement qu’il lui faut plus', () => {
  it('aucun moyen de déclarer une tâche terminée depuis le store', () => {
    // C'est l'horloge de planification (processus main) qui décide, quand le
    // temps prévu a été RÉELLEMENT fait. Une porte de sortie côté renderer
    // rouvrirait exactement ce que cette règle ferme.
    expect(usePlanningStore.getState()).not.toHaveProperty('completeTask')
  })

  it('« il m’en faut plus » gonfle extraMinutes, JAMAIS estimatedMinutes', async () => {
    await usePlanningStore.getState().addTask(taskDraft())
    const id = usePlanningStore.getState().tasks[0]!.id
    await usePlanningStore.getState().addMoreTime(id, 25)

    const task = usePlanningStore.getState().tasks[0]!
    expect(task.extraMinutes).toBe(25)
    // Intacte : c'est elle que le facteur de correction compare au réel (B.2).
    // La gonfler effacerait la seule preuve que la tâche a coûté plus cher.
    expect(task.estimatedMinutes).toBe(100)
  })

  it('les minutes s’accumulent, elles ne se remplacent pas', async () => {
    await usePlanningStore.getState().addTask(taskDraft())
    const id = usePlanningStore.getState().tasks[0]!.id
    await usePlanningStore.getState().addMoreTime(id, 25)
    await usePlanningStore.getState().addMoreTime(id, 25)
    expect(usePlanningStore.getState().tasks[0]!.extraMinutes).toBe(50)
  })

  it('une tâche déjà terminée par l’horloge redevient active', async () => {
    await usePlanningStore.getState().addTask(taskDraft())
    const id = usePlanningStore.getState().tasks[0]!.id
    usePlanningStore.setState({
      tasks: usePlanningStore.getState().tasks.map((t) => ({ ...t, status: 'history' as const })),
    })

    await usePlanningStore.getState().addMoreTime(id, 25)
    expect(usePlanningStore.getState().tasks[0]!.status).toBe('active')
  })
})

describe('persistance — ce qui sort du disque est validé', () => {
  it('un fichier invalide ne devient jamais un état corrompu en mémoire', async () => {
    storage.set('tasks', { tasks: [{ title: 'incomplet' }] })
    await usePlanningStore.getState().load()
    expect(usePlanningStore.getState().tasks).toEqual([])
    expect(usePlanningStore.getState().loaded).toBe(true)
  })

  it('ce qui est écrit est relu à l’identique', async () => {
    await usePlanningStore.getState().addTask(taskDraft())
    const written = usePlanningStore.getState().tasks
    usePlanningStore.setState({ tasks: [] })
    await usePlanningStore.getState().load()
    expect(usePlanningStore.getState().tasks).toEqual(written)
  })
})
