import React from 'react'

export interface RealActivationBlockedControlsProps {
  blockers: string[]
  allowedNow: {
    callRealManagers: boolean
    writeStores: boolean
    touchOs: boolean
  }
}

export const RealActivationBlockedControls: React.FC<RealActivationBlockedControlsProps> = ({
  blockers,
  allowedNow
}) => {
  return (
    <div className="p-4 rounded-xl border border-red-950 bg-red-950/20 text-red-200 space-y-3 shadow-inner">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
        <h4 className="font-semibold text-red-300">Contrôles Système Bloqués</h4>
      </div>
      
      <p className="text-sm opacity-90">
        En mode &ldquo;audit uniquement&rdquo;, tous les accès physiques et OS sont neutralisés de force.
      </p>

      {blockers.length > 0 && (
        <div className="space-y-1 text-xs bg-red-950/40 p-2.5 rounded border border-red-900/50">
          <p className="font-medium text-red-400">Raisons du blocage automatique :</p>
          <ul className="list-disc pl-4 space-y-0.5">
            {blockers.map((b, idx) => (
              <li key={idx}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
        <div className="p-2 rounded bg-red-950/30 border border-red-900/30 flex items-center justify-between">
          <span>Manager d&apos;exécution</span>
          <span className="px-1.5 py-0.5 rounded bg-red-900/60 font-semibold uppercase tracking-wider text-[10px]">
            {allowedNow.callRealManagers ? 'Autorisé (Erreur)' : 'Bloqué'}
          </span>
        </div>
        <div className="p-2 rounded bg-red-950/30 border border-red-900/30 flex items-center justify-between">
          <span>Écriture Stores</span>
          <span className="px-1.5 py-0.5 rounded bg-red-900/60 font-semibold uppercase tracking-wider text-[10px]">
            {allowedNow.writeStores ? 'Autorisé (Erreur)' : 'Bloqué'}
          </span>
        </div>
        <div className="p-2 rounded bg-red-950/30 border border-red-900/30 flex items-center justify-between">
          <span>Accès Système (OS)</span>
          <span className="px-1.5 py-0.5 rounded bg-red-900/60 font-semibold uppercase tracking-wider text-[10px]">
            {allowedNow.touchOs ? 'Autorisé (Erreur)' : 'Bloqué'}
          </span>
        </div>
      </div>

      <div className="text-[11px] opacity-75 italic">
        * Aucune demande de permission système ou modification de fichier n&apos;est exécutable maintenant.
      </div>
    </div>
  )
}
