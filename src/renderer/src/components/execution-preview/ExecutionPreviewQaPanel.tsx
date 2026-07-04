import React, { useState } from 'react'
import { ExecutionPreviewQaReport } from '@shared/execution-preview-qa-model'

export type ExecutionPreviewQaPanelProps = {
  qaReport?: ExecutionPreviewQaReport
  debug?: boolean
}

export function ExecutionPreviewQaPanel({ qaReport, debug }: ExecutionPreviewQaPanelProps) {
  const [showDetails, setShowDetails] = useState(false)

  if (!qaReport) {
    return (
      <div className="p-4 border border-gray-700 bg-gray-900 rounded text-gray-400">
        Aucun rapport QA disponible. (Générez d'abord une preview)
      </div>
    )
  }

  const {
    qualityScore,
    mappingAudit,
    calibration,
    explanation,
    blockers,
    warnings,
    diagnostics
  } = qaReport

  return (
    <div className="p-4 border border-blue-900 bg-gray-900 rounded text-sm text-gray-200 flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-blue-300">
          QA & Calibration Report
        </h3>
        <div className={`px-2 py-1 rounded text-xs font-bold uppercase
          ${qualityScore.status === 'excellent' ? 'bg-green-900 text-green-300' :
            qualityScore.status === 'unsafe' ? 'bg-red-900 text-red-300' :
            'bg-yellow-900 text-yellow-300'}`}>
          {qualityScore.status} ({Math.round(qualityScore.overall)}/100)
        </div>
      </div>

      <div className="bg-gray-800 p-3 rounded">
        <h4 className="font-semibold text-white mb-1">{explanation.title}</h4>
        <p className="text-gray-300">{explanation.summary}</p>
        {explanation.keyFindings.length > 0 && (
          <ul className="list-disc list-inside mt-2 text-gray-400">
            {explanation.keyFindings.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-800 p-3 rounded">
          <h4 className="font-semibold text-white mb-2">Scores par Catégorie</h4>
          <div className="flex justify-between"><span>Mapping:</span> <span>{qualityScore.dataMapping}</span></div>
          <div className="flex justify-between"><span>Planning:</span> <span>{qualityScore.planning}</span></div>
          <div className="flex justify-between"><span>Placement:</span> <span>{qualityScore.placement}</span></div>
          <div className="flex justify-between"><span>Session:</span> <span>{qualityScore.session}</span></div>
          <div className="flex justify-between"><span>Safety:</span> <span>{qualityScore.safety}</span></div>
        </div>

        <div className="bg-gray-800 p-3 rounded">
          <h4 className="font-semibold text-white mb-2">Mapping Audit</h4>
          <div className="flex justify-between"><span>Tâches Mappées:</span> <span>{mappingAudit.tasks.mappedCount} / {mappingAudit.tasks.sourceCount}</span></div>
          <div className="flex justify-between"><span>Objectifs Mappés:</span> <span>{mappingAudit.objectives.mappedCount} / {mappingAudit.objectives.sourceCount}</span></div>
          <div className="flex justify-between"><span>Planning Présent:</span> <span>{mappingAudit.planning.hasScheduleData ? 'Oui' : 'Non'}</span></div>
        </div>
      </div>

      {calibration.recommendations.length > 0 && (
        <div className="bg-gray-800 p-3 rounded border border-orange-900">
          <h4 className="font-semibold text-orange-400 mb-2">Recommandations</h4>
          <ul className="flex flex-col gap-2">
            {calibration.recommendations.map(r => (
              <li key={r.id} className="text-gray-300 text-xs">
                <span className="font-bold text-white mr-1">{r.title}:</span>
                {r.description}
                <span className="ml-2 px-1 rounded bg-gray-700 text-gray-400">{r.nextAction}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {blockers.length > 0 && (
        <div className="bg-red-900/50 p-3 rounded border border-red-900">
          <h4 className="font-semibold text-red-400 mb-2">Blockers</h4>
          <ul className="list-disc list-inside text-red-200">
            {blockers.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        </div>
      )}
      
      {warnings.length > 0 && (
        <div className="bg-yellow-900/20 p-3 rounded border border-yellow-900/50">
          <h4 className="font-semibold text-yellow-500 mb-2">Warnings</h4>
          <ul className="list-disc list-inside text-yellow-200">
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {debug && (
        <div className="mt-2">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-blue-400 hover:text-blue-300 text-xs underline"
          >
            {showDetails ? 'Masquer' : 'Afficher'} détails Diagnostics
          </button>
          
          {showDetails && (
            <div className="mt-2 bg-black p-3 rounded text-xs font-mono text-gray-400 whitespace-pre-wrap overflow-auto max-h-48 border border-gray-800">
              {diagnostics.issues.length > 0 
                ? diagnostics.issues.map(i => `[${i.severity.toUpperCase()}] ${i.message}`).join('\n')
                : 'Aucun problème de diagnostic.'}
            </div>
          )}
        </div>
      )}
      
      {/* 
        NO ACTION BUTTONS PERMITTED. 
        canProceedToActivationPlanning is strictly false in QA. 
      */}
    </div>
  )
}
