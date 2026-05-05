import { addBlockRule, deleteRuleByName, listRuleNames } from './netsh'

export type FirewallTracker = {
  applied: () => string[]
  applyAll: (sessionId: string, exes: string[]) => Promise<string[]>
  removeAll: () => Promise<void>
  hydrate: (existing: string[]) => void
}

export function createFirewallTracker(): FirewallTracker {
  let applied: string[] = []
  return {
    applied: () => applied.slice(),
    hydrate: (existing) => {
      applied = existing.slice()
    },
    async applyAll(sessionId, exes) {
      const names: string[] = []
      for (const exe of exes) {
        const name = await addBlockRule({ sessionId, exePath: exe })
        names.push(name)
      }
      applied = names
      return names.slice()
    },
    async removeAll() {
      const all = await listRuleNames().catch(() => [] as string[])
      const orphans = all.filter((n) => n.startsWith('Nexus_Block_'))
      const toDelete = new Set([...applied, ...orphans])
      for (const name of toDelete) {
        await deleteRuleByName(name).catch(() => {})
      }
      applied = []
    },
  }
}
