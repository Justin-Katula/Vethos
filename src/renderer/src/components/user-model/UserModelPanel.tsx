import { useMemo } from 'react'
import { useUserModelStore } from '@/store/user-model.store'
import { explainUserModel } from '@/lib/user-model-explanation'
import { runUserModelDiagnostics } from '@/lib/user-model-diagnostics'
import { DEFAULT_USER_MODEL_FLAGS } from '@shared/user-model-flags'

export function UserModelPanel(): JSX.Element | null {
  const model = useUserModelStore((state) => state.model)
  const explanations = useMemo(() => model ? explainUserModel(model) : [], [model])
  const diagnostics = useMemo(() => model ? runUserModelDiagnostics(model) : null, [model])
  if (!DEFAULT_USER_MODEL_FLAGS.userModelEnabled || !DEFAULT_USER_MODEL_FLAGS.userModelExplanationsEnabled) return null
  return (
    <section className="max-w-4xl space-y-3 border-t border-border-subtle pt-8">
      <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted">Développeur : modèle utilisateur</h2>
      <div className="info-panel rounded-lg p-6">
        {!model ? <p className="text-sm text-text-muted">Le modèle utilisateur n’est pas encore disponible.</p> : <>
          <div className="flex flex-wrap gap-3 text-xs text-text-muted">
            <span>Confiance globale : {model.metadata.confidence}%</span>
            <span>Diagnostic : {diagnostics?.status}</span>
            <span>{model.behaviorEvents.length} signaux</span>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {explanations.slice(0, 12).map((item, index) => <article key={`${item.targetType}:${item.targetId ?? index}`} className="rounded-lg border border-border-subtle bg-bg-base p-4">
              <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-medium text-text-primary">{item.title}</h3><span className="text-xs text-text-muted">{item.confidence}%</span></div>
              <p className="mt-2 text-xs text-text-secondary">{item.summary}</p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-text-muted">{item.reasons.slice(0,3).map((reason) => <li key={reason}>{reason}</li>)}</ul>
            </article>)}
          </div>
          {diagnostics && diagnostics.issues.length > 0 && <div className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4"><h3 className="text-sm font-medium text-amber-200">Diagnostics</h3><ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-text-muted">{diagnostics.issues.slice(0,8).map((issue) => <li key={issue.id}>{issue.message}</li>)}</ul></div>}
        </>}
      </div>
    </section>
  )
}
