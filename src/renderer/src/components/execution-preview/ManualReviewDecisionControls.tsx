import React from 'react'
import { ManualReviewDecisionKind } from '@shared/manual-review-gate-model'

interface ManualReviewSummaryCardProps {
  cards: Array<{
    label: string
    value: string
    severity: 'neutral' | 'good' | 'warning' | 'critical'
  }>
}

export const ManualReviewSummaryCard: React.FC<ManualReviewSummaryCardProps> = ({ cards }) => {
  return (
    <div className="space-y-4">
      {cards.map((card, idx) => (
        <div key={idx} className={`p-4 rounded-lg border ${
          card.severity === 'critical' ? 'bg-red-900/20 border-red-800/50' :
          card.severity === 'warning' ? 'bg-yellow-900/20 border-yellow-800/50' :
          card.severity === 'good' ? 'bg-green-900/20 border-green-800/50' :
          'bg-gray-800 border-gray-700'
        }`}>
          <h3 className={`text-sm font-medium ${
            card.severity === 'critical' ? 'text-red-400' :
            card.severity === 'warning' ? 'text-yellow-400' :
            card.severity === 'good' ? 'text-green-400' :
            'text-gray-400'
          }`}>{card.label}</h3>
          <p className="mt-1 text-sm text-gray-300">{card.value}</p>
        </div>
      ))}
    </div>
  )
}

interface ManualReviewDecisionControlsProps {
  actions: Array<{
    label: string
    actionType: ManualReviewDecisionKind
    targetType: 'preview' | 'day' | 'block' | 'qa' | 'safety' | 'readiness'
    enabled: boolean
    reason: string
  }>
  onDecision: (kind: ManualReviewDecisionKind, targetType: 'preview' | 'block' | 'day') => void
}

export const ManualReviewDecisionControls: React.FC<ManualReviewDecisionControlsProps> = ({ actions, onDecision }) => {
  return (
    <div className="space-y-3">
      {actions.map((action, idx) => {
        const isApprove = action.actionType === 'approve_preview_in_principle'
        const isReject = action.actionType === 'reject_preview'
        const isClear = action.actionType === 'clear_local_review'
        
        return (
          <div key={idx} className="group relative">
            <button
              disabled={!action.enabled}
              onClick={() => action.targetType === 'preview' ? onDecision(action.actionType, 'preview') : null}
              className={`w-full py-2.5 px-4 rounded-md text-sm font-medium transition-colors ${
                !action.enabled ? 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700' :
                isApprove ? 'bg-green-600 hover:bg-green-700 text-white' :
                isReject ? 'bg-red-600 hover:bg-red-700 text-white' :
                isClear ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' :
                'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {action.label}
            </button>
            {!action.enabled && action.reason && (
              <div className="absolute hidden group-hover:block bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-xs text-gray-300 rounded shadow-lg whitespace-nowrap z-10">
                {action.reason}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

interface ManualReviewBlockReviewListProps {
  blocks: Array<{
    blockId: string
    title: string
    timeLabel: string
    decisionLabel: string
    decisionSeverity: 'neutral' | 'good' | 'warning' | 'critical'
  }>
  onDecision: (kind: ManualReviewDecisionKind, targetType: 'block', targetId: string) => void
}

export const ManualReviewBlockReviewList: React.FC<ManualReviewBlockReviewListProps> = ({ blocks, onDecision }) => {
  if (blocks.length === 0) {
    return <div className="text-gray-500 text-sm italic">Aucun bloc à examiner.</div>
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-gray-400">Examen détaillé des blocs</h3>
      <div className="space-y-2">
        {blocks.map((block) => (
          <div key={block.blockId} className="flex items-center justify-between p-3 bg-gray-900/50 border border-gray-700 rounded-lg">
            <div>
              <div className="text-sm font-medium text-gray-200">{block.title}</div>
              <div className="text-xs text-gray-500">{block.timeLabel}</div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs px-2 py-1 rounded-full ${
                block.decisionSeverity === 'good' ? 'bg-green-900/30 text-green-400' :
                block.decisionSeverity === 'warning' ? 'bg-yellow-900/30 text-yellow-400' :
                block.decisionSeverity === 'critical' ? 'bg-red-900/30 text-red-400' :
                'text-gray-500'
              }`}>
                {block.decisionLabel}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => onDecision('mark_block_accepted', 'block', block.blockId)}
                  className="p-1 hover:bg-green-900/30 text-gray-500 hover:text-green-400 rounded transition-colors"
                  title="Marquer comme acceptable"
                >
                  ✓
                </button>
                <button
                  onClick={() => onDecision('mark_block_needs_review', 'block', block.blockId)}
                  className="p-1 hover:bg-yellow-900/30 text-gray-500 hover:text-yellow-400 rounded transition-colors"
                  title="Marquer à revoir"
                >
                  ?
                </button>
                <button
                  onClick={() => onDecision('mark_block_rejected', 'block', block.blockId)}
                  className="p-1 hover:bg-red-900/30 text-gray-500 hover:text-red-400 rounded transition-colors"
                  title="Rejeter"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
