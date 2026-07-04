import React from 'react'

interface ActivationContractSummaryProps {
  cards: Array<{
    label: string
    value: string
    severity: 'neutral' | 'good' | 'warning' | 'critical'
  }>
}

export const ActivationContractSummary: React.FC<ActivationContractSummaryProps> = ({ cards }) => {
  return (
    <div className="grid grid-cols-2 gap-4">
      {cards.map((card, idx) => (
        <div key={idx} className={`p-3 rounded border ${
          card.severity === 'critical' ? 'bg-red-900/20 border-red-800/50' :
          card.severity === 'warning' ? 'bg-yellow-900/20 border-yellow-800/50' :
          card.severity === 'good' ? 'bg-green-900/20 border-green-800/50' :
          'bg-gray-800 border-gray-700'
        }`}>
          <div className="text-xs text-gray-500 mb-1">{card.label}</div>
          <div className={`font-medium ${
            card.severity === 'critical' ? 'text-red-400' :
            card.severity === 'warning' ? 'text-yellow-400' :
            card.severity === 'good' ? 'text-green-400' :
            'text-gray-300'
          }`}>{card.value}</div>
        </div>
      ))}
    </div>
  )
}

interface ActivationPreconditionListProps {
  preconditions: Array<{
    id: string
    label: string
    statusLabel: string
    reason: string
    severity: 'neutral' | 'good' | 'warning' | 'critical'
  }>
}

export const ActivationPreconditionList: React.FC<ActivationPreconditionListProps> = ({ preconditions }) => {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-gray-400">Checklist des Préconditions Théoriques</h3>
      <div className="space-y-2">
        {preconditions.map(p => (
          <div key={p.id} className="p-3 bg-gray-800/50 border border-gray-700 rounded flex items-start justify-between">
            <div className="pr-4">
              <div className="text-sm font-medium text-gray-300">{p.label}</div>
              <div className="text-xs text-gray-500 mt-1">{p.reason}</div>
            </div>
            <div className={`text-xs px-2 py-1 rounded shrink-0 ${
              p.severity === 'good' ? 'bg-green-900/30 text-green-400' :
              p.severity === 'warning' ? 'bg-yellow-900/30 text-yellow-400' :
              p.severity === 'critical' ? 'bg-red-900/30 text-red-400' :
              'bg-gray-700 text-gray-300'
            }`}>
              {p.statusLabel}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

interface ActivationBlockedActionsProps {
  actions: Array<{
    id: string
    label: string
    statusLabel: string
    reason: string
    canExecuteNow: false
  }>
}

export const ActivationBlockedActions: React.FC<ActivationBlockedActionsProps> = ({ actions }) => {
  if (actions.length === 0) return null

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-gray-400">Actions Futures Interdites (Read-Only)</h3>
      <div className="space-y-2">
        {actions.map(a => (
          <div key={a.id} className="p-3 bg-gray-800/50 border border-dashed border-gray-600 rounded">
            <div className="flex justify-between items-start">
              <div className="text-sm text-gray-300">{a.label}</div>
              <div className="text-xs bg-gray-700 text-gray-400 px-2 py-1 rounded shrink-0 ml-2">
                {a.statusLabel}
              </div>
            </div>
            <div className="text-xs text-gray-500 mt-2 font-mono">
              Raisons: {a.reason}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
