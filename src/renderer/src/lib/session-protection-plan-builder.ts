import type { SessionContract, SessionProtectionMode, SessionProtectionPlan, SessionUnlockPolicy } from '@shared/session-model'
import type { SessionInputData } from './session-input-adapter'
import { sessionPriorityProtection, sessionPriorityTotal, sessionPriorityUrgency } from './session-input-adapter'

export interface SessionProtectionInput {
  contract: SessionContract
  inputData: SessionInputData
}

function clampScore(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function unlockPolicy(level: number, strict: boolean): SessionUnlockPolicy {
  if (strict && level >= 85) return 'deny_during_strict_session'
  if (level >= 65) return 'cooldown_and_justification'
  if (level >= 45) return 'justification'
  if (level >= 20) return 'cooldown'
  return 'none'
}

export function buildSessionProtectionPlan(input: SessionProtectionInput): SessionProtectionPlan {
  const { contract, inputData } = input
  const { placementBlock, linkedTask, linkedObjective, deadlineCrisisContext, userModel } = inputData
  const appSiteContext = inputData.appSiteContext ?? {
    usefulApps: [], usefulSites: [], distractingApps: [], distractingSites: [],
    conditionalApps: [], conditionalSites: [],
  }
  const reasons: string[] = []
  const warnings: string[] = []
  let confidence = inputData.confidence

  const taskProtection = linkedTask && 'protection' in linkedTask
    ? linkedTask.protection.recommendedProtectionLevel
    : 0
  const objectiveProtection = linkedObjective && 'protection' in linkedObjective
    ? linkedObjective.protection.recommendedProtectionLevel
    : 0
  const priorityProtection = sessionPriorityProtection(inputData.priorityScore)
  const urgency = sessionPriorityUrgency(inputData.priorityScore)
  const urgencyProtection = urgency === 'critical' ? 90 : urgency === 'high' ? 72 : urgency === 'medium' ? 50 : 20
  const crisis = deadlineCrisisContext?.crisisLevel
  const crisisProtection = crisis === 'impossible_full_completion' || crisis === 'rescue_required'
    ? 95
    : crisis === 'critical' ? 88 : crisis === 'tight' ? 65 : 0
  const disciplineRisk = userModel?.disciplineModel.globalDistractionRisk ?? 0
  const seriousMode = placementBlock.placementMode === 'deep_work' || placementBlock.kind === 'deep_work'
  const rescue = placementBlock.placementMode === 'rescue' || deadlineCrisisContext?.recommendedMode === 'rescue_plan'
  const modeProtection = rescue ? 95 : seriousMode ? 78 : placementBlock.placementMode === 'intensive' ? 82 : 35
  const taskCentral = linkedTask && 'purpose' in linkedTask
    ? linkedTask.purpose.strength === 'mission_critical'
    : sessionPriorityTotal(inputData.priorityScore) >= 90
  const objectiveImportant = linkedObjective && 'mission' in linkedObjective
    ? linkedObjective.mission.declaredImportance === 'important' || linkedObjective.mission.declaredImportance === 'central'
    : false
  const taskLight = linkedTask && 'workload' in linkedTask
    ? linkedTask.workload.workloadLevel === 'light'
    : (linkedTask && 'remainingMinutes' in linkedTask ? (linkedTask.remainingMinutes ?? 60) <= 30 : false)

  let protectionLevel = clampScore(Math.max(
    taskProtection,
    objectiveProtection,
    priorityProtection,
    urgencyProtection,
    crisisProtection,
    disciplineRisk,
    modeProtection,
  ))
  let mode: SessionProtectionMode
  const strict = rescue || crisisProtection >= 88 || taskCentral || disciplineRisk >= 75

  if (strict) {
    mode = 'strict_allowlist'
    protectionLevel = Math.max(85, protectionLevel)
    reasons.push('Les signaux critiques, centraux, rescue ou de distraction élevée imposent une allowlist stricte.')
  } else if (seriousMode || urgency === 'high' || objectiveImportant || sessionPriorityTotal(inputData.priorityScore) >= 75) {
    mode = 'allowlist'
    protectionLevel = Math.max(65, protectionLevel)
    reasons.push('La session sérieuse ou importante limite l’environnement aux ressources utiles.')
  } else if ((placementBlock.placementMode === 'manual_review' && taskLight) || inputData.confidence < 25) {
    mode = 'none'
    protectionLevel = Math.min(20, protectionLevel)
    reasons.push('La session est une revue légère ou les données sont trop faibles pour appliquer un blocage fiable.')
  } else {
    mode = 'blocklist'
    protectionLevel = Math.max(30, protectionLevel)
    reasons.push('La session légère bloque uniquement les distractions connues.')
  }

  const usefulApps = unique(appSiteContext.usefulApps)
  const usefulSites = unique(appSiteContext.usefulSites)
  const blockedApps = unique(appSiteContext.distractingApps)
  const blockedSites = unique(appSiteContext.distractingSites)
  const conditionalApps = unique(appSiteContext.conditionalApps)
  const conditionalSites = unique(appSiteContext.conditionalSites)

  if (['allowlist', 'strict_allowlist'].includes(mode) && usefulApps.length + usefulSites.length === 0) {
    warnings.push('La protection exige une allowlist, mais aucune ressource utile n’est connue.')
    confidence -= 25
  }
  if (mode === 'blocklist' && blockedApps.length + blockedSites.length === 0) {
    warnings.push('Aucune distraction contextuelle connue; le blocage ciblé sera minimal.')
    confidence -= 10
  }
  if (contract.requiresStrictEvidence) reasons.push('Le niveau de preuve du contrat renforce la protection de l’environnement.')

  return {
    mode,
    protectionLevel: clampScore(protectionLevel),
    unlockPolicy: unlockPolicy(protectionLevel, mode === 'strict_allowlist'),
    usefulApps,
    usefulSites,
    blockedApps,
    blockedSites,
    conditionalApps,
    conditionalSites,
    shouldUseOverlay: mode === 'allowlist' || mode === 'strict_allowlist' || protectionLevel >= 60,
    shouldMuteDistractingMedia: protectionLevel >= 50,
    reasons,
    warnings,
    confidence: clampScore(confidence),
  }
}
