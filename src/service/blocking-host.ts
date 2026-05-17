import { randomUUID } from 'node:crypto'
import { BlockingProfileSchema } from '@shared/schemas'
import type {
  ActiveSession,
  BlockingHistoryEntry,
  BlockingProfile,
  BlockingState,
} from '@shared/schemas'
import {
  createSessionManager,
  type FirewallAdapter,
  type HostsAdapter,
  type ProcessAdapter,
} from './blocking/session/manager'
import {
  createDriftDetector,
  type DriftDetector,
  type DriftEvent,
} from './blocking/session/drift-detector'
import {
  startClockMonitor,
  type ClockMonitorHandle,
  type ClockTamperEvent,
} from './blocking/session/clock-monitor'
import { evaluateSessionRules } from './blocking/session/rules'
import { isSafeListed } from './blocking/processes/safe-list'
import { parseHostsFile } from './blocking/hosts/parser'
import { INACTIVE_LAYERS, type LayerStatus, type LayerStatusValue } from './blocking/session/types'
import type { BlockingPersistence } from './blocking/session/persistence'
import type { ServiceRequest } from '@shared/service-protocol'
import type { RequestHandler } from './bridge/server'
import log from './blocking/engine-log'

// ── Types injectables ───────────────────────────────────────────────────────

/**
 * Couche process : l'adapter `start` que consomme le manager, plus le statut
 * courant (pour GET_LAYER_STATUS) et le réglage strict (poussé à chaque session).
 */
export type ProcessControl = ProcessAdapter & {
  status: () => LayerStatusValue
  setStrictBlocking: (strict: boolean) => void
}

/** Sondes OS lues par GET_LAYER_STATUS — injectées pour rendre le host testable. */
export type LayerProbe = {
  readHostsFile: () => Promise<string>
  listFirewallRules: () => Promise<string[]>
}

export type BlockingHostDeps = {
  persistence: BlockingPersistence
  hosts: HostsAdapter
  firewall: FirewallAdapter
  processes: ProcessControl
  layerProbe: LayerProbe
  /** Le service tourne en SYSTEM → élevé. Injectable pour tester le refus. */
  elevated: boolean
  /** Injectables pour les tests ; valeurs réelles par défaut si omis. */
  drift?: DriftDetector
  startClock?: (onTamper: (e: ClockTamperEvent) => void) => ClockMonitorHandle
}

// ── Protocole exposé ────────────────────────────────────────────────────────

export type StartSessionArgs = {
  profileId: string
  durationMinutes: number
  sessionRulesEnabled: boolean
  strictBlocking: boolean
}

export type BlockingHostEvent =
  | { type: 'SESSION_CHANGED'; payload: ActiveSession | null }
  | { type: 'SESSION_ENDED'; payload: { entry: BlockingHistoryEntry; session: ActiveSession } }
  | { type: 'LAYER_DRIFT'; payload: DriftEvent }
  | { type: 'CLOCK_TAMPER'; payload: { driftMs: number } }
  | { type: 'BREAK_REQUIRED'; payload: { reason: string; restMinutes: number } }

export type BlockingHost = {
  getState: () => Promise<{ state: BlockingState; active: ActiveSession | null }>
  saveProfile: (draft: unknown) => Promise<BlockingProfile>
  deleteProfile: (id: string) => Promise<void>
  startSession: (args: StartSessionArgs) => Promise<ActiveSession>
  requestUnlock: () => Promise<ActiveSession['unlockState']>
  submitJustification: (text: string) => Promise<{ ok: true } | { ok: false; reason: string }>
  getLayerStatus: () => Promise<LayerStatus>
  /** Ré-applique une session active trouvée sur disque, ou nettoie les orphelins. */
  hydrate: () => Promise<void>
  /** Abonne un écouteur. Pas de désabonnement : le service enregistre un seul
   *  écouteur au démarrage (cf. index.ts). */
  on: (cb: (e: BlockingHostEvent) => void) => void
  /** Arrête les timers de fond (intervalle de règles, drift, clock monitor). */
  stop: () => void
}

