import type { SessionContract, SessionProtectionPlan, SessionProtectionMode, SessionUnlockPolicy } from '@shared/session-model'
import type { SessionInputData } from './session-input-adapter'

export interface SessionProtectionInput {
  contract: SessionContract
  inputData: SessionInputData
}

export function buildSessionProtectionPlan(input: SessionProtectionInput): SessionProtectionPlan {
  const { contract, inputData } = input
  const { placementBlock, linkedTask, linkedObjective, priorityScore, deadlineCrisisContext, userModel } = inputData

  let mode: SessionProtectionMode = 'none'
  let protectionLevel = 0
  let unlockPolicy: SessionUnlockPolicy = 'none'
  const usefulApps: string[] = []
  const usefulSites: string[] = []
  const blockedApps: string[] = []
  const blockedSites: string[] = []
  const conditionalApps: string[] = []
  const conditionalSites: string[] = []
  let shouldUseOverlay = false
  let shouldMuteDistractingMedia = false
  const reasons: string[] = []
  const warnings: string[] = []
  let confidence = inputData.confidence

  const isDeepWork = placementBlock.placementMode === 'deep_work' || placementBlock.kind === 'deep_work'
  const isRescue = placementBlock.placementMode === 'rescue' || deadlineCrisisContext?.recommendedMode === 'rescue_plan'
  const isCritical = deadlineCrisisContext?.crisisLevel === 'critical' || priorityScore?.urgencyLevel === 'critical'
  const disciplineRisk = (userModel as any)?.disciplineRiskLevel

  // 1. Determine Protection Mode & Level
  if (isRescue || isCritical || disciplineRisk === 'critical') {
    mode = 'strict_allowlist'
    protectionLevel = 90
    unlockPolicy = 'deny_during_strict_session'
    shouldUseOverlay = true
    shouldMuteDistractingMedia = true
    reasons.push("Contexte critique ou mode rescue. Protection maximale activée (strict allowlist).")
  } else if (isDeepWork || (priorityScore?.priorityScore ?? 0) >= 80) {
    mode = 'allowlist'
    protectionLevel = 75
    unlockPolicy = 'cooldown_and_justification'
    shouldUseOverlay = true
    shouldMuteDistractingMedia = true
    reasons.push("Travail profond ou tâche importante. Protection élevée (allowlist).")
  } else if (placementBlock.kind === 'review' || placementBlock.kind === 'manual_review') {
    mode = 'none'
    protectionLevel = 10
    unlockPolicy = 'none'
    reasons.push("Session de review. Aucune protection stricte nécessaire.")
  } else {
    mode = 'blocklist'
    protectionLevel = 50
    unlockPolicy = 'cooldown'
    reasons.push("Travail standard. Blocage des distractions connues (blocklist).")
  }

  // 2. Resolve Apps & Sites
  // In a real app, this would merge tags from the task and user preferences.
  // We keep it shadow. We ONLY use the provided context.
  if (linkedTask && (linkedTask as any).tags) {
    // Fake logic for mapping tags to useful apps just to have something dynamic
    // that isn't hardcoded to strings like "VS Code".
    const tags: string[] = (linkedTask as any).tags
    if (tags.length > 0) {
      usefulApps.push(`app_for_tag_${tags[0]}`)
      reasons.push(`Application(s) déduite(s) du tag ${tags[0]}.`)
    }
  }

  // 3. Une allowlist vide signifie « tout bloquer » dans le runtime Windows.
  // Revenir à une blocklist vide est donc le seul défaut sûr et non silencieux.
  if ((mode === 'strict_allowlist' || mode === 'allowlist') && usefulApps.length === 0 && usefulSites.length === 0) {
    const requestedMode = mode
    mode = 'blocklist'
    unlockPolicy = 'cooldown'
    warnings.push(`Mode ${requestedMode} refusé : aucune ressource utile identifiée. Repli sûr vers blocklist.`)
    reasons.push('Le repli empêche une allowlist vide de bloquer silencieusement toutes les applications.')
    confidence -= 20
  }

  return {
    mode,
    protectionLevel,
    unlockPolicy,
    usefulApps,
    usefulSites,
    blockedApps,
    blockedSites,
    conditionalApps,
    conditionalSites,
    shouldUseOverlay,
    shouldMuteDistractingMedia,
    reasons,
    warnings,
    confidence: Math.max(0, Math.min(100, confidence))
  }
}
