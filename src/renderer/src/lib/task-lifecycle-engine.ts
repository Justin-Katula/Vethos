import type { Task } from '@shared/schemas'
import type { TaskLifecycleStatus, TaskProgressV2, TaskRisk, TaskUrgency, TaskWorkload } from '@shared/task-model'

export type BuildTaskLifecycleStatusInput = {
  task: Task
  progress: TaskProgressV2
  urgency: TaskUrgency
  risk: TaskRisk
  workload: TaskWorkload
}

export function buildTaskLifecycleStatus(args: BuildTaskLifecycleStatusInput): TaskLifecycleStatus {
  if (args.task.status === 'completed' || args.progress.progressPercent >= 100) {
    return 'completed'
  }
  
  if (args.task.status === 'expired' || args.urgency.daysUntilDeadline < 0) {
    return 'expired'
  }
  
  if (args.task.status === 'active') {
    return 'active'
  }
  
  if (args.progress.progressPercent >= 85) {
    return 'almost_done'
  }
  
  if (args.risk.ambiguityRiskScore >= 70) {
    return 'unclear'
  }
  
  if (args.workload.shouldBeSplit || args.risk.workloadRiskScore >= 80) {
    return 'overloaded'
  }
  
  if (args.risk.overallRiskScore >= 70) {
    return 'at_risk'
  }
  
  if (args.progress.stagnationScore >= 70) {
    return 'stalled'
  }
  
  if (args.progress.investedMinutesTotal > 0) {
    return 'in_progress'
  }
  
  return 'queued'
}
