import { promises as fsp } from 'node:fs'
import { createFirewallTracker } from './blocking/firewall/rule-tracker'
import { listRuleNames } from './blocking/firewall/netsh'
import { applyVethosBlock, clearVethosBlock, HOSTS_PATH } from './blocking/hosts/writer'
import { flushDns } from './blocking/hosts/flush-dns'
import { startProcessKiller } from './blocking/processes/killer'
import {
  clearManagedAppLockerRules,
  getWindowsEdition,
  type WindowsEdition,
} from './blocking/applocker/policy'
import { createBlockingPersistence } from './blocking/session/persistence'
import type { HostsAdapter } from './blocking/session/manager'
import type { LayerStatusValue } from './blocking/session/types'
import type { Storage } from './storage'
import type { BlockingHostDeps, ProcessControl } from './blocking-host'
import log from './blocking/engine-log'

/**
 * Couche process réelle : observe les applications ciblées et déclenche le
 * rappel UI. Les processus restent ouverts ; les sites et règles réseau sont
 * toujours gérés par leurs couches respectives.
 */
export function createProcessControl(_cfg: {
  elevated: boolean
  edition: WindowsEdition
}): ProcessControl {
  let status: LayerStatusValue = 'inactive'
  return {
    setStrictBlocking(_strict) {},
    status: () => status,
    start(forbidden, onBlocked, options) {
      if (forbidden.length === 0 && options?.mode !== 'allowlist') {
        status = 'inactive'
        return { stop: () => undefined }
      }
      status = 'ok'
      log.info('[blocking] surveillance de rappel active; aucun processus ne sera ferme')
      const watcher = startProcessKiller(forbidden, 100, onBlocked, {
        mode: options?.mode,
        allowedExeNames: options?.allowedExeNames,
      })
      return {
        stop: () => {
          watcher.stop()
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
  const appLockerCleanup = clearManagedAppLockerRules()
  if (appLockerCleanup.error) {
    log.warn('[blocking] nettoyage des anciennes règles AppLocker échoué', appLockerCleanup.error)
  } else if (appLockerCleanup.removed) {
    log.info('[blocking] anciennes règles AppLocker Nexus/Vethos supprimées')
  }
  const hosts: HostsAdapter = {
    apply: applyVethosBlock,
    clear: clearVethosBlock,
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
