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
  console.warn('[nexus] preload absent — réserve mémoire de développement active.')

  // `?demo` ouvre l'application déjà connectée, pour regarder les écrans sans
  // passer par l'inscription. Ce compte n'existe que dans cette page : aucun
  // mot de passe n'est stocké, et le hachage est volontairement inutilisable.
  if (new URLSearchParams(window.location.search).has('demo')) {
    const now = new Date().toISOString()
    memory.set('auth', {
      account: {
        id: '00000000-0000-4000-8000-000000000000',
        name: 'Démo',
        email: 'demo@local',
        passwordHash: 'demo-non-utilisable',
        passwordSalt: 'demo-non-utilisable',
        createdAt: now,
        updatedAt: now,
      },
      session: { accountId: '00000000-0000-4000-8000-000000000000', signedInAt: now },
    })
    memory.set('settings', { onboardingCompleted: true, sleepStart: '23:30', sleepEnd: '07:00' })
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
      discoverInstalledApps: async () => [],
      refreshInstalledApps: async () => [],
      onFlushDebounces: () => () => undefined,
      onUpdateAvailable: () => () => undefined,
      onUpdateDownloaded: () => () => undefined,
      setSleepWindow: noop,
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
    },
  }
}

export const nexus: NexusApi =
  window.nexus ?? (import.meta.env.DEV ? createBrowserStub() : window.nexus)
