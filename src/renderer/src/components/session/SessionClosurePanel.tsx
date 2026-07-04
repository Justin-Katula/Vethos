import { useMemo, useState } from 'react'
import { CheckCircle2, ShieldCheck } from 'lucide-react'
import type { SessionClosureResponse } from '@/lib/session-outcome-engine'
import { buildSessionOutcomeV2 } from '@/lib/session-outcome-engine'
import { buildCompletionGateResult } from '@/lib/completion-gate-engine'
import { sessionFlags } from '@shared/session-flags'
import { useSessionV2Store } from '@/store/session-v2.store'
import { useTasksStore } from '@/store/tasks.store'
import { useLevelsStore } from '@/store/levels.store'
import { useSettingsStore } from '@/store/settings.store'
import { useUserModelStore } from '@/store/user-model.store'
import { useToastStore } from '@/store/toast.store'
import { Button } from '@/components/ui/Button'

export function SessionClosurePanel() {
  const records = useSessionV2Store((state) => state.records)
  const tasks = useTasksStore((state) => state.tasks)
  const objectives = useLevelsStore((state) => state.objectives)
  const settings = useSettingsStore()
  const userModel = useUserModelStore((state) => state.model)
  const pending = useMemo(() => [...records].reverse().find((record) =>
    Boolean(record.integrity && record.plan.closure.required && !record.outcome),
  ), [records])
  const [selected, setSelected] = useState<NonNullable<SessionClosureResponse['selectedOutcome']>>('partial_progress')
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)

  if (!pending || !sessionFlags.sessionControlsDisplay) return null
  const allowed = pending.plan.closure.allowedOutcomes.filter((outcome): outcome is NonNullable<SessionClosureResponse['selectedOutcome']> => outcome !== 'verified_completed')

  const submit = async () => {
    if (!pending.integrity || busy) return
    setBusy(true)
    try {
      const wordCount = answer.trim().split(/\s+/u).filter(Boolean).length
      let specificityScore = Math.min(100, wordCount * 9 + (answer.length >= 40 ? 15 : 0))
      const task = pending.plan.linkedTaskId ? tasks.find((candidate) => candidate.id === pending.plan.linkedTaskId) : undefined
      const objective = task?.linkedObjectiveId
        ? objectives.find((candidate) => candidate.id === task.linkedObjectiveId) ?? null
        : null
      const completionGateResult = selected === 'claimed_completed' && task
        ? buildCompletionGateResult({
            task,
            objective,
            contract: {
              taskId: task.id,
              outcomeKind: 'unknown',
              expectedOutcome: pending.plan.contract.expectedOutcome ?? pending.plan.contract.purpose,
              acceptanceCriteria: pending.plan.contract.completionCriteria,
              createdAt: pending.plan.metadata.createdAt,
            },
            claim: {
              userClaimedCompleted: true,
              progressClaim: 'completed',
              summary: answer,
              claimedAt: new Date().toISOString(),
            },
            session: {
              sessionId: pending.plan.id,
              durationMinutes: pending.integrity.activeDurationMinutes,
              plannedMinutes: pending.integrity.plannedDurationMinutes,
              usefulActivityMinutes: pending.integrity.usefulActivityMinutes,
              idleMinutes: pending.integrity.idleMinutes,
              distractingAttempts: pending.integrity.distractionAttemptCount,
              unlockRequests: pending.integrity.unlockRequestCount,
              earlyStop: !pending.integrity.sessionCompleted,
              endedNormally: pending.integrity.sessionCompleted,
              strictMode: pending.plan.protection.mode === 'strict_allowlist',
            },
            userModel,
            settings,
            now: new Date(),
          })
        : undefined
      if (completionGateResult) specificityScore = completionGateResult.completionSpecificityScore
      const outcome = buildSessionOutcomeV2({
        sessionPlan: pending.plan,
        integrityResult: pending.integrity,
        closureResponse: { selectedOutcome: selected, answerText: answer, specificityScore },
        completionGateResult,
        userModel,
      })
      await useSessionV2Store.getState().recordOutcome(pending.plan.id, outcome)
      if (sessionFlags.sessionControlsCompletion && pending.plan.linkedTaskId) {
        await useTasksStore.getState().applyVerifiedSessionOutcome(
          pending.plan.linkedTaskId,
          outcome,
          completionGateResult,
        )
      }
      useToastStore.getState().push({
        variant: outcome.completionAccepted ? 'success' : 'info',
        title: outcome.completionAccepted ? 'Complétion vérifiée' : 'Clôture enregistrée',
        description: outcome.reasons[0] ?? outcome.warnings[0] ?? 'Le bilan de la session a été enregistré.',
      })
      setAnswer('')
      setSelected('partial_progress')
    } catch (error) {
      useToastStore.getState().push({
        variant: 'error',
        title: 'Clôture non enregistrée',
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-2xl rounded-xl border border-accent/30 bg-bg-elevated p-5 shadow-2xl">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 text-accent" size={20} />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-wider text-accent">Clôture de session</div>
          <h2 className="mt-1 text-lg font-semibold text-text-primary">{pending.plan.title}</h2>
          <p className="mt-1 text-sm text-text-secondary">{pending.plan.closure.questions[0]}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {allowed.map((outcome) => (
          <button
            key={outcome}
            type="button"
            onClick={() => setSelected(outcome)}
            className={`rounded-lg border px-3 py-2 text-xs ${selected === outcome ? 'border-accent bg-accent/10 text-accent' : 'border-border-subtle text-text-secondary'}`}
          >
            {outcomeLabel(outcome)}
          </button>
        ))}
      </div>
      <textarea
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        placeholder="Décris le résultat concret et la preuve disponible. « J’ai fini » seul ne suffit pas."
        className="mt-4 min-h-24 w-full rounded-lg border border-border-subtle bg-bg-base p-3 text-sm text-text-primary outline-none focus:border-accent"
      />
      <div className="mt-3 flex items-center justify-between gap-4">
        <p className="text-xs text-text-muted">Intégrité {pending.integrity?.integrityScore ?? 0}/100 · la session terminée ne termine pas automatiquement la tâche.</p>
        <Button type="button" onClick={() => void submit()} disabled={busy || (pending.plan.closure.requiresSpecificAnswer && answer.trim().length < 12)}>
          <CheckCircle2 size={15} /> Valider le bilan
        </Button>
      </div>
    </aside>
  )
}

function outcomeLabel(outcome: NonNullable<SessionClosureResponse['selectedOutcome']>): string {
  if (outcome === 'no_progress') return 'Aucun progrès'
  if (outcome === 'partial_progress') return 'Progrès partiel'
  if (outcome === 'confirmed_progress') return 'Progrès confirmé'
  return 'Complétion revendiquée'
}
