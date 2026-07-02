import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createBlockingHost,
  createBlockingHandlers,
  type BlockingHostDeps,
  type BlockingHostEvent,
} from './blocking-host'
import { SLEEP_LOCKDOWN_PROCESS_MARKER } from '@shared/blocking'
import type { BlockingProfile, BlockingState } from '@shared/schemas'
import net from 'node:net'
import { createBridgeServer, type BridgeServer } from './bridge/server'
import { encodeMessage, createMessageDecoder, type ServiceMessage } from '@shared/service-protocol'

const PROFILE: BlockingProfile = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Focus',
  mode: 'blocklist',
  blockedSites: ['example.com'],
  blockedProcesses: ['notepad.exe'],
  blockedNetworkApps: [],
  unlockPolicy: { type: 'none' },
  createdAt: '2026-05-04T09:00:00.000Z',
}

const SLEEP_PROFILE: BlockingProfile = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Mode sommeil - verrouillage complet',
  mode: 'blocklist',
  blockedSites: ['youtube.com'],
  blockedProcesses: [SLEEP_LOCKDOWN_PROCESS_MARKER],
  blockedNetworkApps: [],
  unlockPolicy: { type: 'cooldown_and_justification', minutes: 60, minWords: 500 },
  createdAt: '2026-05-04T09:00:00.000Z',
}

function makeState(overrides?: Partial<BlockingState>): BlockingState {
  return { profiles: [PROFILE], history: [], nextSessionPenaltyMinutes: 0, ...overrides }
}

function makeDeps(overrides?: Partial<BlockingHostDeps>): BlockingHostDeps {
  return {
    persistence: {
      setUserId: vi.fn(),
      getUserId: vi.fn().mockReturnValue(undefined),
      readState: vi.fn().mockResolvedValue(makeState()),
      writeState: vi.fn().mockResolvedValue(undefined),
      readActive: vi.fn().mockResolvedValue(null),
      writeActive: vi.fn().mockResolvedValue(undefined),
      clearActive: vi.fn().mockResolvedValue(undefined),
    },
    hosts: {
      apply: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
      flushDns: vi.fn().mockResolvedValue(undefined),
    },
    firewall: {
      applyAll: vi.fn().mockResolvedValue([]),
      removeAll: vi.fn().mockResolvedValue(undefined),
      removeOrphansExcept: vi.fn().mockResolvedValue(undefined),
      applied: vi.fn().mockReturnValue([]),
    },
    processes: {
      start: vi.fn().mockReturnValue({ stop: vi.fn() }),
      status: vi.fn().mockReturnValue('inactive'),
      setStrictBlocking: vi.fn(),
    },
    layerProbe: {
      readHostsFile: vi.fn().mockResolvedValue(''),
      listFirewallRules: vi.fn().mockResolvedValue([]),
    },
    elevated: true,
    drift: { start: vi.fn(), stop: vi.fn(), on: vi.fn() },
    startClock: vi.fn().mockReturnValue({ stop: vi.fn() }),
    ...overrides,
  }
}

