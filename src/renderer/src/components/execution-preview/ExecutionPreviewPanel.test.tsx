import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { executionPreviewPlanFixture } from '../../lib/execution-preview-test-fixtures'
import { ExecutionPreviewPanel } from './ExecutionPreviewPanel'

describe('ExecutionPreviewPanel', () => {
  afterEach(cleanup)
  it('renders an empty state without a plan', () => {
    render(<ExecutionPreviewPanel />)
    expect(screen.getByText('Aucune preview générée')).toBeInTheDocument()
  })

  it('selects an empty state through structured uiData', () => {
    render(<ExecutionPreviewPanel uiData={{ emptyStateReason: 'missing_placement_plan' }} />)
    expect(screen.getByText('Plan de placement manquant')).toBeInTheDocument()
  })

  it('renders complete days, warnings, banners, summaries and disabled actions', () => {
    const base = executionPreviewPlanFixture()
    render(<ExecutionPreviewPanel previewPlan={executionPreviewPlanFixture({
      explanation: { ...base.explanation, warnings: ['Alerte globale'] },
      summary: { ...base.summary, totalWarnings: 1 },
    })} />)
    expect(screen.getByText('Preview V2')).toBeInTheDocument()
    expect(screen.getByText('Journée du 2026-07-03')).toBeInTheDocument()
    expect(screen.getByText('Alerte globale')).toBeInTheDocument()
    for (const name of ['Appliquer le plan', 'Démarrer une session', 'Activer le blocage']) {
      expect(screen.getByRole('button', { name })).toBeDisabled()
    }
  })

  it('renders partial and manual-review previews', () => {
    const base = executionPreviewPlanFixture()
    const { rerender } = render(<ExecutionPreviewPanel previewPlan={executionPreviewPlanFixture({ status: 'partial_preview', readiness: { ...base.readiness, readiness: 'partial_preview_only' } })} />)
    expect(screen.getByText('Preview partielle seulement')).toBeInTheDocument()
    rerender(<ExecutionPreviewPanel previewPlan={executionPreviewPlanFixture({ mode: 'manual_review_required', status: 'manual_review_required', readiness: { ...base.readiness, readiness: 'manual_review_required' } })} />)
    expect(screen.getAllByText('Examen manuel requis').length).toBeGreaterThan(0)
  })

  it('renders unsafe without enabling actions', () => {
    const base = executionPreviewPlanFixture()
    render(<ExecutionPreviewPanel previewPlan={executionPreviewPlanFixture({ mode: 'unsafe', readiness: { ...base.readiness, readiness: 'unsafe' }, safety: { ...base.safety, status: 'critical', reasons: ['Risque critique'] } })} />)
    expect(screen.getAllByText('Preview non sécurisée').length).toBeGreaterThan(0)
    expect(screen.getByText('Risque critique')).toBeInTheDocument()
    expect(screen.getAllByRole('button').every((button) => button.hasAttribute('disabled'))).toBe(true)
  })

  it('hides diagnostics by default and shows them only with debug=true', () => {
    const plan = executionPreviewPlanFixture()
    const { rerender } = render(<ExecutionPreviewPanel previewPlan={plan} />)
    expect(screen.queryByText('Diagnostics / Pipeline Trace')).not.toBeInTheDocument()
    rerender(<ExecutionPreviewPanel previewPlan={plan} debug />)
    expect(screen.getByText('Diagnostics / Pipeline Trace')).toBeInTheDocument()
  })

  it('blocks rendering when uiData contains a real handler', () => {
    render(<ExecutionPreviewPanel previewPlan={executionPreviewPlanFixture()} uiData={{ onApply: () => undefined }} />)
    expect(screen.getByText('Gardes de sécurité échouées :')).toBeInTheDocument()
  })
})
