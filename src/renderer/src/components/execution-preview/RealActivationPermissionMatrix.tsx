import React from 'react'
import { RealActivationPermissionMatrix as MatrixModel } from '@shared/real-activation-protocol-model'

export interface RealActivationPermissionMatrixProps {
  matrix: MatrixModel
}

export const RealActivationPermissionMatrix: React.FC<RealActivationPermissionMatrixProps> = ({ matrix }) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-slate-200">Matrice des Permissions Systèmes</h4>
        <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-950/40 text-amber-400 border border-amber-900/50">
          Statut : {matrix.status === 'draft_only' ? 'Audit uniquement' : matrix.status}
        </span>
      </div>

      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
        {matrix.permissions.map((perm) => (
          <div
            key={perm.id}
            className="p-3 rounded-lg bg-slate-950 border border-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-300">{perm.label}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 uppercase">
                  {perm.category}
                </span>
                {perm.requiredForFutureActivation && (
                  <span className="text-[10px] text-amber-500 font-semibold">Requis futur</span>
                )}
              </div>
              <p className="text-slate-400 leading-relaxed text-[11px]">{perm.reason}</p>
            </div>
            
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              <div className="text-[11px] px-2 py-0.5 rounded bg-red-950/20 text-red-400 border border-red-900/40 font-medium">
                Futur requis, non demandé maintenant
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
