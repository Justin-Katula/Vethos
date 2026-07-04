import type { Objective, Task, UnlockPolicy, WorkBlockingConfig } from '@shared/schemas'

type Defaults = {
  cooldownMinutes?: number
  justificationWords?: number
}

export function createDefaultWorkBlockingConfig(defaults: Defaults = {}): WorkBlockingConfig {
  return {
    enabled: true,
    mode: 'allowlist',
    sites: [],
    processes: [],
    networkApps: [],
    unlockPolicy: {
      type: 'cooldown_and_justification',
      minutes: defaults.cooldownMinutes ?? 10,
      minWords: defaults.justificationWords ?? 50,
    },
  }
}

export function resolveWorkBlockingForTask(
  task: Task,
  objective: Objective | null | undefined,
): WorkBlockingConfig | null {
  if (task.blocking?.enabled) return task.blocking
  if (objective?.blocking?.enabled) return objective.blocking
  return null
}

export function workBlockingHasSelection(config: WorkBlockingConfig | undefined): boolean {
  return Boolean(
    config?.enabled &&
      (config.sites.length > 0 || config.processes.length > 0 || config.networkApps.length > 0),
  )
}

export function unlockPolicyLabel(policy: UnlockPolicy): string {
  switch (policy.type) {
    case 'none':
      return 'Sans justification'
    case 'deny_during_strict_session':
      return 'Aucun déblocage pendant la session stricte'
    case 'cooldown':
      return `${policy.minutes} min de cooldown`
    case 'justification':
      return `${policy.minWords} mots requis`
    case 'cooldown_and_justification':
      return `${policy.minutes} min + ${policy.minWords} mots`
  }
}
