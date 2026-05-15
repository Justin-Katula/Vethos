import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTracker } from './app-usage-tracker'
import type { DeclaredApp, DeclaredAppUsageState } from '@shared/schemas'

const APP_VSCODE: DeclaredApp = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'VS Code',
  exeName: 'Code.exe',
  linkedObjectiveId: null,
  createdAt: '2026-05-05T00:00:00.000Z',
}

const APP_CHROME: DeclaredApp = {
  id: '22222222-2222-2222-2222-222222222222',
  name: 'Chrome',
  exeName: 'chrome.exe',
  linkedObjectiveId: null,
  createdAt: '2026-05-05T00:00:00.000Z',
}

function makeMocks(initial: DeclaredAppUsageState | null = null) {
  const storageState = { value: initial }
  const storage = {
    read: vi.fn(async () => storageState.value),
    write: vi.fn(async (data: DeclaredAppUsageState) => {
      storageState.value = data
    }),
  }
  const apps = { value: [] as DeclaredApp[] }
  const getDeclaredApps = vi.fn(async () => apps.value)
  const processes = { value: [] as { name: string; pid: number }[] }
  const listProcesses = vi.fn(async () => processes.value)
  const now = { value: new Date('2026-05-05T10:00:00.000Z') }
  const dateProvider = vi.fn(() => now.value)
  const localDateProvider = vi.fn(() => '2026-05-05')

  return {
    storage,
    getDeclaredApps,
    listProcesses,
    dateProvider,
    localDateProvider,
    setApps: (a: DeclaredApp[]) => {
      apps.value = a
    },
    setProcesses: (p: { name: string; pid: number }[]) => {
      processes.value = p
    },
    setNow: (d: Date, localDate?: string) => {
      now.value = d
      if (localDate) localDateProvider.mockReturnValue(localDate)
    },
    getStorageState: () => storageState.value,
  }
}

