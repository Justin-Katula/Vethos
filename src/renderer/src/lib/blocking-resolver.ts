import type { Objective, RegistryItem, Task, UnlockPolicy } from '@shared/schemas'
import type { PlacedBlock } from './placement-engine'

export type SessionPayload = {
  blockedSites: string[]
  blockedProcesses: string[]
  blockedNetworkApps: string[]
  unlockPolicy: UnlockPolicy
  /** Label à utiliser dans les notifications (« Maths commence »). */
  label: string
}

const DEFAULT_UNLOCK: UnlockPolicy = { type: 'none' }

/**
 * Résout le payload de session pour un bloc planifié, à partir du registre,
 * des objectifs et des tâches. Renvoie null pour un bloc 'free' ou 'break'.
 *
 * Règles (spec D8) :
 *  - item demoted → bloqué.
 *  - item !classified → bloqué.
 *  - bloc 'objective' O : item bloqué ssi O ∉ usefulFor.objectives.
 *  - bloc 'task' T (autonome) : item bloqué ssi T ∉ usefulFor.standaloneTasks
 *    OU T n'est plus active (status !== 'active').
 */
export function resolveBlockingForBlock(
  block: PlacedBlock,
  registry: RegistryItem[],
  objectives: Objective[],
  tasks: Task[],
): SessionPayload | null {
  if (block.kind === 'free' || block.kind as string === 'break' || !block.refId) {
    return null
  }

  const activeStandaloneTaskIds = new Set(
    tasks.filter((t) => t.status === 'active' && t.linkedObjectiveId === null).map((t) => t.id),
  )

  const isUsefulForThisBlock = (item: RegistryItem): boolean => {
    if (!item.classified) return false
    if (item.demoted) return false
    if (block.kind === 'objective') {
      return item.usefulFor.objectives.includes(block.refId!)
    }
    if (block.kind === 'task') {
      return (
        item.usefulFor.standaloneTasks.includes(block.refId!) &&
        activeStandaloneTaskIds.has(block.refId!)
      )
    }
    return false
  }

  const blocked = registry.filter((item) => !isUsefulForThisBlock(item))
  const blockedSites = blocked.filter((i) => i.kind === 'site').map((i) => i.identifier)
  const blockedProcesses = [
    ...new Set(
      blocked
        .filter((i) => i.kind === 'app' && i.blockable !== false)
        .map((i) => i.executableName ?? i.identifier),
    ),
  ]

  let unlockPolicy: UnlockPolicy = DEFAULT_UNLOCK
  let label = 'Bloc'

  if (block.kind === 'objective') {
    const o = objectives.find((x) => x.id === block.refId)
    if (o) {
      unlockPolicy = o.unlockPolicy ?? DEFAULT_UNLOCK
      label = o.name
    }
  } else if (block.kind === 'task') {
    const t = tasks.find((x) => x.id === block.refId)
    if (t) {
      unlockPolicy = t.unlockPolicy ?? DEFAULT_UNLOCK
      label = t.title
    }
  }

  return {
    blockedSites,
    blockedProcesses,
    blockedNetworkApps: [], // v1.1 : mapper exeName → exePath dans le registre.
    unlockPolicy,
    label,
  }
}
