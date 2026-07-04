import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/ipc', () => ({
  vethos: {
    storage: {
      read: vi.fn(),
      write: vi.fn(),
    },
    coach: {
      categorizeApps: vi.fn(),
    },
    registry: {},
  },
}))

import { vethos } from '@/lib/ipc'
import { CURRENT_APP_SCAN_VERSION, useRegistryStore } from './registry.store'

const storage = vethos.storage as unknown as {
  write: ReturnType<typeof vi.fn>
}
const categorizeApps = vethos.coach.categorizeApps as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  storage.write.mockReset().mockResolvedValue({ ok: true })
  categorizeApps.mockReset().mockImplementation(async ({ apps }) =>
    Object.fromEntries(
      apps.map((app: { exeName: string }, index: number) => [
        app.exeName.toLowerCase(),
        index === 0 ? 'Development' : 'Utilities',
      ]),
    ),
  )
  useRegistryStore.setState({
    userId: 'user_test',
    loaded: true,
    items: [],
    appsLastScannedAt: null,
    appsScanVersion: 0,
  })
})

describe('useRegistryStore.syncDiscoveredApps', () => {
  it('conserve toutes les applications réellement découvertes, même sans exécutable', async () => {
    await useRegistryStore.getState().syncDiscoveredApps([
      {
        name: 'Éditeur local',
        exeName: 'Editor.exe',
        source: 'registry',
        hasExecutablePath: true,
        iconDataUrl: 'data:image/png;base64,ZmFrZQ==',
      },
      {
        name: 'Application empaquetée',
        exeName: '',
        packageId: 'Publisher.Packaged_app',
        source: 'appx',
        hasExecutablePath: false,
      },
      {
        name: 'Outil installé',
        exeName: '',
        source: 'registry',
        hasExecutablePath: false,
      },
    ])

    const apps = useRegistryStore.getState().items
    expect(apps).toHaveLength(3)
    expect(apps.map((app) => app.displayName)).toEqual([
      'Éditeur local',
      'Application empaquetée',
      'Outil installé',
    ])
    expect(apps[0]).toMatchObject({
      identifier: 'installed:registry:éditeur local',
      executableName: 'editor.exe',
      blockable: true,
      iconDataUrl: 'data:image/png;base64,ZmFrZQ==',
    })
    expect(apps[1]).toMatchObject({
      identifier: 'installed:publisher.packaged_app',
      blockable: false,
    })
    expect(apps[2]).toMatchObject({
      identifier: 'installed:registry:outil installé',
      blockable: false,
    })
    expect(apps.every((app) => Boolean(app.category))).toBe(true)
    expect(useRegistryStore.getState().appsLastScannedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u)
    expect(storage.write).toHaveBeenCalledWith(
      'registry',
      expect.objectContaining({
        items: expect.any(Array),
        appsLastScannedAt: expect.any(String),
        appsScanVersion: CURRENT_APP_SCAN_VERSION,
      }),
      'user_test',
    )
  })

  it('met à jour le même inventaire sans créer de doublons', async () => {
    const discovered = [
      {
        name: 'Éditeur local',
        exeName: 'Editor.exe',
        source: 'registry',
        hasExecutablePath: true,
      },
    ]

    await useRegistryStore.getState().syncDiscoveredApps(discovered)
    await useRegistryStore.getState().syncDiscoveredApps(discovered)

    expect(useRegistryStore.getState().items).toHaveLength(1)
  })

  it('garde deux applications différentes qui partagent le même exécutable', async () => {
    await useRegistryStore.getState().syncDiscoveredApps([
      {
        name: 'Application web A',
        exeName: 'browser.exe',
        source: 'shortcut',
        hasExecutablePath: true,
      },
      {
        name: 'Application web B',
        exeName: 'browser.exe',
        source: 'shortcut',
        hasExecutablePath: true,
      },
    ])

    const apps = useRegistryStore.getState().items
    expect(apps).toHaveLength(2)
    expect(new Set(apps.map((app) => app.identifier)).size).toBe(2)
    expect(apps.map((app) => app.executableName)).toEqual(['browser.exe', 'browser.exe'])
  })

  it('fusionne les applications avec le même exécutable et des noms similaires (fuzzy/encoding)', async () => {
    useRegistryStore.setState({
      items: [
        {
          id: 'existing-id',
          kind: 'app',
          identifier: 'installed:windows:cod',
          displayName: 'Cod',
          executableName: 'cod.exe',
          blockable: true,
          usageCount: 1,
          lastSeenAt: new Date().toISOString(),
          classified: false,
          demoted: false,
          usefulFor: { objectives: [], standaloneTasks: [] },
          createdAt: new Date().toISOString(),
        }
      ]
    })

    await useRegistryStore.getState().syncDiscoveredApps([
      {
        name: 'Call of Duty®',
        exeName: 'cod.exe',
        source: 'shortcut',
        hasExecutablePath: true,
        iconDataUrl: 'data:image/png;base64,Y29kLWljb24=',
      }
    ])

    const apps = useRegistryStore.getState().items
    expect(apps).toHaveLength(1)
    expect(apps[0]?.displayName).toBe('Call of Duty®')
    expect(apps[0]?.iconDataUrl).toBe('data:image/png;base64,Y29kLWljb24=')
  })

  it('fusionne les applications ayant des corruptions d\'encodage ou des noms tronqués', async () => {
    useRegistryStore.setState({
      items: [
        {
          id: 'existing-id',
          kind: 'app',
          identifier: 'installed:windows:callofdutyr',
          displayName: 'Call of Dutyr',
          executableName: 'cod.exe',
          blockable: true,
          usageCount: 1,
          lastSeenAt: new Date().toISOString(),
          classified: false,
          demoted: false,
          usefulFor: { objectives: [], standaloneTasks: [] },
          createdAt: new Date().toISOString(),
        }
      ]
    })

    await useRegistryStore.getState().syncDiscoveredApps([
      {
        name: 'Call of Duty®',
        exeName: 'cod.exe',
        source: 'shortcut',
        hasExecutablePath: true,
        iconDataUrl: 'data:image/png;base64,Y29kLWljb24=',
      }
    ])

    const apps = useRegistryStore.getState().items
    expect(apps).toHaveLength(1)
    expect(apps[0]?.displayName).toBe('Call of Duty®')
  })
})
