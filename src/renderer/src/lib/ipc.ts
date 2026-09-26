/**
 * Wrapper typé sur window.nexus.
 * Permet d'importer une API testable plutôt que d'accéder à window directement.
 */
import type { NexusApi } from '../../../preload/index'

/**
 * Doublure de développement.
 *
 * Hors d'Electron — quand on ouvre le renderer dans un navigateur pour
 * travailler l'interface — le préchargement n'existe pas et `window.nexus` est
 * absent. Plutôt que de planter au premier appel, on sert une réserve en
 * mémoire. Elle ne franchit jamais la frontière du build de production :
 * `import.meta.env.DEV` est constant à la compilation, la branche disparaît.
 */
function createBrowserStub(): NexusApi {
  const memory = new Map<string, unknown>()
  const noop = async () => undefined
  const demo = new URLSearchParams(window.location.search).has('demo')
  const now = new Date().toISOString()
  const localDate = (offsetDays: number) => {
    const date = new Date()
    date.setDate(date.getDate() + offsetDays)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate(),
    ).padStart(2, '0')}`
  }
  const demoApps = demo
    ? [
        {
          name: 'Discord',
          exeName: 'Discord.exe',
          exePath: 'C:\\Demo\\Discord.exe',
          publisher: 'Discord Inc.',
          category: 'social' as const,
        },
        {
          name: 'Steam',
          exeName: 'Steam.exe',
          exePath: 'C:\\Demo\\Steam.exe',
          publisher: 'Valve',
          category: 'games' as const,
        },
        {
          name: 'YouTube Music',
          exeName: 'YouTube Music.exe',
          exePath: 'C:\\Demo\\YouTube Music.exe',
          publisher: 'Google',
          category: 'entertainment' as const,
        },
        {
          name: 'Premiere Pro',
          exeName: 'Adobe Premiere Pro.exe',
          exePath: 'C:\\Demo\\Adobe Premiere Pro.exe',
          publisher: 'Adobe',
          category: 'creativity' as const,
        },
        {
          name: 'Obsidian',
          exeName: 'Obsidian.exe',
          exePath: 'C:\\Demo\\Obsidian.exe',
          publisher: 'Dynalist Inc.',
          category: 'productivity' as const,
        },
      ]
    : []
  console.warn('[nexus] preload missing — in-memory development store active.')

  // `?demo` ouvre l'application déjà connectée, pour regarder les écrans sans
  // passer par l'inscription. Ce compte n'existe que dans cette page : aucun
  // mot de passe n'est stocké, et le hachage est volontairement inutilisable.
  if (demo) {
    const today = localDate(0)
    memory.set('auth', {
      account: {
        id: '00000000-0000-4000-8000-000000000000',
        name: 'Demo',
        email: 'demo@local',
        passwordHash: 'demo-non-utilisable',
        passwordSalt: 'demo-non-utilisable',
        createdAt: now,
        updatedAt: now,
      },
      session: { accountId: '00000000-0000-4000-8000-000000000000', signedInAt: now },
    })
    memory.set('settings', { onboardingCompleted: true, sleepStart: '23:30', sleepEnd: '07:00' })
    memory.set('schedule', {
      entries: [
        ...[0, 1, 2, 3, 4].map((dayOfWeek) => ({
          dayOfWeek,
          startMinute: 8 * 60 + 30,
          endMinute: 12 * 60,
          categoryType: 'school',
          label: 'Cours',
          color: '#c9d4de',
        })),
        ...[0, 2, 4].map((dayOfWeek) => ({
          dayOfWeek,
          startMinute: 13 * 60,
          endMinute: 15 * 60 + 30,
          categoryType: 'school',
          label: 'Atelier',
          color: '#c9d4de',
        })),
        {
          dayOfWeek: 5,
          startMinute: 10 * 60,
          endMinute: 12 * 60,
          categoryType: 'commitment',
          label: 'Engagement fixe',
          color: '#c6c6c6',
        },
      ],
    })
    memory.set('tasks', {
      tasks: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          title: 'Maths assignment',
          plan: 'Solve exercises 4 to 8, then reread the mistakes in the notebook.',
          deadline: localDate(3),
          importance: 8,
          category: 'school',
          workKind: 'novel',
          estimatedMinutes: 150,
          remainingMinutes: 210,
          correctionFactor: 1.4,
          parentTaskId: null,
          partOrder: null,
          extraMinutes: 0,
          appsToBlock: ['Discord.exe', 'Steam.exe'],
          status: 'active',
          createdAt: now,
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          title: 'Video edit',
          plan: 'Assemble the first three minutes, fix the sound and export a draft.',
          deadline: localDate(5),
          importance: 6,
          category: 'creative',
          workKind: 'routine',
          estimatedMinutes: 120,
          remainingMinutes: 150,
          correctionFactor: 1.25,
          parentTaskId: null,
          partOrder: null,
          extraMinutes: 25,
          appsToBlock: ['Discord.exe', 'Steam.exe'],
          status: 'active',
          createdAt: now,
        },
      ],
    })
    memory.set('objectives', {
      objectives: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          name: 'Programmation',
          plan: 'Build the personal project in deep 45-minute sessions.',
          color: '#55585c',
          weeklyTargetMinutes: 240,
          appsToBlock: ['Discord.exe'],
          createdAt: now,
        },
      ],
    })
    memory.set('ancres', {
      ancres: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          name: 'Lecture',
          plan: 'Read without a phone before bed.',
          color: '#253047',
          trigger: 'lecture',
          anchorMinute: 21 * 60,
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          normalMaxMinutes: 30,
          minimumMinutes: 20,
          appsToBlock: ['Discord.exe', 'Steam.exe'],
          createdAt: now,
        },
      ],
    })
    memory.set('learning', {
      observations: [],
      anchorMissCounts: {},
      dailyUtilization: {},
      weeklyObjectiveServed: {},
      objectiveLastServed: {},
      lastSignalAt: {},
      tasksCreatedPerWeek: {},
      consecutiveDelays: {},
      workedMinutesByRef: { '11111111-1111-4111-8111-111111111111': 45 },
      dailyDelayMinutes: {},
    })
    memory.set('session_confirmations', {
      date: today,
      confirmedAt: {},
      lapsedCreditedRanges: [],
      workCreditedRanges: [],
      streakBumpedRefs: [],
      observedPending: null,
    })
  }

  return {
    storage: {
      read: async (key) => (memory.get(key) ?? null) as never,
      write: async (key, data) => {
        memory.set(key, data)
        return { ok: true as const }
      },
      exists: async (key) => memory.has(key),
    },
    app: {
      getVersion: async () => 'dev',
      openLogs: noop,
      discoverInstalledApps: async () => demoApps,
      refreshInstalledApps: async () => demoApps,
      setUserOverride: async () => ({ ok: true }),
      resetUserOverride: async () => ({ ok: true }),
      onCatalogUpdated: () => () => undefined,
      onFlushDebounces: () => () => undefined,
      onUpdateAvailable: () => () => undefined,
      onUpdateDownloaded: () => () => undefined,
      setSleepWindow: noop,
      // Hors d'Electron il n'y a pas de cadre natif à repeindre : le CSS suffit.
      setTheme: noop,
    },
    appUsage: {
      get: async () => ({ entries: [], lastTickAt: null }),
      onTick: () => () => undefined,
    },
    blocking: {
      getSession: async () => ({ active: false, blockedAppIds: [], endsAt: null }),
      minimizeAppWindow: async () => false,
      closeAppWindow: async () => false,
      onSessionChange: () => () => undefined,
      getAppKnowledgeBase: async () => ({ profiles: {} }),
      decideIntelligentBlocking: async () => ({ blockedApps: [], allowedApps: [], decisionState: 'RESOLVED' as const }),
      reviewBlockModification: async () => ({ accepted: true, reason: 'Granted (demo/dev mode).' }),
      onProgress: () => () => undefined,
    },
    planning: {
      confirmBlock: async () => ({ ok: true as const }),
      stopBlock: async () => ({ ok: true as const }),
      extensionOffer: async () => null,
      acceptExtension: async () => ({ ok: true as const }),
      freeDay: async () => null,
      decideFreeDay: async () => null,
      onChanged: () => () => undefined,
    },
  }
}

export const nexus: NexusApi =
  window.nexus ?? (import.meta.env.DEV ? createBrowserStub() : window.nexus)
