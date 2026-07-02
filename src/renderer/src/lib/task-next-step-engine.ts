import type { Task } from '@shared/schemas'
import type { TaskNextStep, TaskRisk, TaskSessionProfile, TaskWorkload } from '@shared/task-model'

export type BuildTaskNextStepInput = {
  task: Task
  workload: TaskWorkload
  risk: TaskRisk
  session: TaskSessionProfile
}

export function buildTaskNextStep(args: BuildTaskNextStepInput): TaskNextStep {
  if (args.task.status === 'completed') {
    return {
      kind: 'none',
      label: 'Tâche déjà terminée',
      reasons: ['Aucune action nécessaire tant que la tâche reste terminée.'],
    }
  }
  if (args.risk.ambiguityRiskScore >= 70) {
    return {
      kind: 'clarify_task',
      label: 'Clarifier la première action concrète',
      recommendedSessionMinutes: 10,
      reasons: ['La tâche est trop floue pour être traitée efficacement sans clarification.'],
    }
  }
  if (args.workload.shouldBeSplit) {
    return {
      kind: 'split_task',
      label: 'Découper la tâche avant de lancer une grosse session',
      recommendedSessionMinutes: 15,
      reasons: ['La tâche est assez lourde pour mériter un découpage.'],
    }
  }
  if (args.workload.remainingMinutes <= 30) {
    return {
      kind: 'finish_task',
      label: 'Terminer cette tâche',
      recommendedSessionMinutes: Math.max(15, args.workload.remainingMinutes),
      reasons: ['Il reste peu de temps : finir est plus utile que repousser.'],
    }
  }
  if (args.task.status === 'active') {
    return {
      kind: 'continue_session',
      label: 'Continuer la tâche maintenant',
      recommendedSessionMinutes: args.session.recommendedSessionMinutes,
      reasons: ['La tâche est déjà active.'],
    }
  }
  return {
    kind: 'start_session',
    label: 'Démarrer une session',
    recommendedSessionMinutes: args.session.recommendedSessionMinutes,
    reasons: ['Le prochain pas naturel est de lancer une session sur cette tâche.'],
  }
}
