import type { CompletionGateResult } from '@shared/completion-gate'
import type { SessionOutcomeV2 } from '@shared/session-model'
import type { Task } from '@shared/schemas'

export function applySessionOutcomeToTask(
  task: Task,
  outcome: SessionOutcomeV2,
  completionGateResult?: CompletionGateResult,
  now = new Date().toISOString(),
): Task | null {
  const verifiesCompletion =
    outcome.outcome === 'completion_verified' &&
    outcome.shouldMarkTaskCompleted &&
    outcome.completionAccepted &&
    completionGateResult?.taskId === task.id &&
    completionGateResult.sessionId === outcome.sessionId &&
    completionGateResult.verifiedCompleted &&
    completionGateResult.decision === 'accept_completion'

  if (outcome.shouldMarkTaskCompleted && !verifiesCompletion) {
    throw new Error('Complétion refusée: le résultat de session et le completion gate ne concordent pas')
  }
  if (verifiesCompletion) {
    return {
      ...task,
      status: 'completed',
      remainingMinutes: 0,
      completedAt: completionGateResult.verifiedAt ?? now,
    }
  }
  if (
    outcome.shouldReduceRemainingMinutes &&
    outcome.verifiedProgressMinutes > 0 &&
    (outcome.outcome === 'partial_progress' || outcome.outcome === 'progress_confirmed')
  ) {
    const currentRemaining = task.remainingMinutes ?? task.estimatedMinutes ?? 1
    return {
      ...task,
      // Zéro signifierait implicitement « terminé » dans plusieurs consommateurs.
      // Sans gate, on conserve donc une minute et un statut actif.
      remainingMinutes: Math.max(1, currentRemaining - outcome.verifiedProgressMinutes),
    }
  }
  return null
}