describe('createBlockingHost', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-05-13T12:00:00.000Z') })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("getState renvoie l'état persisté et la session active", async () => {
    const host = createBlockingHost(makeDeps())
    const result = await host.getState()
    expect(result.state.profiles).toEqual([PROFILE])
    expect(result.active).toBeNull()
  })

  it('saveProfile valide, complète et persiste un profil', async () => {
    const deps = makeDeps()
    const host = createBlockingHost(deps)
    const saved = await host.saveProfile({
      name: 'Travail',
      blockedSites: ['reddit.com'],
      blockedProcesses: ['notepad.exe'],
      blockedNetworkApps: [],
      unlockPolicy: { type: 'none' },
    })
    expect(saved.id).toMatch(/[0-9a-f-]{36}/)
    expect(saved.name).toBe('Travail')
    expect(deps.persistence.writeState).toHaveBeenCalled()
  })

  it('saveProfile refuse un processus système safe-listé', async () => {
    const host = createBlockingHost(makeDeps())
    await expect(
      host.saveProfile({
        name: 'X',
        blockedSites: [],
        blockedProcesses: ['svchost.exe'],
        blockedNetworkApps: [],
        unlockPolicy: { type: 'none' },
      }),
    ).rejects.toThrow(/svchost\.exe/)
  })

  it("deleteProfile retire le profil de l'état", async () => {
    const deps = makeDeps()
    const host = createBlockingHost(deps)
    await host.deleteProfile(PROFILE.id)
    expect(deps.persistence.writeState).toHaveBeenCalledWith(
      expect.objectContaining({ profiles: [] }),
    )
  })

  it('startSession applique les couches et mémorise le réglage strict', async () => {
    const deps = makeDeps()
    const host = createBlockingHost(deps)
    const session = await host.startSession({
      profileId: PROFILE.id,
      durationMinutes: 60,
      sessionRulesEnabled: false,
      strictBlocking: false,
    })
    expect(session.profileId).toBe(PROFILE.id)
    expect(deps.processes.setStrictBlocking).toHaveBeenCalledWith(false)
    expect(deps.hosts.apply).toHaveBeenCalled()
    expect(deps.firewall.applyAll).toHaveBeenCalled()
  })

  it('refuse une reprise annoncée active si la surveillance process ne tourne pas', async () => {
    const deps = makeDeps()
    const host = createBlockingHost(deps)
    const session = await host.startSession({
      profileId: PROFILE.id,
      durationMinutes: 60,
      sessionRulesEnabled: false,
      strictBlocking: true,
    })
    vi.mocked(deps.persistence.readActive).mockResolvedValue(session)
    vi.mocked(deps.processes.status).mockReturnValue('inactive')

    await expect(host.resync()).rejects.toThrow(/surveillance réelle/iu)
  })

  it('réapplique une session et confirme sa reprise quand la surveillance tourne', async () => {
    const deps = makeDeps()
    const host = createBlockingHost(deps)
    const session = await host.startSession({
      profileId: PROFILE.id,
      durationMinutes: 60,
      sessionRulesEnabled: false,
      strictBlocking: true,
    })
    vi.mocked(deps.persistence.readActive).mockResolvedValue(session)
    vi.mocked(deps.processes.status).mockReturnValue('ok')

    const recovered = await host.resync()

    expect(recovered.active?.id).toBe(session.id)
    expect(deps.processes.start).toHaveBeenCalledTimes(2)
  })

  it('rattache au bon utilisateur une session reprise avant le chargement de Clerk', async () => {
    const deps = makeDeps()
    const host = createBlockingHost(deps)
    const session = await host.startSession({
      userId: 'user_123',
      profileId: PROFILE.id,
      durationMinutes: 60,
      sessionRulesEnabled: false,
      strictBlocking: true,
    })
    vi.mocked(deps.persistence.readActive).mockResolvedValue(session)
    vi.mocked(deps.persistence.getUserId).mockReturnValue(undefined)

    await host.hydrate()

    expect(deps.persistence.setUserId).toHaveBeenCalledWith('user_123')
  })

  it('startSession avec resolvedProfile applique le profil résolu', async () => {
    const deps = makeDeps()
    const host = createBlockingHost(deps)
    const resolvedProfile: BlockingProfile = {
      id: PROFILE.id,
      name: 'Resolved Profile',
      mode: 'allowlist',
      blockedSites: ['resolved-site.com'],
      blockedProcesses: ['resolved-proc.exe'],
      blockedNetworkApps: ['C:\\resolved.exe'],
      unlockPolicy: { type: 'none' },
      createdAt: PROFILE.createdAt,
    }
    const session = await host.startSession({
      profileId: PROFILE.id,
      durationMinutes: 60,
      sessionRulesEnabled: false,
      strictBlocking: false,
      resolvedProfile,
    })
    expect(session.profileSnapshot.name).toBe('Resolved Profile')
    expect(session.profileSnapshot.mode).toBe('allowlist')
    expect(deps.hosts.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        domains: ['resolved-site.com'],
      }),
    )
    expect(deps.processes.start).toHaveBeenCalledWith(
      ['resolved-proc.exe'],
      expect.any(Function),
      { mode: 'allowlist', allowedExeNames: ['resolved-proc.exe'] },
    )
    expect(deps.firewall.applyAll).toHaveBeenCalledWith(expect.any(String), ['C:\\resolved.exe'])
  })

  it('startSession sommeil remplace une session active par le verrouillage complet', async () => {
    const deps = makeDeps()
    deps.persistence.readState = vi
      .fn()
      .mockResolvedValue(makeState({ profiles: [PROFILE, SLEEP_PROFILE] }))
    const host = createBlockingHost(deps)

    await host.startSession({
      profileId: PROFILE.id,
      durationMinutes: 60,
      sessionRulesEnabled: false,
      strictBlocking: true,
    })
    const sleepSession = await host.startSession({
      profileId: SLEEP_PROFILE.id,
      durationMinutes: 420,
      sessionRulesEnabled: false,
      strictBlocking: true,
    })

    expect(sleepSession.profileId).toBe(SLEEP_PROFILE.id)
    expect(deps.processes.start).toHaveBeenLastCalledWith(
      [SLEEP_LOCKDOWN_PROCESS_MARKER],
      expect.any(Function),
      { mode: 'blocklist', allowedExeNames: undefined },
    )
  })

  it('émet BLOCKED_ATTEMPT quand la couche process détecte une app bloquée', async () => {
    const deps = makeDeps()
    deps.processes.start = vi.fn((_forbidden, onBlocked) => {
      onBlocked?.({ processName: 'notepad.exe', pid: 1234, blockAll: false })
      return { stop: vi.fn() }
    })
    const host = createBlockingHost(deps)
    const events: BlockingHostEvent[] = []
    host.on((e) => events.push(e))

    await host.startSession({
      profileId: PROFILE.id,
      durationMinutes: 60,
      sessionRulesEnabled: false,
      strictBlocking: true,
    })

    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'BLOCKED_ATTEMPT',
        payload: expect.objectContaining({
          processName: 'notepad.exe',
          pid: 1234,
          mode: 'work',
        }),
      }),
    )
  })

  it("startSession échoue si le service n'est pas élevé", async () => {
    const host = createBlockingHost(makeDeps({ elevated: false }))
    await expect(
      host.startSession({
        profileId: PROFILE.id,
        durationMinutes: 60,
        sessionRulesEnabled: false,
        strictBlocking: true,
      }),
    ).rejects.toThrow(/administrateur/)
  })

  it('startSession échoue quand les règles de session sont violées', async () => {
    const deps = makeDeps()
    deps.persistence.readState = vi.fn().mockResolvedValue(
      makeState({
        history: [
          {
            sessionId: '22222222-2222-4222-8222-222222222222',
            profileId: PROFILE.id,
            startedAt: '2026-05-13T06:00:00.000Z',
            endedAt: '2026-05-13T11:45:00.000Z', // 5h45 sur le même projet
            completedNormally: true,
          },
        ],
      }),
    )
    const host = createBlockingHost(deps)
    await expect(
      host.startSession({
        profileId: PROFILE.id,
        durationMinutes: 60,
        sessionRulesEnabled: true,
        strictBlocking: true,
      }),
    ).rejects.toThrow(/projet/)
  })

  it('startSession applique la pénalité en attente puis la remet à zéro', async () => {
    const deps = makeDeps()
    deps.persistence.readState = vi
      .fn()
      .mockResolvedValue(makeState({ nextSessionPenaltyMinutes: 30 }))
    const host = createBlockingHost(deps)
    const session = await host.startSession({
      profileId: PROFILE.id,
      durationMinutes: 60,
      sessionRulesEnabled: false,
      strictBlocking: true,
    })
    expect(session.durationMinutes).toBe(90)
    expect(deps.persistence.writeState).toHaveBeenCalledWith(
      expect.objectContaining({ nextSessionPenaltyMinutes: 0 }),
    )
  })

  it('getLayerStatus renvoie inactive sans session active', async () => {
    const host = createBlockingHost(makeDeps())
    expect(await host.getLayerStatus()).toEqual({
      hosts: 'inactive',
      processes: 'inactive',
      firewall: 'inactive',
    })
  })

  it('getLayerStatus signale la dérive hosts et le statut process', async () => {
    const deps = makeDeps()
    deps.processes.status = vi.fn().mockReturnValue('ok')
    deps.layerProbe.readHostsFile = vi.fn().mockResolvedValue('') // bloc Vethos absent
    const host = createBlockingHost(deps)
    await host.startSession({
      profileId: PROFILE.id,
      durationMinutes: 60,
      sessionRulesEnabled: false,
      strictBlocking: true,
    })
    const status = await host.getLayerStatus()
    expect(status.hosts).toBe('drifted')
    expect(status.processes).toBe('ok')
    expect(status.firewall).toBe('ok')
  })

  it("relaie l'événement SESSION_CHANGED du manager", async () => {
    const host = createBlockingHost(makeDeps())
    const events: BlockingHostEvent[] = []
    host.on((e) => events.push(e))
    await host.startSession({
      profileId: PROFILE.id,
      durationMinutes: 60,
      sessionRulesEnabled: false,
      strictBlocking: true,
    })
    const changed = events.find((e) => e.type === 'SESSION_CHANGED')
    expect(changed?.payload).toMatchObject({ profileId: PROFILE.id })
  })

  it("relaie l'événement LAYER_DRIFT du détecteur de dérive", () => {
    let driftCb: ((e: { layer: 'hosts' | 'firewall'; restored: boolean }) => void) | undefined
    const deps = makeDeps({
      drift: {
        start: vi.fn(),
        stop: vi.fn(),
        on: (cb) => {
          driftCb = cb
        },
      },
    })
    const host = createBlockingHost(deps)
    const events: BlockingHostEvent[] = []
    host.on((e) => events.push(e))
    driftCb?.({ layer: 'hosts', restored: true })
    expect(events).toContainEqual({
      type: 'LAYER_DRIFT',
      payload: { layer: 'hosts', restored: true },
    })
  })

  it("relaie l'événement CLOCK_TAMPER du moniteur d'horloge", () => {
    let tamperCb:
      | ((e: { driftMs: number; wallDeltaMs: number; monoDeltaMs: number }) => void)
      | undefined
    const deps = makeDeps({
      startClock: (cb) => {
        tamperCb = cb
        return { stop: vi.fn() }
      },
    })
    const host = createBlockingHost(deps)
    const events: BlockingHostEvent[] = []
    host.on((e) => events.push(e))
    tamperCb?.({ driftMs: 9000, wallDeltaMs: 19000, monoDeltaMs: 10000 })
    expect(events).toContainEqual({ type: 'CLOCK_TAMPER', payload: { driftMs: 9000 } })
  })

  it("émet BREAK_REQUIRED quand l'intervalle détecte une violation", async () => {
    const state = makeState()
    const deps = makeDeps()
    deps.persistence.readState = vi.fn().mockImplementation(async () => state)
    const host = createBlockingHost(deps)
    const events: BlockingHostEvent[] = []
    host.on((e) => events.push(e))

    await host.startSession({
      profileId: PROFILE.id,
      durationMinutes: 60,
      sessionRulesEnabled: true,
      strictBlocking: true,
    })

    // Session lancée avec un historique vide (règles OK au démarrage). On injecte
    // ensuite une violation des 4h ; le prochain tick (60s) doit l'émettre.
    state.history = [
      {
        sessionId: '22222222-2222-4222-8222-222222222222',
        profileId: PROFILE.id,
        startedAt: '2026-05-13T06:00:00.000Z',
        endedAt: '2026-05-13T11:45:00.000Z',
        completedNormally: true,
      },
    ]
    await vi.advanceTimersByTimeAsync(60_000)

    expect(events.some((e) => e.type === 'BREAK_REQUIRED')).toBe(true)
    host.stop()
  })

  it("stop() arrête l'intervalle de règles, la dérive et l'horloge", async () => {
    const driftFake = { start: vi.fn(), stop: vi.fn(), on: vi.fn() }
    const clockHandle = { stop: vi.fn() }
    const deps = makeDeps({ drift: driftFake, startClock: vi.fn().mockReturnValue(clockHandle) })
    const host = createBlockingHost(deps)
    host.stop()
    expect(driftFake.stop).toHaveBeenCalled()
    expect(clockHandle.stop).toHaveBeenCalled()
    const callsBefore = vi.mocked(deps.persistence.readState).mock.calls.length
    await vi.advanceTimersByTimeAsync(120_000)
    expect(vi.mocked(deps.persistence.readState).mock.calls.length).toBe(callsBefore)
  })

  it("relaie l'événement SESSION_ENDED quand une session se termine", async () => {
    const host = createBlockingHost(makeDeps())
    const events: BlockingHostEvent[] = []
    host.on((e) => events.push(e))
    await host.startSession({
      profileId: PROFILE.id,
      durationMinutes: 60,
      sessionRulesEnabled: false,
      strictBlocking: true,
    })
    await host.requestUnlock() // profil unlockPolicy 'none' → termine la session
    const ended = events.find((e) => e.type === 'SESSION_ENDED')
    expect(ended).toBeDefined()
    expect(ended?.payload).toMatchObject({
      entry: { profileId: PROFILE.id },
      session: { profileId: PROFILE.id },
    })
  })

  it("nettoie les règles firewall quand l'utilisateur se déconnecte", async () => {
    const deps = makeDeps()
    const host = createBlockingHost(deps)

    await host.startSession({
      profileId: PROFILE.id,
      durationMinutes: 60,
      sessionRulesEnabled: false,
      strictBlocking: true,
    })
    await host.disconnectUser()

    expect(deps.firewall.removeAll).toHaveBeenCalled()
    expect(deps.persistence.clearActive).toHaveBeenCalled()
    expect(deps.persistence.setUserId).toHaveBeenLastCalledWith(undefined)
    expect((await host.getState()).active).toBeNull()
  })

  it('hydrate délègue à hydrateFromDisk et nettoie les orphelins', async () => {
    const deps = makeDeps()
    const host = createBlockingHost(deps)
    await host.hydrate()
    expect(deps.firewall.removeAll).toHaveBeenCalled()
    expect(deps.hosts.clear).toHaveBeenCalled()
  })

  it('hydrate avale les erreurs de hydrateFromDisk', async () => {
    const deps = makeDeps()
    deps.persistence.readActive = vi.fn().mockRejectedValue(new Error('disk fail'))
    const host = createBlockingHost(deps)
    await expect(host.hydrate()).resolves.toBeUndefined()
  })

  it('getLayerStatus renvoie error quand les sondes OS échouent', async () => {
    const deps = makeDeps()
    deps.layerProbe.readHostsFile = vi.fn().mockRejectedValue(new Error('hosts verrouillé'))
    deps.layerProbe.listFirewallRules = vi.fn().mockRejectedValue(new Error('netsh KO'))
    const host = createBlockingHost(deps)
    await host.startSession({
      profileId: PROFILE.id,
      durationMinutes: 60,
      sessionRulesEnabled: false,
      strictBlocking: true,
    })
    const status = await host.getLayerStatus()
    expect(status.hosts).toBe('error')
    expect(status.firewall).toBe('error')
  })
})

