import React from 'react'
import { MinimalExecutionBoundaryV2 } from '@shared/real-activation-protocol-model'

export interface RealActivationBoundarySummaryProps {
  boundary: MinimalExecutionBoundaryV2
}

export const RealActivationBoundarySummary: React.FC<RealActivationBoundarySummaryProps> = ({ boundary }) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-slate-200">Frontière Minimale d&apos;Exécution</h4>
        <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-medium">
          Défini pour l&apos;audit uniquement
        </span>
      </div>

      <div className="text-xs text-slate-350 leading-relaxed">
        Voici la liste des modules d&apos;adaptation physique configurés pour les étapes futures (Point 17+). Ils sont inaccessibles dans la build actuelle (Point 16).
      </div>

      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
        {boundary.futureBoundaryCandidates.map((candidate) => (
          <div
            key={candidate.id}
            className="p-3 rounded-lg bg-slate-950 border border-slate-900 space-y-2 text-xs"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200">{candidate.name}</span>
              <span className="text-[10px] text-amber-500 font-medium bg-amber-950/20 px-1.5 py-0.5 rounded border border-amber-900/30">
                Point {candidate.futurePointEarliest}+
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
              <div>
                <span className="text-[10px] uppercase text-slate-500 block">Module Cible</span>
                {candidate.targetModuleKind}
              </div>
              {candidate.targetFunctionName && (
                <div>
                  <span className="text-[10px] uppercase text-slate-500 block">Fonction Cible</span>
                  <code>{candidate.targetFunctionName}</code>
                </div>
              )}
            </div>

            {candidate.requiredPreconditions.length > 0 && (
              <div className="text-[11px] text-slate-400">
                <span className="text-[10px] uppercase text-slate-500 block mb-0.5">Prérequis futurs</span>
                <div className="flex flex-wrap gap-1">
                  {candidate.requiredPreconditions.map((p, i) => (
                    <span key={i} className="bg-slate-905 px-1.5 py-0.5 rounded text-slate-300 text-[10px] border border-slate-800">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-1 flex items-center justify-between border-t border-slate-900/60 text-[10px]">
              <span className="text-slate-500">Niveau de risque : <span className="font-semibold text-slate-400">{candidate.riskLevel}</span></span>
              <span className="text-red-400 font-medium">Non exécutable maintenant</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
