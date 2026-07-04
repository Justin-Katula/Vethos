import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MANUAL_CLOSE_GRACE_MS, shouldCloseDetectedProcess, startProcessKiller } from './killer'
import { listProcesses } from './enumerator'

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}))

vi.mock('./enumerator', () => ({
  listProcesses: vi.fn(),
}))

describe('shouldCloseDetectedProcess', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allowlist ferme un processus visible non autorise', async () => {
    const visibleWindowCheck = vi.fn().mockResolvedValue(true)

    const decision = shouldCloseDetectedProcess({
      processName: 'Discord.exe',
      pid: 1234,
      mode: 'allowlist',
      blockAll: false,
      forbidden: new Set(),
      allowed: new Set(['code.exe']),
      visibleWindowCheck,
    })
    await vi.advanceTimersByTimeAsync(MANUAL_CLOSE_GRACE_MS)

    await expect(decision).resolves.toBe(true)
    expect(visibleWindowCheck).toHaveBeenCalledWith(1234)
  })

  it('allowlist laisse passer les apps autorisees et la safe-list systeme', async () => {
    const visibleWindowCheck = vi.fn().mockResolvedValue(true)

    await expect(
      shouldCloseDetectedProcess({
        processName: 'Code.exe',
        pid: 1234,
        mode: 'allowlist',
        blockAll: false,
        forbidden: new Set(),
        allowed: new Set(['code.exe']),
        visibleWindowCheck,
      }),
    ).resolves.toBe(false)

    await expect(
      shouldCloseDetectedProcess({
        processName: 'explorer.exe',
        pid: 4321,
        mode: 'allowlist',
        blockAll: false,
        forbidden: new Set(),
        allowed: new Set(),
        visibleWindowCheck,
      }),
    ).resolves.toBe(false)

    expect(visibleWindowCheck).not.toHaveBeenCalled()
  })

  it('allowlist ne ferme pas un processus sans fenetre visible', async () => {
    const visibleWindowCheck = vi.fn().mockResolvedValue(false)

    const decision = shouldCloseDetectedProcess({
      processName: 'helper.exe',
      pid: 1234,
      mode: 'allowlist',
      blockAll: false,
      forbidden: new Set(),
      allowed: new Set(['code.exe']),
      visibleWindowCheck,
    })
    await vi.advanceTimersByTimeAsync(MANUAL_CLOSE_GRACE_MS)

    await expect(decision).resolves.toBe(false)
  })

  it('relaie immédiatement une app explicitement bloquée vers la session utilisateur', async () => {
    const visibleWindowCheck = vi.fn().mockResolvedValue(false)

    await expect(
      shouldCloseDetectedProcess({
        processName: 'Discord.exe',
        pid: 1234,
        mode: 'blocklist',
        blockAll: false,
        forbidden: new Set(['discord.exe']),
        allowed: new Set(),
        visibleWindowCheck,
      }),
    ).resolves.toBe(true)
    expect(visibleWindowCheck).not.toHaveBeenCalled()
  })

  it('laisse les outils de capture Windows accessibles', async () => {
    const visibleWindowCheck = vi.fn().mockResolvedValue(true)

    await expect(
      shouldCloseDetectedProcess({
        processName: 'SnippingTool.exe',
        pid: 9876,
        mode: 'allowlist',
        blockAll: true,
        forbidden: new Set(),
        allowed: new Set(),
        visibleWindowCheck,
      }),
    ).resolves.toBe(false)

    expect(visibleWindowCheck).not.toHaveBeenCalled()
  })

  it('notifie une seule fois pendant toute la vie du processus puis se réarme après sa fermeture', async () => {
    const mockedListProcesses = vi.mocked(listProcesses)
    mockedListProcesses.mockResolvedValue([{ name: 'notepad.exe', pid: 4321 }])
    const onBlocked = vi.fn()
    const watcher = startProcessKiller(['notepad.exe'], 100, onBlocked)

    await vi.advanceTimersByTimeAsync(350)
    expect(onBlocked).toHaveBeenCalledTimes(1)

    mockedListProcesses.mockResolvedValue([])
    await vi.advanceTimersByTimeAsync(100)
    mockedListProcesses.mockResolvedValue([{ name: 'notepad.exe', pid: 4321 }])
    await vi.advanceTimersByTimeAsync(100)

    expect(onBlocked).toHaveBeenCalledTimes(2)
    watcher.stop()
  })
})