const SESSION_RULES_CHECK_INTERVAL_MS = 60_000

/**
 * Orchestrateur de blocage du service — équivalent service de
 * `registerBlockingHandlers`, sans aucun couplage UI : il émet des événements
 * (au lieu de `webContents.send`), ne déclenche pas de notifications, et reçoit
 * `strictBlocking` / `sessionRulesEnabled` par session (au lieu de les lire dans
 * `settings`, fichier possédé par l'UI). Cf. plan Lot 3 pour les omissions.
 */
export function createBlockingHost(deps: BlockingHostDeps): BlockingHost {
  const { persistence, hosts, firewall, processes, layerProbe, elevated } = deps
  const listeners: Array<(e: BlockingHostEvent) => void> = []
  function emit(event: BlockingHostEvent): void {
    for (const l of listeners) l(event)
  }

  // Réglage de la session courante, reçu dans le payload de START_SESSION. La
  // valeur initiale n'a pas d'effet : checkSessionRules sort tôt tant qu'aucune
  // session n'est active.
  let sessionRulesEnabled = true
  // Empêche d'émettre BREAK_REQUIRED en boucle pour la même session.
  let liveRuleNotifiedFor: string | null = null

  const manager = createSessionManager({ hosts, processes, firewall, persistence })

  manager.on('sessionChanged', (s) => {
    if (!s) liveRuleNotifiedFor = null
    emit({ type: 'SESSION_CHANGED', payload: s })
  })
  manager.on('sessionEnded', (entry, session) => {
    emit({ type: 'SESSION_ENDED', payload: { entry, session } })
  })

  const drift = deps.drift ?? createDriftDetector()
  drift.on((e) => emit({ type: 'LAYER_DRIFT', payload: e }))
  drift.start(
    () => manager.getActive(),
    async (s) => {
      const names = await firewall.applyAll(s.id, s.profileSnapshot.blockedNetworkApps)
      await firewall.removeOrphansExcept(names).catch(() => undefined)
      s.appliedFirewallRules = names
      await persistence.writeActive(s)
    },
  )

  const startClock = deps.startClock ?? startClockMonitor
  const clock = startClock((event) => {
    emit({ type: 'CLOCK_TAMPER', payload: { driftMs: event.driftMs } })
  })

  async function checkSessionRules(): Promise<void> {
    const active = manager.getActive()
    if (!active || liveRuleNotifiedFor === active.id) return
    if (!sessionRulesEnabled) return
    const state = await persistence.readState()
    const elapsedMinutes = Math.max(
      0,
      Math.ceil((Date.now() - new Date(active.startedAt).getTime()) / 60_000),
    )
    const decision = evaluateSessionRules({
      history: state.history,
      profileId: active.profileId,
      requestedMinutes: elapsedMinutes,
    })
    if (decision.ok) return
    liveRuleNotifiedFor = active.id
    emit({
      type: 'BREAK_REQUIRED',
      payload: { reason: decision.reason, restMinutes: decision.restMinutes },
    })
  }

  const ruleCheckTimer = setInterval(() => {
    void checkSessionRules()
  }, SESSION_RULES_CHECK_INTERVAL_MS)

  return {
    async getState() {
      const state = await persistence.readState()
      return { state, active: manager.getActive() }
    },

    async saveProfile(draft) {
      const merged = {
        ...(draft as object),
        id: (draft as { id?: string }).id ?? randomUUID(),
        createdAt: (draft as { createdAt?: string }).createdAt ?? new Date().toISOString(),
      }
      const profile = BlockingProfileSchema.parse(merged)
      for (const exeName of profile.blockedProcesses) {
        if (isSafeListed(exeName)) {
          throw new Error(`System process refused: ${exeName}`)
        }
      }
      const state = await persistence.readState()
      const idx = state.profiles.findIndex((p) => p.id === profile.id)
      if (idx >= 0) state.profiles[idx] = profile
      else state.profiles.push(profile)
      await persistence.writeState(state)
      return profile
    },

    async deleteProfile(id) {
      const state = await persistence.readState()
      state.profiles = state.profiles.filter((p) => p.id !== id)
      await persistence.writeState(state)
    },

    async startSession(args) {
      // Garde d'élévation en premier : aucune mutation d'état avant de savoir
      // si la session peut démarrer.
      if (!elevated) {
        throw new Error('Blocage non opérationnel — droits administrateur requis')
      }
      processes.setStrictBlocking(args.strictBlocking)
      sessionRulesEnabled = args.sessionRulesEnabled
      const state = await persistence.readState()
      const penaltyMinutes = state.nextSessionPenaltyMinutes ?? 0
      const durationMinutes = Math.min(24 * 60, args.durationMinutes + penaltyMinutes)
      if (args.sessionRulesEnabled) {
        // Pas de freeMinutesByDate : le service re-valide avec son propre
        // historique (spec §4.3) — il ne voit pas les données d'app-usage de l'UI.
        const decision = evaluateSessionRules({
          history: state.history,
          profileId: args.profileId,
          requestedMinutes: durationMinutes,
        })
        if (!decision.ok) throw new Error(decision.reason)
      }
      const session = await manager.startSession({
        profileId: args.profileId,
        durationMinutes,
      })
      if (penaltyMinutes > 0) {
        const latestState = await persistence.readState()
        await persistence.writeState({ ...latestState, nextSessionPenaltyMinutes: 0 })
      }
      return session
    },

    requestUnlock: () => manager.requestUnlock(),

    submitJustification: (text) => manager.submitJustification(text),

    async getLayerStatus() {
      const active = manager.getActive()
      if (!active) return { ...INACTIVE_LAYERS }
      let hostsStatus: LayerStatusValue = 'ok'
      let firewallStatus: LayerStatusValue = 'ok'
      try {
        const raw = await layerProbe.readHostsFile()
        const parsed = parseHostsFile(raw)
        // 8 entrées attendues par site : 4 préfixes de sous-domaine × 2 familles d'IP.
        const expectedEntryCount = active.profileSnapshot.blockedSites.length * 8
        if (
          expectedEntryCount > 0 &&
          (!parsed.nexusBlock || parsed.nexusBlock.entries.length !== expectedEntryCount)
        ) {
          hostsStatus = 'drifted'
        }
      } catch {
        hostsStatus = 'error'
      }
      try {
        const existing = new Set(await layerProbe.listFirewallRules())
        if (active.appliedFirewallRules.some((name) => !existing.has(name))) {
          firewallStatus = 'drifted'
        }
      } catch {
        firewallStatus = 'error'
      }
      return { hosts: hostsStatus, processes: processes.status(), firewall: firewallStatus }
    },

    async hydrate() {
      await manager.hydrateFromDisk().catch((err) => {
        log.error('[blocking-host] hydrate failed', err)
      })
    },

    on(cb) {
      listeners.push(cb)
    },

    stop() {
      clearInterval(ruleCheckTimer)
      drift.stop()
      clock.stop()
    },
  }
}

/**
 * Table de handlers du pont pour les commandes de blocage. À fusionner avec les
 * handlers système (`PING`, `GET_SERVICE_INFO`) dans `index.ts`. Chaque handler
 * dépaquète `req.payload` et délègue au host ; les erreurs remontent telles
 * quelles (le bridge les transforme en réponse `ok: false`).
 */
export function createBlockingHandlers(host: BlockingHost): Record<string, RequestHandler> {
  return {
    GET_STATE: () => host.getState(),
    SAVE_PROFILE: (req: ServiceRequest) => host.saveProfile(req.payload),
    DELETE_PROFILE: (req: ServiceRequest) =>
      host.deleteProfile((req.payload as { id: string }).id),
    START_SESSION: (req: ServiceRequest) => host.startSession(req.payload as StartSessionArgs),
    REQUEST_UNLOCK: () => host.requestUnlock(),
    SUBMIT_JUSTIFICATION: (req: ServiceRequest) =>
      host.submitJustification((req.payload as { text: string }).text),
    GET_LAYER_STATUS: () => host.getLayerStatus(),
  }
}
