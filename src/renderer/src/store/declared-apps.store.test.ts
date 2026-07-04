import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/ipc', () => ({
  vethos: {
    storage: {
      read: vi.fn(),
      write: vi.fn(),
      exists: vi.fn(),
    },
  },
}))

import { useDeclaredAppsStore } from './declared-apps.store'
import { vethos } from '@/lib/ipc'

const mockStorage = vethos.storage as unknown as {
  read: ReturnType<typeof vi.fn>
  write: ReturnType<typeof vi.fn>
  exists: ReturnType<typeof vi.fn>
}
const TEST_USER_ID = 'user_123'

beforeEach(() => {
  mockStorage.read.mockReset()
  mockStorage.write.mockReset()
  mockStorage.exists.mockReset()
  // reset zustand state between tests
  useDeclaredAppsStore.setState({ userId: TEST_USER_ID, loaded: false, apps: [] })
})

describe('useDeclaredAppsStore', () => {
  it('load() depuis storage vide → tableau vide', async () => {
    mockStorage.read.mockResolvedValue(null)
    await useDeclaredAppsStore.getState().load()
    const s = useDeclaredAppsStore.getState()
    expect(s.loaded).toBe(true)
    expect(s.apps).toEqual([])
  })

  it('load() depuis storage existant → restitue les apps', async () => {
    mockStorage.read.mockResolvedValue({
      apps: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          name: 'VS Code',
          exeName: 'Code.exe',
          linkedObjectiveId: null,
          createdAt: '2026-05-01T00:00:00.000Z',
        },
      ],
    })
    await useDeclaredAppsStore.getState().load()
    expect(useDeclaredAppsStore.getState().apps).toHaveLength(1)
    expect(useDeclaredAppsStore.getState().apps[0]!.name).toBe('VS Code')
  })

  it('saveApp() crée une app avec UUID + persiste', async () => {
    mockStorage.write.mockResolvedValue({ ok: true })
    const created = await useDeclaredAppsStore.getState().saveApp({
      name: 'Notion',
      exeName: 'Notion.exe',
      linkedObjectiveId: null,
    })
    expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    expect(useDeclaredAppsStore.getState().apps).toHaveLength(1)
    expect(mockStorage.write).toHaveBeenCalledWith(
      'declared_apps',
      expect.objectContaining({ apps: expect.any(Array) }),
      TEST_USER_ID,
    )
  })

  it('saveApp() avec id existant → met à jour, préserve createdAt', async () => {
    const original = {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Old',
      exeName: 'old.exe',
      linkedObjectiveId: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    useDeclaredAppsStore.setState({ userId: TEST_USER_ID, loaded: true, apps: [original] })
    mockStorage.write.mockResolvedValue({ ok: true })

    const updated = await useDeclaredAppsStore.getState().saveApp({
      id: original.id,
      name: 'New',
      exeName: 'new.exe',
      linkedObjectiveId: null,
    })
    expect(updated.id).toBe(original.id)
    expect(updated.createdAt).toBe('2026-01-01T00:00:00.000Z')
    expect(updated.name).toBe('New')
    expect(updated.exeName).toBe('new.exe')
  })

  it('deleteApp() retire et persiste', async () => {
    const app = {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'X',
      exeName: 'x.exe',
      linkedObjectiveId: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    useDeclaredAppsStore.setState({ userId: TEST_USER_ID, loaded: true, apps: [app] })
    mockStorage.write.mockResolvedValue({ ok: true })

    await useDeclaredAppsStore.getState().deleteApp(app.id)
    expect(useDeclaredAppsStore.getState().apps).toHaveLength(0)
    expect(mockStorage.write).toHaveBeenCalled()
  })

  it('saveApp() rejette si update sur id inexistant', async () => {
    useDeclaredAppsStore.setState({ userId: TEST_USER_ID, loaded: true, apps: [] })
    await expect(
      useDeclaredAppsStore.getState().saveApp({
        id: '99999999-9999-9999-9999-999999999999',
        name: 'X',
        exeName: 'x.exe',
        linkedObjectiveId: null,
      }),
    ).rejects.toThrow()
  })
})
