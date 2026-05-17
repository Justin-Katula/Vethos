import { promises as fsp } from 'node:fs'
import { createFirewallTracker } from './blocking/firewall/rule-tracker'
import { listRuleNames } from './blocking/firewall/netsh'
import { applyNexusBlock, clearNexusBlock, HOSTS_PATH } from './blocking/hosts/writer'
import { flushDns } from './blocking/hosts/flush-dns'
import { startProcessKiller } from './blocking/processes/killer'
import {
  getWindowsEdition,
  pickBlockingStrategy,
  startAppLockerBlocker,
  type WindowsEdition,
} from './blocking/applocker/policy'
import { createBlockingPersistence } from './blocking/session/persistence'
import type { HostsAdapter } from './blocking/session/manager'
import type { LayerStatusValue } from './blocking/session/types'
import type { Storage } from './storage'
import type { BlockingHostDeps, ProcessControl } from './blocking-host'
import log from './blocking/engine-log'

/**
 * Couche process réelle : sélection AppLocker vs process kill, suivi du statut.
 * Porté de `blocking.handlers.ts` — sans le `notifyServiceNotStarted` (notifs
 * réservées à l'UI, spec §6) : l'échec AppLocker est exposé via `status() = 'error'`.
 */
export function createProcessControl(cfg: {
  elevated: boolean
  edition: WindowsEdition
}): ProcessControl {
  let status: LayerStatusValue = 'inactive'
  let strictBlocking = true
  return {
    setStrictBlocking(strict) {
      strictBlocking = strict
    },
    status: () => status,
    start(forbidden) {
      if (forbidden.length === 0) {
        status = 'inactive'
        return { stop: () => undefined }
      }
      const strategy = pickBlockingStrategy({
        elevated: cfg.elevated,
        strictBlocking,
        edition: cfg.edition,
      })
      if (strategy.processLayer !== 'applocker') {
        status = 'ok'
        log.warn('[blocking] AppLocker indisponible, repli sur process kill', strategy.reason)
        const killer = startProcessKiller(forbidden)
        return {
          stop: () => {
            killer.stop()
            status = 'inactive'
          },
        }
      }
      const appLocker = startAppLockerBlocker(forbidden, strategy.appLockerMode)
      if (appLocker.applied) {
        status = 'ok'
        return {
          stop: () => {
            appLocker.stop()
            status = 'inactive'
          },
        }
      }
      status = 'error'
      log.warn('[blocking] AppLocker indisponible', appLocker.error)
      const killer = startProcessKiller(forbidden)
      status = 'ok'
      return {
        stop: () => {
          killer.stop()
          status = 'inactive'
        },
      }
    },
  }
}

/**
 * Assemble les dépendances réelles (couplées à l'OS) du host de blocage.
 * `elevated: true` — le service tourne en compte SYSTEM (spec §4).
 */
export function createBlockingAdapters(storage: Storage): BlockingHostDeps {
  const edition = getWindowsEdition()
  const hosts: HostsAdapter = {
    apply: applyNexusBlock,
    clear: clearNexusBlock,
    flushDns,
  }
  return {
    persistence: createBlockingPersistence(storage),
    hosts,
    firewall: createFirewallTracker(),
    processes: createProcessControl({ elevated: true, edition }),
    layerProbe: {
      readHostsFile: () => fsp.readFile(HOSTS_PATH, 'utf8'),
      listFirewallRules: () => listRuleNames(),
    },
    elevated: true,
  }
}
