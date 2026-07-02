import { promises as fsp } from 'node:fs'
import { HOSTS_PATH, applyVethosBlock } from '../hosts/writer'
import { parseHostsFile } from '../hosts/parser'
import { flushDns } from '../hosts/flush-dns'
import { listRuleNames } from '../firewall/netsh'
import type { ActiveSession } from '@shared/schemas'

export type DriftEvent = { layer: 'hosts' | 'firewall'; restored: boolean }

export type DriftDetector = {
  start: (
    getActive: () => ActiveSession | null,
    applyFirewall: (s: ActiveSession) => Promise<void>,
  ) => void
  stop: () => void
  on: (cb: (e: DriftEvent) => void) => void
}

export function createDriftDetector(): DriftDetector {
  let timer: ReturnType<typeof setInterval> | null = null
  const listeners: Array<(e: DriftEvent) => void> = []

  return {
    start(getActive, applyFirewall) {
      if (timer) return
      timer = setInterval(async () => {
        const active = getActive()
        if (!active) return
        try {
          // hosts
          const raw = await fsp.readFile(HOSTS_PATH, 'utf8')
          const parsed = parseHostsFile(raw)
          const hasBlock = parsed.vethosBlock != null
          const expectedEntryCount = active.profileSnapshot.blockedSites.length * 8 // 4 préfixes × 2 IPs
          const blockMatches = parsed.vethosBlock?.entries.length === expectedEntryCount
          if (!hasBlock || !blockMatches) {
            await applyVethosBlock({
              sessionId: active.id,
              startedAt: active.startedAt,
              domains: active.profileSnapshot.blockedSites,
            })
            await flushDns()
            for (const l of listeners) l({ layer: 'hosts', restored: true })
          }
          // firewall
          const allRules = await listRuleNames().catch(() => [] as string[])
          const expectedNames = new Set(active.appliedFirewallRules)
          const stillThere = allRules.filter((n) => expectedNames.has(n))
          if (expectedNames.size > 0 && stillThere.length !== expectedNames.size) {
            await applyFirewall(active)
            for (const l of listeners) l({ layer: 'firewall', restored: true })
          }
        } catch {
          /* swallow et retry à la prochaine itération */
        }
      }, 5000)
    },
    stop() {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    },
    on(cb) {
      listeners.push(cb)
    },
  }
}