describe('app-usage-tracker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('tick avec 0 app déclarée = no-op', async () => {
    const m = makeMocks()
    const tracker = createTracker({
      storage: m.storage,
      getDeclaredApps: m.getDeclaredApps,
      listProcesses: m.listProcesses,
      now: m.dateProvider,
      localDate: m.localDateProvider,
    })
    await tracker.tick()
    await tracker.flushNow()
    expect(m.storage.write).not.toHaveBeenCalled()
  })

  it('tick avec 1 app déclarée + match = entrée +1 min sur date du jour', async () => {
    const m = makeMocks()
    m.setApps([APP_VSCODE])
    m.setProcesses([{ name: 'code.exe', pid: 1234 }])
    const tracker = createTracker({
      storage: m.storage,
      getDeclaredApps: m.getDeclaredApps,
      listProcesses: m.listProcesses,
      now: m.dateProvider,
      localDate: m.localDateProvider,
    })
    await tracker.tick()
    await tracker.flushNow()
    const state = m.getStorageState()
    expect(state).not.toBeNull()
    expect(state!.entries).toEqual([
      { appId: APP_VSCODE.id, date: '2026-05-05', minutes: 1 },
    ])
  })

  it('tick avec 1 app déclarée + 0 match = pas d\'entrée créée', async () => {
    const m = makeMocks()
    m.setApps([APP_VSCODE])
    m.setProcesses([{ name: 'firefox.exe', pid: 1 }])
    const tracker = createTracker({
      storage: m.storage,
      getDeclaredApps: m.getDeclaredApps,
      listProcesses: m.listProcesses,
      now: m.dateProvider,
      localDate: m.localDateProvider,
    })
    await tracker.tick()
    await tracker.flushNow()
    const state = m.getStorageState()
    // Soit pas d'écriture, soit lastTickAt mis à jour avec 0 entrées.
    if (state) expect(state.entries).toEqual([])
  })

  it('ticks consécutifs accumulent sur la même entrée', async () => {
    const m = makeMocks()
    m.setApps([APP_VSCODE])
    m.setProcesses([{ name: 'code.exe', pid: 1234 }])
    const tracker = createTracker({
      storage: m.storage,
      getDeclaredApps: m.getDeclaredApps,
      listProcesses: m.listProcesses,
      now: m.dateProvider,
      localDate: m.localDateProvider,
    })
    await tracker.tick()
    await tracker.tick()
    await tracker.tick()
    await tracker.flushNow()
    const state = m.getStorageState()
    expect(state!.entries).toEqual([
      { appId: APP_VSCODE.id, date: '2026-05-05', minutes: 3 },
    ])
  })

  it('plusieurs apps simultanées sont trackées indépendamment', async () => {
    const m = makeMocks()
    m.setApps([APP_VSCODE, APP_CHROME])
    m.setProcesses([
      { name: 'code.exe', pid: 1 },
      { name: 'chrome.exe', pid: 2 },
    ])
    const tracker = createTracker({
      storage: m.storage,
      getDeclaredApps: m.getDeclaredApps,
      listProcesses: m.listProcesses,
      now: m.dateProvider,
      localDate: m.localDateProvider,
    })
    await tracker.tick()
    await tracker.tick()
    await tracker.flushNow()
    const state = m.getStorageState()
    expect(state!.entries).toHaveLength(2)
    expect(state!.entries).toContainEqual({
      appId: APP_VSCODE.id,
      date: '2026-05-05',
      minutes: 2,
    })
    expect(state!.entries).toContainEqual({
      appId: APP_CHROME.id,
      date: '2026-05-05',
      minutes: 2,
    })
  })

  it('changement de jour crée une nouvelle entrée', async () => {
    const m = makeMocks()
    m.setApps([APP_VSCODE])
    m.setProcesses([{ name: 'code.exe', pid: 1 }])
    const tracker = createTracker({
      storage: m.storage,
      getDeclaredApps: m.getDeclaredApps,
      listProcesses: m.listProcesses,
      now: m.dateProvider,
      localDate: m.localDateProvider,
    })
    m.setNow(new Date('2026-05-05T23:59:00.000Z'), '2026-05-05')
    await tracker.tick()
    m.setNow(new Date('2026-05-06T00:01:00.000Z'), '2026-05-06')
    await tracker.tick()
    await tracker.flushNow()
    const state = m.getStorageState()
    expect(state!.entries).toHaveLength(2)
    expect(state!.entries).toContainEqual({
      appId: APP_VSCODE.id,
      date: '2026-05-05',
      minutes: 1,
    })
    expect(state!.entries).toContainEqual({
      appId: APP_VSCODE.id,
      date: '2026-05-06',
      minutes: 1,
    })
  })

  it('hydrate depuis disk au démarrage et ajoute aux entrées existantes', async () => {
    const m = makeMocks({
      entries: [{ appId: APP_VSCODE.id, date: '2026-05-05', minutes: 10 }],
      lastTickAt: '2026-05-05T09:00:00.000Z',
    })
    m.setApps([APP_VSCODE])
    m.setProcesses([{ name: 'code.exe', pid: 1 }])
    const tracker = createTracker({
      storage: m.storage,
      getDeclaredApps: m.getDeclaredApps,
      listProcesses: m.listProcesses,
      now: m.dateProvider,
      localDate: m.localDateProvider,
    })
    await tracker.hydrate()
    await tracker.tick()
    await tracker.flushNow()
    const state = m.getStorageState()
    expect(state!.entries).toEqual([
      { appId: APP_VSCODE.id, date: '2026-05-05', minutes: 11 },
    ])
  })

  it('matching exeName est case-insensitive', async () => {
    const m = makeMocks()
    m.setApps([APP_VSCODE])
    m.setProcesses([{ name: 'CODE.EXE', pid: 1 }])
    const tracker = createTracker({
      storage: m.storage,
      getDeclaredApps: m.getDeclaredApps,
      listProcesses: m.listProcesses,
      now: m.dateProvider,
      localDate: m.localDateProvider,
    })
    await tracker.tick()
    await tracker.flushNow()
    const state = m.getStorageState()
    expect(state!.entries).toEqual([
      { appId: APP_VSCODE.id, date: '2026-05-05', minutes: 1 },
    ])
  })

  it('limite l\'historique à 90 jours en évinçant les plus vieilles entrées', async () => {
    // Simule un état avec une entrée très ancienne
    const oldEntry = { appId: APP_VSCODE.id, date: '2025-01-01', minutes: 5 }
    const m = makeMocks({
      entries: [oldEntry],
      lastTickAt: null,
    })
    m.setApps([APP_VSCODE])
    m.setProcesses([{ name: 'code.exe', pid: 1 }])
    const tracker = createTracker({
      storage: m.storage,
      getDeclaredApps: m.getDeclaredApps,
      listProcesses: m.listProcesses,
      now: m.dateProvider,
      localDate: m.localDateProvider,
    })
    await tracker.hydrate()
    await tracker.tick()
    await tracker.flushNow()
    const state = m.getStorageState()
    // L'entrée du 2025-01-01 doit être éliminée (>90 jours du 2026-05-05)
    expect(state!.entries.find((e) => e.date === '2025-01-01')).toBeUndefined()
    expect(state!.entries.find((e) => e.date === '2026-05-05')).toBeDefined()
  })
})
