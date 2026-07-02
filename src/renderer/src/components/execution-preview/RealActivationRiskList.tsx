import React from 'react'
import { RealActivationRiskReport } from '@shared/real-activation-protocol-model'

export interface RealActivationRiskListProps {
  report: RealActivationRiskReport
}

export const RealActivationRiskList: React.FC<RealActivationRiskListProps> = ({ report }) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-slate-200">Analyse de Sécurité & Risques</h4>
        <span className="text-xs px-2.5 py-0.5 rounded-full bg-red-950/40 text-red-400 border border-red-950/60 font-semibold uppercase">
          Niveau : {report.status}
        </span>
      </div>

      <div className="space-y-2.5">
        {report.risks.map((risk) => (
          <div
            key={risk.id}
            className={`p-3 rounded-lg border text-xs space-y-1.5 ${
              risk.severity === 'critical' || risk.severity === 'high'
                ? 'bg-red-950/10 border-red-900/40 text-red-200'
                : 'bg-slate-950 border-slate-900 text-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[13px]">{risk.message}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded font-bold uppercase ${
                  risk.severity === 'critical'
                    ? 'bg-red-900 text-red-100 animate-pulse'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {risk.severity}
              </span>
            </div>
            <div className="text-[11px] leading-relaxed opacity-90">
              <span className="font-medium text-slate-400">Catégorie : </span>
              <span className="italic">{risk.category}</span>
            </div>
            <div className="text-[11px] leading-relaxed opacity-90 bg-slate-950/40 p-2 rounded">
              <span className="font-medium text-slate-400">Mitigation requise : </span>
              {risk.mitigationRequired}
            </div>
            {risk.blocksActivation && (
              <div className="text-[10px] text-red-400 font-semibold flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                Bloque l&apos;activation réelle par défaut
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
