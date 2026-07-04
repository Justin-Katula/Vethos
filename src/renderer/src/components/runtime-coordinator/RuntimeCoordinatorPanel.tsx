import { useRuntimeCoordinatorStore } from '@/store/runtime-coordinator.store'
import type { RuntimeCoordinatorPlanV2 } from '@shared/runtime-coordinator-model'

const MODE_LABELS: Record<RuntimeCoordinatorPlanV2['mode'], string> = {
  inactive: 'Inactif',
  ready_for_preview: 'Prêt pour prévisualisation',
  manual_review_required: 'Revue manuelle requise',
  unsafe: 'Dangereux',
  low_confidence: 'Confiance faible',
}

const MODE_TONE: Record<RuntimeCoordinatorPlanV2['mode'], string> = {
  inactive: 'text-text-muted',
  ready_for_preview: 'text-emerald-300',
  manual_review_required: 'text-amber-300',
  unsafe: 'text-red-400',
  low_confidence: 'text-amber-300',
}

const SAFETY_TONE: Record<RuntimeCoordinatorPlanV2['safety']['status'], string> = {
  safe: 'text-emerald-300',
  warning: 'text-amber-300',
  unsafe: 'text-orange-400',
  critical: 'text-red-400',
}

function TargetList({ label, items }: { label: string; items: string[] }): JSX.Element | null {
  if (items.length === 0) return null
  return (
    <div>
      <p className="text-xs font-medium text-text-muted">{label} ({items.length})</p>
      <ul className="mt-1 flex flex-wrap gap-1">
        {items.slice(0, 12).map((item) => (
          <li key={item} className="rounded bg-bg-base px-1.5 py-0.5 text-xs text-text-secondary">{item}</li>
        ))}
      </ul>
    </div>
  )
}

export function RuntimeCoordinatorPanel(): JSX.Element | null {
  const plan = useRuntimeCoordinatorStore((state) => state.currentPlan)

  return (
    <section className="max-w-4xl space-y-3 border-t border-border-subtle pt-8">
      <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted">
        Développeur : coordination runtime V2 (protection)
      </h2>
      <div className="info-panel rounded-lg p-6">
        {!plan ? (
          <p className="text-sm text-text-muted">
            Aucun plan de coordination runtime actif. Démarre un bloc de travail pour générer le plan
            de protection V2.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-3 text-xs text-text-muted">
              <span>Mode : <span className={MODE_TONE[plan.mode]}>{MODE_LABELS[plan.mode]}</span></span>
              <span>Confiance : {plan.confidence}%</span>
              <span>Safety : <span className={SAFETY_TONE[plan.safety.status]}>{plan.safety.status}</span></span>
              <span>Diagnostics : {plan.diagnostics?.status ?? '—'}</span>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {/* Blocking profile draft */}
              <article className="rounded-lg border border-border-subtle bg-bg-base p-4">
                <h3 className="text-sm font-medium text-text-primary">Profil de blocage ({plan.blockingProfileDraft.mode})</h3>
                <p className="mt-1 text-xs text-text-muted">Unlock policy : {plan.blockingProfileDraft.unlockPolicy}</p>
                <div className="mt-3 space-y-2">
                  <TargetList label="Apps autorisées" items={plan.blockingProfileDraft.apps.allow} />
                  <TargetList label="Apps bloquées" items={plan.blockingProfileDraft.apps.block} />
                  <TargetList label="Apps surveillées" items={plan.blockingProfileDraft.apps.monitorOnly} />
                  <TargetList label="Sites autorisés" items={plan.blockingProfileDraft.sites.allow} />
                  <TargetList label="Sites bloqués" items={plan.blockingProfileDraft.sites.block} />
                </div>
                {plan.blockingProfileDraft.warnings.length > 0 && (
                  <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-amber-300">
                    {plan.blockingProfileDraft.warnings.slice(0, 4).map((w) => <li key={w}>{w}</li>)}
                  </ul>
                )}
              </article>

              {/* Safety */}
              <article className="rounded-lg border border-border-subtle bg-bg-base p-4">
                <h3 className="text-sm font-medium text-text-primary">Sécurité</h3>
                <p className="mt-1 text-xs text-text-muted">
                  Intégration interdite détectée : {plan.safety.forbiddenIntegrationDetected ? 'oui' : 'non'}
                </p>
                {plan.safety.doNotTouchFiles.length > 0 && (
                  <p className="mt-2 text-xs text-text-muted">Fichiers protégés : {plan.safety.doNotTouchFiles.length}</p>
                )}
                {plan.safety.riskyTargets.length > 0 && (
                  <TargetList label="Cibles risquées" items={plan.safety.riskyTargets} />
                )}
                {plan.safety.warnings.length > 0 && (
                  <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-amber-300">
                    {plan.safety.warnings.slice(0, 4).map((w) => <li key={w}>{w}</li>)}
                  </ul>
                )}
              </article>

              {/* Recovery (Point 9.10) */}
              <article className="rounded-lg border border-border-subtle bg-bg-base p-4">
                <h3 className="text-sm font-medium text-text-primary">Récupération système</h3>
                <p className="mt-1 text-xs text-text-muted">
                  Requis : {plan.recovery.required ? 'oui' : 'non'} · Stratégie : {plan.recovery.rollbackStrategy}
                </p>
                {plan.recovery.rulesToRestore.length > 0 && (
                  <TargetList label="Règles à restaurer" items={plan.recovery.rulesToRestore} />
                )}
                {plan.recovery.warnings.length > 0 && (
                  <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-amber-300">
                    {plan.recovery.warnings.slice(0, 4).map((w) => <li key={w}>{w}</li>)}
                  </ul>
                )}
              </article>
            </div>

            {/* Explanation */}
            <div className="mt-5 rounded-lg border border-border-subtle bg-bg-base p-4">
              <h3 className="text-sm font-medium text-text-primary">{plan.explanation.title}</h3>
              <p className="mt-1 text-xs text-text-secondary">{plan.explanation.summary}</p>
              {plan.explanation.reasons.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-text-muted">
                  {plan.explanation.reasons.slice(0, 5).map((r) => <li key={r}>{r}</li>)}
                </ul>
              )}
            </div>

            {/* Diagnostics */}
            {plan.diagnostics && plan.diagnostics.issues.length > 0 && (
              <div className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                <h3 className="text-sm font-medium text-amber-200">Diagnostics</h3>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-text-muted">
                  {plan.diagnostics.issues.slice(0, 8).map((issue) => (
                    <li key={issue.id}>
                      <span className="text-amber-300">[{issue.severity}]</span> {issue.message}
                      {issue.suggestion ? ` — ${issue.suggestion}` : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
