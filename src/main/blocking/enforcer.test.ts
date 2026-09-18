import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionSnapshot } from './clock'

const mocks = vi.hoisted(() => ({
  closeAppBlockOverlay: vi.fn(),
  closeSiteBlockOverlayWindow: vi.fn(),
  closeSiteBlockOverlayWindowsExcept: vi.fn(),
  createSiteTracker: vi.fn(),
  listProcesses: vi.fn(),
  restoreBlockedAppResources: vi.fn(),
  showBlockOverlayWindow: vi.fn(),
  networkBlockProcess: vi.fn(),
  networkUnblockProcess: vi.fn(),
  networkStop: vi.fn(),
}))

vi.mock('@main/logging/setup', () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

vi.mock('@main/tracking/enumerator', () => ({
  listProcesses: mocks.listProcesses,
}))

vi.mock('@main/tracking/strict-block-window', () => ({
  closeAppBlockOverlay: mocks.closeAppBlockOverlay,
  closeSiteBlockOverlayWindow: mocks.closeSiteBlockOverlayWindow,
  closeSiteBlockOverlayWindowsExcept: mocks.closeSiteBlockOverlayWindowsExcept,
  restoreBlockedAppResources: mocks.restoreBlockedAppResources,
  showBlockOverlayWindow: mocks.showBlockOverlayWindow,
}))

vi.mock('@main/tracking/site-tracker', () => ({
  createSiteTracker: mocks.createSiteTracker,
}))

import { createEnforcer } from './enforcer'

const inactiveSnapshot: SessionSnapshot = {
  active: false,
  blockedAppIds: [],
  blockedSites: [],
  endsAt: null,
}

function activeSnapshot(blockedAppIds: string[]): SessionSnapshot {
  return {
    active: true,
    blockedAppIds,
    blockedSites: [],
    endsAt: Date.now() + 60_000,
  }
}

describe('createEnforcer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createSiteTracker.mockReturnValue({
      on: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    })
    mocks.listProcesses.mockResolvedValue([{ name: 'discord.exe', pid: 42 }])
    mocks.closeAppBlockOverlay.mockResolvedValue(true)
    mocks.networkBlockProcess.mockResolvedValue({ id: 'lease-1', executablePath: 'C:\\Discord.exe' })
    mocks.networkUnblockProcess.mockResolvedValue(undefined)
    mocks.networkStop.mockResolvedValue(undefined)
  })

  function makeEnforcer() {
    return createEnforcer({
      network: {
        blockProcess: mocks.networkBlockProcess,
        unblockProcess: mocks.networkUnblockProcess,
        stop: mocks.networkStop,
      },
    })
  }

  it("ferme le groupe d'overlay quand une session se termine", async () => {
    mocks.closeAppBlockOverlay.mockResolvedValue(true)

    const enforcer = makeEnforcer()
    await enforcer.apply(activeSnapshot(['discord.exe']))
    await enforcer.apply(inactiveSnapshot)

    expect(mocks.closeAppBlockOverlay).toHaveBeenCalledTimes(1)
    expect(mocks.closeAppBlockOverlay.mock.calls[0]?.[0]).toMatch(/^42-/)
    expect(mocks.restoreBlockedAppResources).not.toHaveBeenCalled()
    expect(mocks.showBlockOverlayWindow).toHaveBeenCalledTimes(1)
    expect(mocks.networkBlockProcess).toHaveBeenCalledWith(42, 'discord.exe')
    expect(mocks.networkUnblockProcess).toHaveBeenCalledWith({
      id: 'lease-1',
      executablePath: 'C:\\Discord.exe',
    })
  })


  it('sérialise deux applications concurrentes de la même session', async () => {
    // L'horloge appelle `apply` sans l'attendre. Deux transitions rapprochées
    // voyaient toutes deux `actif === false` et prenaient chacune l'instantané des
    // processus déjà lancés — la seconde écrasant la première. Or cet instantané
    // décide si le bouton Fermer avertit d'un travail non sauvegardé.
    const enforcer = makeEnforcer()

    // Énumération lente : la fenêtre de course est grande ouverte.
    let libere: () => void = () => {}
    const enVol = new Promise<void>((r) => {
      libere = r
    })
    let premiere = true
    mocks.listProcesses.mockImplementation(async () => {
      if (premiere) {
        premiere = false
        await enVol
      }
      return [{ name: 'discord.exe', pid: 42 }]
    })

    const a = enforcer.apply(activeSnapshot(['discord.exe']))
    const b = enforcer.apply(activeSnapshot(['discord.exe']))
    libere()
    await Promise.all([a, b])

    // L'instantané de démarrage ne doit être pris qu'UNE fois : le second passage
    // voit la session déjà active. Sans sérialisation, les deux le prennent, et le
    // second écrase le premier.
    expect(mocks.showBlockOverlayWindow).toHaveBeenCalledTimes(1)
    expect(mocks.networkBlockProcess).toHaveBeenCalledTimes(1)
    expect(enforcer.blockedPids()).toEqual([42])
    expect(
      mocks.listProcesses.mock.calls.length,
      'instantané de démarrage pris plusieurs fois',
    ).toBeLessThanOrEqual(3)
  })

  it("attend la restauration puis ferme l'assistant pare-feu à l'arrêt de Vethos", async () => {
    const enforcer = makeEnforcer()
    await enforcer.apply(activeSnapshot(['discord.exe']))
    await enforcer.shutdown()

    expect(mocks.networkUnblockProcess).toHaveBeenCalledTimes(1)
    expect(mocks.networkStop).toHaveBeenCalledTimes(1)
  })

  it("ferme le groupe d'overlay quand une application sort de la session active", async () => {
    mocks.closeAppBlockOverlay.mockResolvedValue(true)

    const enforcer = makeEnforcer()
    await enforcer.apply(activeSnapshot(['discord.exe']))
    await enforcer.apply(activeSnapshot(['steam.exe']))

    expect(mocks.closeAppBlockOverlay).toHaveBeenCalledTimes(1)
    expect(mocks.closeAppBlockOverlay.mock.calls[0]?.[0]).toMatch(/^42-/)
  })

  it("restaure directement les ressources si aucun groupe d'overlay n'existe", async () => {
    mocks.closeAppBlockOverlay.mockResolvedValue(false)

    const enforcer = makeEnforcer()
    await enforcer.apply(activeSnapshot(['discord.exe']))
    await enforcer.apply(inactiveSnapshot)

    const token = mocks.closeAppBlockOverlay.mock.calls[0]?.[0]
    expect(mocks.restoreBlockedAppResources).toHaveBeenCalledWith(token, 42, 'discord.exe')
  })

  it("restaure directement les ressources si la fermeture du groupe d'overlay échoue", async () => {
    mocks.closeAppBlockOverlay.mockImplementation(async () => {
      throw new Error('overlay close failed')
    })

    const enforcer = makeEnforcer()
    await enforcer.apply(activeSnapshot(['discord.exe']))
    await enforcer.apply(inactiveSnapshot)

    const token = mocks.closeAppBlockOverlay.mock.calls[0]?.[0]
    expect(mocks.restoreBlockedAppResources).toHaveBeenCalledWith(token, 42, 'discord.exe')
    expect(enforcer.blockedPids()).toEqual([])
  })

  describe('Invariante SystemGuard à la frontière finale de enforcement', () => {
    it('refuse catégoriquement de bloquer PowerShell même si une ancienne donnée le contient', async () => {
      mocks.listProcesses.mockResolvedValue([
        { name: 'powershell.exe', pid: 101 },
      ])

      const enforcer = makeEnforcer()
      // Snapshot issu d'une ancienne donnée contenant volontairement PowerShell
      await enforcer.apply(activeSnapshot(['powershell.exe', 'powershell']))

      // 0 overlay
      expect(mocks.showBlockOverlayWindow).toHaveBeenCalledTimes(0)
      // 0 masquage / surveillance
      // 0 contrôle audio / restauration
      expect(mocks.restoreBlockedAppResources).toHaveBeenCalledTimes(0)
      // 0 target envoyée au mécanisme natif
      expect(enforcer.blockedPids()).toEqual([])
    })

    it('refuse catégoriquement de bloquer Task Manager même si issu d\'une ancienne configuration persistée', async () => {
      mocks.listProcesses.mockResolvedValue([
        { name: 'taskmgr.exe', pid: 202 },
      ])

      const enforcer = makeEnforcer()
      // Snapshot issu d'une ancienne configuration persistée dans blocking_rules
      await enforcer.apply(activeSnapshot(['taskmgr.exe', 'Task Manager', 'gestionnaire des tâches']))

      // 0 overlay
      expect(mocks.showBlockOverlayWindow).toHaveBeenCalledTimes(0)
      // 0 masquage / surveillance
      // 0 contrôle audio / restauration
      expect(mocks.restoreBlockedAppResources).toHaveBeenCalledTimes(0)
      // 0 target envoyée au mécanisme natif
      expect(enforcer.blockedPids()).toEqual([])
    })
  })
})
