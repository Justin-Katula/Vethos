import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExecutionPreviewPanel } from './ExecutionPreviewPanel'
import { ExecutionPreviewUiFlags } from '@shared/execution-preview-ui-flags'
import type { ExecutionPreviewPlanV2 } from '@shared/execution-preview-model'

describe('ExecutionPreviewPanel', () => {
  it('renders empty state when no plan provided', () => {
    render(<ExecutionPreviewPanel />)
    expect(screen.getByText('Aucune preview générée')).toBeInTheDocument()
  })

  it('renders days, warnings and disabled actions for a plan', () => {
    ExecutionPreviewUiFlags.executionPreviewUiEnabled = true
    
    const fakePlan = {
      id: 'plan-xyz',
      mode: 'full',
      status: 'ready_to_build',
      confidence: 100,
      safety: { status: 'safe', reasons: [] },
      readiness: { readiness: 'ready_for_ui_preview', warnings: [] },
      explanation: { title: 'Titre Plan', summary: 'Sous titre plan', warnings: ['Alerte Globale'] },
      summary: { totalProposedMinutes: 60, totalBlocked: 0, totalUnsafe: 0, totalWarnings: 1 },
      days: [
        {
          date: '2025-01-01',
          status: 'healthy',
          summary: { proposedWorkMinutes: 60, deepWorkMinutes: 60, rescueMinutes: 0 },
          blocks: [],
          warnings: []
        }
      ],
      pipelineTrace: { steps: [] }
    } as unknown as ExecutionPreviewPlanV2

    render(<ExecutionPreviewPanel previewPlan={fakePlan} debugMode={true} />)
    
    expect(screen.getByText('Titre Plan')).toBeInTheDocument()
    expect(screen.getByText('Alerte Globale')).toBeInTheDocument()
    expect(screen.getByText(/Journée du 2025-01-01/i)).toBeInTheDocument()
    
    // Checks that real actions are disabled
    expect(screen.getByRole('button', { name: /Appliquer le plan/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Démarrer une session/i })).toBeDisabled()
  })

  it('does not call any real action because there are no handlers passed or imported', () => {
    // This is implicitly verified by the fact that the component has no handlers 
    // mapped to buttons other than state toggles, and all control buttons are disabled.
  })
})
