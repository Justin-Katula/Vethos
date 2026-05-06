import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/ipc', () => ({
  nexus: {
    appUsage: {
      get: vi.fn(),
      onTick: vi.fn(),
    },
  },
}))

import {
  useAppUsageStore,
  selectMinutesToday,
  selectMinutesThisWeek,
  selectMinutesByDay,
} from './app-usage.store'
import { nexus } from '@/lib/ipc'

const mockApi = nexus.appUsage as unknown as {
  get: ReturnType<typeof vi.fn>
  onTick: ReturnType<typeof vi.fn>
}

function todayLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

beforeEach(() => {
  mockApi.get.mockReset()
  mockApi.onTick.mockReset()
  useAppUsageStore.setState({ loaded: false, entries: [], lastTickAt: null })
})

describe('useAppUsageStore', () => {
  it('load() hydrate depuis l\'API', async () => {
    mockApi.get.mockResolvedValue({
      entries: [
        { appId: 'app-1', date: '2026-05-05', minutes: 12 },
      ],
      lastTickAt: '2026-05-05T10:00:00.000Z',
    })
    await useAppUsageStore.getState().load()
    const s = useAppUsageStore.getState()
    expect(s.loaded).toBe(true)
    expect(s.entries).toHaveLength(1)
    expect(s.lastTickAt).toBe('2026-05-05T10:00:00.000Z')
  })

  it('subscribe() écoute les ticks et met à jour le state', () => {
    let registered: ((state: unknown) => void) | null = null
    mockApi.onTick.mockImplementation((cb: (state: unknown) => void) => {
      registered = cb
      return () => {}
    })
    const unsub = useAppUsageStore.getState().subscribe()
    expect(registered).not.toBeNull()
    registered!({
      entries: [{ appId: 'a', date: '2026-05-05', minutes: 1 }],
      lastTickAt: '2026-05-05T10:01:00.000Z',
    })
    expect(useAppUsageStore.getState().entries).toHaveLength(1)
    expect(useAppUsageStore.getState().lastTickAt).toBe('2026-05-05T10:01:00.000Z')
    unsub()
  })

  it('selectMinutesToday somme les minutes du jour pour une app', () => {
    const today = todayLocal()
    useAppUsageStore.setState({
      loaded: true,
      entries: [
        { appId: 'a', date: today, minutes: 10 },
        { appId: 'a', date: '2025-01-01', minutes: 99 },
        { appId: 'b', date: today, minutes: 5 },
      ],
      lastTickAt: null,
    })
    expect(selectMinutesToday(useAppUsageStore.getState(), 'a')).toBe(10)
    expect(selectMinutesToday(useAppUsageStore.getState(), 'b')).toBe(5)
    expect(selectMinutesToday(useAppUsageStore.getState(), 'unknown')).toBe(0)
  })

  it('selectMinutesByDay retourne une map par date pour une app', () => {
    useAppUsageStore.setState({
      loaded: true,
      entries: [
        { appId: 'a', date: '2026-05-04', minutes: 5 },
        { appId: 'a', date: '2026-05-05', minutes: 12 },
        { appId: 'b', date: '2026-05-05', minutes: 99 },
      ],
      lastTickAt: null,
    })
    const m = selectMinutesByDay(useAppUsageStore.getState(), 'a')
    expect(m.size).toBe(2)
    expect(m.get('2026-05-04')).toBe(5)
    expect(m.get('2026-05-05')).toBe(12)
  })

  it('selectMinutesThisWeek inclut uniquement les 7 derniers jours', () => {
    const today = new Date()
    const todayStr = todayLocal()
    const sixDaysAgo = new Date(today)
    sixDaysAgo.setDate(today.getDate() - 6)
    const sixDaysAgoStr = sixDaysAgo.toISOString().slice(0, 10)
    const eightDaysAgo = new Date(today)
    eightDaysAgo.setDate(today.getDate() - 8)
    const eightDaysAgoStr = eightDaysAgo.toISOString().slice(0, 10)

    useAppUsageStore.setState({
      loaded: true,
      entries: [
        { appId: 'a', date: todayStr, minutes: 10 },
        { appId: 'a', date: sixDaysAgoStr, minutes: 5 },
        { appId: 'a', date: eightDaysAgoStr, minutes: 999 },
      ],
      lastTickAt: null,
    })
    expect(selectMinutesThisWeek(useAppUsageStore.getState(), 'a')).toBe(15)
  })
})
