import { RealExecutableModuleAudit } from '../../../shared/real-activation-protocol-model'

export interface RealActivationModuleAuditInput {
  activationBridgeDraft?: unknown
  knownModules?: unknown[]
  now?: string
  idFactory?: () => string
}

export function buildRealActivationModuleAudit(input: RealActivationModuleAuditInput): RealExecutableModuleAudit[] {
  const factory = input.idFactory || (() => `audit-${Date.now()}-${Math.floor(Math.random() * 1000)}`)

  return [
    {
      id: factory(),
      kind: 'session_manager',
      name: 'Session Manager',
      path: 'src/service/blocking/session/manager.ts',
      realFunctions: [
        {
          name: 'startSession',
          effect: 'starts_session',
          dangerLevel: 'critical',
          canCallInPoint16: false,
          canReferenceSymbolically: true,
          candidateForFuturePoint: true,
          requiredPreconditions: ['User Confirmation', 'Valid Contract'],
          risks: ['Lockout', 'Unintended blocks']
        },
        {
          name: 'hydrateFromDisk',
          effect: 'starts_session',
          dangerLevel: 'high',
          canCallInPoint16: false,
          canReferenceSymbolically: true,
          candidateForFuturePoint: true,
          requiredPreconditions: ['Persistence active'],
          risks: ['Orphaned session']
        }
      ],
      warnings: [],
      confidence: 1
    },
    {
      id: factory(),
      kind: 'task_store',
      name: 'Task Store',
      path: 'src/renderer/src/store/tasks.store.ts',
      realFunctions: [
        {
          name: 'completeTask',
          effect: 'modifies_task',
          dangerLevel: 'high',
          canCallInPoint16: false,
          canReferenceSymbolically: true,
          candidateForFuturePoint: true,
          requiredPreconditions: ['Verified completion'],
          risks: ['Data loss', 'Inconsistent state']
        }
      ],
      warnings: [],
      confidence: 1
    },
    {
      id: factory(),
      kind: 'blocking_store',
      name: 'Blocking Store',
      path: 'src/renderer/src/store/blocking.store.ts',
      realFunctions: [
        {
          name: 'applyBlockingProfile',
          effect: 'writes_store',
          dangerLevel: 'high',
          canCallInPoint16: false,
          canReferenceSymbolically: true,
          candidateForFuturePoint: true,
          requiredPreconditions: ['Valid profile'],
          risks: ['Loss of control']
        }
      ],
      warnings: [],
      confidence: 1
    },
    {
      id: factory(),
      kind: 'process_watcher',
      name: 'Process Killer',
      path: 'src/service/blocking/processes/killer.ts',
      realFunctions: [
        {
          name: 'killProcess',
          effect: 'writes_hosts', // generic system side effect
          dangerLevel: 'high',
          canCallInPoint16: false,
          canReferenceSymbolically: true,
          candidateForFuturePoint: true,
          requiredPreconditions: ['Admin privilege'],
          risks: ['Data corruption in target process']
        }
      ],
      warnings: [],
      confidence: 1
    },
    {
      id: factory(),
      kind: 'strict_block_window',
      name: 'Strict Block Window',
      path: 'src/main/tracking/strict-block-window.ts',
      realFunctions: [
        {
          name: 'createBlockWindow',
          effect: 'attaches_window',
          dangerLevel: 'high',
          canCallInPoint16: false,
          canReferenceSymbolically: true,
          candidateForFuturePoint: true,
          requiredPreconditions: ['App Overlays allowed'],
          risks: ['UI locked', 'System freeze if bugged']
        }
      ],
      warnings: [],
      confidence: 1
    },
    {
      id: factory(),
      kind: 'unknown',
      name: 'Process Window Probe',
      path: 'src/main/tracking/process-window-probe.ts',
      realFunctions: [
        {
          name: 'muteAppAudio',
          effect: 'mutes_media',
          dangerLevel: 'medium',
          canCallInPoint16: false,
          canReferenceSymbolically: true,
          candidateForFuturePoint: true,
          requiredPreconditions: [],
          risks: ['Audio subsystems drift']
        },
        {
          name: 'pauseAppMediaSession',
          effect: 'mutes_media',
          dangerLevel: 'medium',
          canCallInPoint16: false,
          canReferenceSymbolically: true,
          candidateForFuturePoint: true,
          requiredPreconditions: [],
          risks: ['Media keys override']
        }
      ],
      warnings: [],
      confidence: 1
    },
    {
      id: factory(),
      kind: 'unknown',
      name: 'Site Tracker',
      path: 'src/main/tracking/site-tracker.ts',
      realFunctions: [
        {
          name: 'createSiteTracker',
          effect: 'read_only',
          dangerLevel: 'low',
          canCallInPoint16: false,
          canReferenceSymbolically: true,
          candidateForFuturePoint: true,
          requiredPreconditions: [],
          risks: ['Performance overhead']
        }
      ],
      warnings: [],
      confidence: 1
    },
    {
      id: factory(),
      kind: 'hosts_writer',
      name: 'Hosts Writer',
      path: 'src/service/blocking/hosts/writer.ts',
      realFunctions: [
        {
          name: 'renderVethosBlock',
          effect: 'writes_hosts',
          dangerLevel: 'critical',
          canCallInPoint16: false,
          canReferenceSymbolically: true,
          candidateForFuturePoint: true,
          requiredPreconditions: ['Elevated privileges', 'File unlock'],
          risks: ['Network drop', 'DNS resolution broken']
        }
      ],
      warnings: [],
      confidence: 1
    },
    {
      id: factory(),
      kind: 'firewall',
      name: 'Firewall',
      path: 'src/service/blocking/firewall/netsh.ts',
      realFunctions: [
        {
          name: 'applyRules',
          effect: 'writes_firewall',
          dangerLevel: 'critical',
          canCallInPoint16: false,
          canReferenceSymbolically: true,
          candidateForFuturePoint: true,
          requiredPreconditions: ['Elevated privileges'],
          risks: ['Complete connection loss', 'OS side effect']
        }
      ],
      warnings: [],
      confidence: 1
    },
    {
      id: factory(),
      kind: 'timer',
      name: 'Session Timer',
      path: 'src/service/blocking/session/timer.ts',
      realFunctions: [
        {
          name: 'startAntiCheatTimer',
          effect: 'starts_timer',
          dangerLevel: 'low',
          canCallInPoint16: false,
          canReferenceSymbolically: true,
          candidateForFuturePoint: true,
          requiredPreconditions: ['Active Session'],
          risks: ['Drift', 'Battery usage']
        }
      ],
      warnings: [],
      confidence: 1
    }
  ]
}