describe('createBlockingHandlers (pont nommé)', () => {
  let server: BridgeServer | null = null

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-05-13T12:00:00.000Z') })
  })
  afterEach(async () => {
    await server?.close()
    server = null
    vi.useRealTimers()
  })

  const testPipe = (): string =>
    `\\\\.\\pipe\\vethos-test-${process.pid}-${Math.random().toString(36).slice(2)}`

  function collect(socket: net.Socket): { next: () => Promise<ServiceMessage> } {
    const decode = createMessageDecoder()
    const queue: ServiceMessage[] = []
    const waiters: Array<(m: ServiceMessage) => void> = []
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => {
      for (const m of decode(chunk)) {
        const w = waiters.shift()
        if (w) w(m)
        else queue.push(m)
      }
    })
    return {
      next: () =>
        new Promise<ServiceMessage>((resolve) => {
          const m = queue.shift()
          if (m) resolve(m)
          else waiters.push(resolve)
        }),
    }
  }

  it("GET_STATE renvoie l'état du host", async () => {
    const host = createBlockingHost(makeDeps())
    const pipe = testPipe()
    server = await createBridgeServer({ pipePath: pipe, handlers: createBlockingHandlers(host) })
    const client = net.createConnection(pipe)
    const inbox = collect(client)
    client.write(encodeMessage({ kind: 'request', id: 'g1', type: 'GET_STATE' }))
    const res = await inbox.next()
    expect(res).toMatchObject({ kind: 'response', id: 'g1', ok: true })
    client.destroy()
    host.stop()
  })

  it('SAVE_PROFILE persiste le profil envoyé par le pont', async () => {
    const host = createBlockingHost(makeDeps())
    const pipe = testPipe()
    server = await createBridgeServer({ pipePath: pipe, handlers: createBlockingHandlers(host) })
    const client = net.createConnection(pipe)
    const inbox = collect(client)
    client.write(
      encodeMessage({
        kind: 'request',
        id: 's1',
        type: 'SAVE_PROFILE',
        payload: {
          name: 'Pont',
          blockedSites: [],
          blockedProcesses: [],
          blockedNetworkApps: [],
          unlockPolicy: { type: 'none' },
        },
      }),
    )
    const res = await inbox.next()
    expect(res).toMatchObject({ kind: 'response', id: 's1', ok: true })
    client.destroy()
    host.stop()
  })

  it('diffuse SESSION_CHANGED après un START_SESSION sur le pont', async () => {
    const host = createBlockingHost(makeDeps())
    const pipe = testPipe()
    server = await createBridgeServer({ pipePath: pipe, handlers: createBlockingHandlers(host) })
    host.on((e) => server?.broadcast({ type: e.type, payload: e.payload }))
    const client = net.createConnection(pipe)
    const inbox = collect(client)
    client.write(
      encodeMessage({
        kind: 'request',
        id: 'st1',
        type: 'START_SESSION',
        payload: {
          profileId: PROFILE.id,
          durationMinutes: 60,
          sessionRulesEnabled: false,
          strictBlocking: true,
        },
      }),
    )
    // Deux trames attendues : la réponse START_SESSION et l'événement
    // SESSION_CHANGED diffusé (l'ordre d'arrivée n'est pas garanti).
    const messages = [await inbox.next(), await inbox.next()]
    expect(messages).toContainEqual(
      expect.objectContaining({ kind: 'event', type: 'SESSION_CHANGED' }),
    )
    client.destroy()
    host.stop()
  })

  it('SET_USER_CONTEXT sans userId déconnecte et nettoie le firewall', async () => {
    const deps = makeDeps()
    const host = createBlockingHost(deps)
    const handlers = createBlockingHandlers(host)
    const setUserContext = handlers.SET_USER_CONTEXT
    if (!setUserContext) throw new Error('SET_USER_CONTEXT handler missing')

    await host.startSession({
      profileId: PROFILE.id,
      durationMinutes: 60,
      sessionRulesEnabled: false,
      strictBlocking: true,
    })
    await setUserContext({
      kind: 'request',
      id: 'ctx1',
      type: 'SET_USER_CONTEXT',
      payload: {},
    })

    expect(deps.firewall.removeAll).toHaveBeenCalled()
    expect(deps.persistence.clearActive).toHaveBeenCalled()
    host.stop()
  })
})
