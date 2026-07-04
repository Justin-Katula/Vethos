import type { Objective, Task, UnlockPolicy } from '@shared/schemas'
import type { TaskAppSiteContext, TaskProtectionProfile, TaskPurpose, TaskRisk, TaskUrgency, TaskWorkload } from '@shared/task-model'
import type { UserModel } from '@shared/user-model'
import { clampScore } from './task-model-utils'

function buildUnlockPolicy(score: number): UnlockPolicy {
  if (score >= 85) return { type: 'cooldown_and_justification', minutes: 10, minWords: 120 }
  if (score >= 70) return { type: 'justification', minWords: 80 }
  if (score >= 45) return { type: 'cooldown', minutes: 5 }
  return { type: 'none' }
}

export type BuildTaskProtectionProfileInput = {
  task: Task
  objective?: Objective | null
  purpose: TaskPurpose
  workload: TaskWorkload
  urgency: TaskUrgency
  risk: TaskRisk
  appSiteContext: TaskAppSiteContext
  userModel?: UserModel | null
}

export function buildTaskProtectionProfile(args: BuildTaskProtectionProfileInput): TaskProtectionProfile {
  const blocking = args.task.blocking ?? args.objective?.blocking
  let level = Math.max(args.risk.overallRiskScore, args.urgency.urgencyScore, args.workload.complexityScore)
  level = Math.max(level, args.purpose.importanceScore * 0.75)
  if (args.userModel?.declaredProfile.protectionStyle === 'strict') level += 10
  if (args.userModel?.declaredProfile.protectionStyle === 'calm') level -= 8
  
  const recommendedProtectionLevel = clampScore(level)
  const allowedApps = args.appSiteContext.usefulApps
  const allowedSites = args.appSiteContext.usefulSites
  const allowlistHasUsefulResource = allowedApps.length > 0 || allowedSites.length > 0
  const requestedMode =
    blocking?.mode ??
    (recommendedProtectionLevel >= 70 || args.risk.riskLevel === 'high' || args.risk.riskLevel === 'critical'
      ? 'allowlist'
      : 'blocklist')
      
  const mode = requestedMode === 'allowlist' && !allowlistHasUsefulResource ? 'blocklist' : requestedMode
      
  const reasons = []
  if (mode === 'allowlist') reasons.push('Une allowlist devient préférable pour les tâches risquées ou importantes.')
  if (requestedMode === 'allowlist' && mode === 'blocklist') {
    reasons.push('Allowlist refusée : aucun outil utile connu. Repli sûr vers le blocage ciblé.')
  }
  if (args.appSiteContext.usefulApps.length > 0 || args.appSiteContext.usefulSites.length > 0) {
    reasons.push('Le modèle connaît déjà des outils utiles pour cette tâche.')
  }
  if (reasons.length === 0) reasons.push('Le profil de protection par défaut est appliqué.')

  return {
    recommendedProtectionLevel,
    mode,
    unlockPolicy: args.task.unlockPolicy ?? blocking?.unlockPolicy ?? buildUnlockPolicy(recommendedProtectionLevel),
    usefulApps: args.appSiteContext.usefulApps,
    usefulSites: args.appSiteContext.usefulSites,
    distractingApps: args.appSiteContext.distractingApps,
    distractingSites: args.appSiteContext.distractingSites,
    reasons,
    currentBehaviorStillControlsBlocking: true,
  }
}
