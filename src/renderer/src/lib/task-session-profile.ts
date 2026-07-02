import type { TaskRisk, TaskSessionProfile, TaskUrgency, TaskWorkload } from '@shared/task-model'

export type BuildTaskSessionProfileInput = {
  workload: TaskWorkload
  urgency: TaskUrgency
  risk: TaskRisk
}

export function buildTaskSessionProfile(args: BuildTaskSessionProfileInput): TaskSessionProfile {
  const minimumUsefulSessionMinutes = args.workload.remainingMinutes <= 30 ? 15 : 25
  const maximumSafeSessionMinutes = args.workload.workloadLevel === 'extreme' ? 120 : args.workload.workloadLevel === 'heavy' ? 90 : 75
  let recommendedSessionMinutes = args.workload.suggestedChunkMinutes
  
  if (args.urgency.urgencyLevel === 'critical') recommendedSessionMinutes = Math.max(recommendedSessionMinutes, 75)
  if (args.risk.riskLevel === 'critical') recommendedSessionMinutes = Math.max(recommendedSessionMinutes, 60)
  
  recommendedSessionMinutes = Math.min(maximumSafeSessionMinutes, Math.max(minimumUsefulSessionMinutes, recommendedSessionMinutes))
  const shouldUseDeepWorkBlock = args.workload.workloadLevel === 'heavy' || args.workload.workloadLevel === 'extreme' || args.urgency.urgencyLevel === 'critical'
  
  const reasons: string[] = []
  
  if (shouldUseDeepWorkBlock) reasons.push('Une session protégée (Deep Work) est préférable pour réduire les interruptions.')
  if (args.workload.shouldBeSplit) reasons.push('La tâche devrait être traitée en morceaux plutôt qu’en une seule masse.')
  if (reasons.length === 0) reasons.push('Session standard recommandée basée sur la charge et l’urgence.')

  return {
    recommendedSessionMinutes,
    minimumUsefulSessionMinutes,
    maximumSafeSessionMinutes,
    shouldUseDeepWorkBlock,
    shouldAskForBreakAfterSession: recommendedSessionMinutes >= 75,
    reasons,
  }
}
