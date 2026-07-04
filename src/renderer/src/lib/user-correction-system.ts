import { addUserCorrection, normalizeUserModelDomain, type UserCorrection, type UserModel } from '@shared/user-model'

export type CreateUserCorrectionInput = Omit<UserCorrection, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
export type CorrectionSuspicionContext = { strictSession?: boolean; targetBlocked?: boolean; recentUnlockRequests?: number; previousRefusals?: number; contradictsNonNegotiable?: boolean }

export function createUserCorrection(input: CreateUserCorrectionInput): UserCorrection {
  return {
    ...input,
    id: input.id ?? `correction_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`,
    targetId: input.targetType === 'site' && input.targetId ? normalizeUserModelDomain(input.targetId) : input.targetId,
    createdAt: input.createdAt ?? new Date().toISOString(),
  }
}

export function isCorrectionSuspicious(correction: UserCorrection, context: CorrectionSuspicionContext = {}): boolean {
  const permitsBlockedTarget = (correction.targetType === 'app' || correction.targetType === 'site') && correction.newValue === 'useful'
  return Boolean((correction.context?.duringSession && context.strictSession) || (context.targetBlocked && permitsBlockedTarget) || (context.recentUnlockRequests ?? 0) >= 3 || (context.previousRefusals ?? 0) >= 2 || context.contradictsNonNegotiable)
}

export function getCorrectionWeight(correction: UserCorrection, context: CorrectionSuspicionContext = {}): number {
  const base = { weak: 0.25, normal: 0.5, strong: 0.8, permanent: 1 }[correction.strength]
  return Math.max(0.1, base * (isCorrectionSuspicious(correction, context) ? 0.35 : correction.context?.duringSession ? 0.7 : 1))
}

export function mergeCorrections(corrections: readonly UserCorrection[]): UserCorrection[] {
  const weight = { weak: 1, normal: 2, strong: 3, permanent: 4 }
  const map = new Map<string, UserCorrection>()
  for (const correction of [...corrections].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const key = `${correction.type}:${correction.targetType}:${correction.targetId ?? '*'}`
    const current = map.get(key)
    if (!current || weight[correction.strength] > weight[current.strength] || (weight[correction.strength] === weight[current.strength] && correction.createdAt >= current.createdAt)) map.set(key, correction)
  }
  return [...map.values()]
}

export function applyUserCorrectionToModel(model: UserModel, correction: UserCorrection, context: CorrectionSuspicionContext = {}): UserModel {
  let next = addUserCorrection(model, correction)
  const weight = getCorrectionWeight(correction, context)
  if (correction.type === 'chronotype_corrected' && typeof correction.newValue === 'string' && ['morning','intermediate','evening','unknown'].includes(correction.newValue)) {
    next = { ...next, cognitiveModel: { ...next.cognitiveModel, declaredChronotype: correction.newValue as UserModel['cognitiveModel']['declaredChronotype'], updatedAt: correction.createdAt } }
  }
  if (correction.type === 'objective_importance_corrected' && correction.targetId && typeof correction.newValue === 'number') {
    next = { ...next, objectivePreferences: next.objectivePreferences.map((preference) => preference.objectiveId === correction.targetId ? { ...preference, declaredImportanceScore: Math.max(0, Math.min(100, Math.round(correction.newValue as number))), confidence: Math.max(preference.confidence, Math.round(weight * 100)), reasons: [...preference.reasons, 'Importance corrigée explicitement par l’utilisateur.'], updatedAt: correction.createdAt } : preference) }
  }
  if ((correction.type === 'app_classification_corrected' || correction.type === 'site_classification_corrected') && correction.targetId && typeof correction.newValue === 'string') {
    next = { ...next, appSitePreferences: next.appSitePreferences.map((preference) => preference.identifier === correction.targetId ? { ...preference, contextRules: [...preference.contextRules, { contextType: correction.context?.taskId ? 'task' : correction.context?.objectiveId ? 'objective' : 'domain', contextId: correction.context?.taskId ?? correction.context?.objectiveId, domain: correction.context?.taskId || correction.context?.objectiveId ? undefined : 'discipline', classification: correction.newValue as 'useful'|'neutral'|'distraction'|'conditional', confidence: Math.round(weight * 100), source: 'user', reasons: [isCorrectionSuspicious(correction, context) ? 'Correction conservée avec prudence car elle a été faite en contexte protégé.' : 'Correction explicite de l’utilisateur.'], updatedAt: correction.createdAt }], updatedAt: correction.createdAt } : preference) }
  }
  return next
}
