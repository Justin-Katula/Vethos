import React from 'react'
import { RealActivationProtocolReport } from '@shared/real-activation-protocol-model'
import { guardRealActivationUi } from '../../lib/real-activation-ui-guards'
import { RealActivationBlockedControls } from './RealActivationBlockedControls'
import { RealActivationPermissionMatrix } from './RealActivationPermissionMatrix'
import { RealActivationRiskList } from './RealActivationRiskList'
import { RealActivationBoundarySummary } from './RealActivationBoundarySummary'

export interface RealActivationProtocolPanelProps {
  report: RealActivationProtocolReport
}

export const RealActivationProtocolPanel: React.FC<RealActivationProtocolPanelProps> = ({ report }) => {
  // Enforce UI safety checks before rendering
  try {
    guardRealActivationUi(report)
  } catch (error: any) {
    return (
      <div className="p-6 bg-red-950 border-2 border-red-600 rounded-2xl text-red-100 space-y-4">
        <h3 className="text-xl font-bold">Erreur Critique d&apos;Intégrité</h3>
        <p className="text-sm">
          {error.message || 'Tentative de contournement de la frontière d\'exécution.'}
        </p>
      </div>
    )
  }

  const { explanation, readiness, diagnostics, protocolDraft } = report

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-2xl max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 animate-pulse" />
            {explanation.title}
          </h3>
          <p className="text-xs text-slate-400">{explanation.summary}</p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1.5">
          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
            Mode : Audit seul
          </span>
          <span className="text-[10px] text-slate-500">
            Généré à {new Date(report.createdAt).toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Warnings Banner if any */}
      {explanation.warnings.length > 0 && (
        <div className="p-4 bg-amber-950/20 border border-amber-900/40 text-amber-200 rounded-xl space-y-1.5 text-xs">
          <div className="font-semibold text-amber-400">Avertissements d&apos;Audit :</div>
          <ul className="list-disc pl-4 space-y-0.5 opacity-90">
            {explanation.warnings.map((w, idx) => (
              <li key={idx}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Readiness Report Section */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-slate-200 text-xs">Statut de Préparation (Readiness)</h4>
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-cyan-950/40 text-cyan-400 border border-cyan-900/30">
            {readiness.status === 'draft_only_ready' ? 'Audit prêt' : readiness.status}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
          {readiness.readinessChecks.map((check) => (
            <div key={check.id} className="p-2.5 bg-slate-950/50 border border-slate-900/50 rounded flex items-start gap-2">
              <span className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${
                check.status === 'passed_for_draft' ? 'bg-cyan-500' : 'bg-red-500'
              }`} />
              <div className="space-y-0.5">
                <p className="font-medium text-slate-300">{check.label}</p>
                <p className="text-[10px] text-slate-550 leading-relaxed">{check.reason}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-800/40 flex items-center justify-between">
          <span>Action recommandée : <strong className="text-slate-200">{explanation.nextRecommendedAction}</strong></span>
          <span className="text-[10px] text-cyan-500 bg-cyan-950/20 px-2 py-0.5 rounded border border-cyan-900/20 font-bold uppercase">
            non exécutable maintenant
          </span>
        </div>
      </div>

      {/* Diagnostics Issues if any */}
      {diagnostics.issues.length > 0 && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
          <h4 className="font-semibold text-slate-200 text-xs">Alertes de Diagnostics ({diagnostics.status})</h4>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {diagnostics.issues.map((issue) => (
              <div key={issue.id} className="p-3 bg-slate-955 border border-slate-850 rounded text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-amber-400">{issue.message}</span>
                  <span className="text-[9px] uppercase px-1 rounded bg-slate-800 text-slate-400">
                    {issue.severity}
                  </span>
                </div>
                {issue.suggestion && (
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    <span className="font-semibold">Suggestion :</span> {issue.suggestion}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sub components Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <RealActivationBoundarySummary boundary={protocolDraft.boundary} />
        <RealActivationPermissionMatrix matrix={protocolDraft.permissionMatrix} />
      </div>

      <RealActivationRiskList report={protocolDraft.riskReport} />

      <RealActivationBlockedControls
        blockers={protocolDraft.boundary.blockers}
        allowedNow={{
          callRealManagers: protocolDraft.boundary.allowedNow.callRealManagers,
          writeStores: protocolDraft.boundary.allowedNow.writeStores,
          touchOs: protocolDraft.boundary.allowedNow.touchOs
        }}
      />
    </div>
  )
}
