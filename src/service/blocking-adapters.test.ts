import { describe, expect, it, vi } from 'vitest'
import { startProcessKiller } from './blocking/processes/killer'
import { createProcessControl } from './blocking-adapters'

vi.mock('./blocking/processes/killer', () => ({
  startProcessKiller: vi.fn(() => ({ stop: vi.fn() })),
}))

describe('process reminder control', () => {
  it('observes forbidden applications without closing them', () => {
    const onBlocked = vi.fn()
    const control = createProcessControl({
      elevated: true,
      edition: { productName: 'Windows 11 Pro', editionId: 'Professional', supportsAppLocker: true },
    })

    control.start(['Discord.exe'], onBlocked, { mode: 'blocklist' })

    expect(startProcessKiller).toHaveBeenCalledWith(
      ['Discord.exe'],
      100,
      onBlocked,
      { mode: 'blocklist', allowedExeNames: undefined },
    )
    expect(control.status()).toBe('ok')
  })

  it('surveille aussi une allowlist vide, qui signifie tout bloquer', () => {
    const control = createProcessControl({
      elevated: true,
      edition: { productName: 'Windows 11 Pro', editionId: 'Professional', supportsAppLocker: true },
    })

    control.start([], vi.fn(), { mode: 'allowlist', allowedExeNames: [] })

    expect(startProcessKiller).toHaveBeenCalledWith([], 100, expect.any(Function), {
      mode: 'allowlist',
      allowedExeNames: [],
    })
    expect(control.status()).toBe('ok')
  })
})
