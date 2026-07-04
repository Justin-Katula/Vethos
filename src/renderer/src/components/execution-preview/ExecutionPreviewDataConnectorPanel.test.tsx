import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useExecutionPreviewDataProvider } from '../../hooks/useExecutionPreviewDataProvider'
import { executionPreviewPlanFixture } from '../../lib/execution-preview-test-fixtures'
import { ExecutionPreviewDataConnectorPanel } from './ExecutionPreviewDataConnectorPanel'

vi.mock('../../hooks/useExecutionPreviewDataProvider', () => ({ useExecutionPreviewDataProvider: vi.fn() }))

function hookState(overrides: Record<string, unknown> = {}) {
  return {
    state: { status: 'idle', warnings: [], errors: [], canGeneratePreview: true, canApplyPreview: false, confidence: 100, ...overrides },
    generatePreview: vi.fn(), clearPreview: vi.fn(), canGeneratePreview: true, canApplyPreview: false as const,
  }
}

describe('ExecutionPreviewDataConnectorPanel', () => {
  afterEach(cleanup)
  beforeEach(() => vi.mocked(useExecutionPreviewDataProvider).mockReturnValue(hookState() as never))

  it('renders the manual generate button and empty state', () => {
    const value = hookState()
    vi.mocked(useExecutionPreviewDataProvider).mockReturnValue(value as never)
    render(<ExecutionPreviewDataConnectorPanel />)
    expect(screen.getByText(/Cliquez sur « Générer l’aperçu V2 »/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Générer l’aperçu V2/i }))
    expect(value.generatePreview).toHaveBeenCalledOnce()
  })

  it('renders building state and disables generation', () => {
    vi.mocked(useExecutionPreviewDataProvider).mockReturnValue(hookState({ status: 'building' }) as never)
    render(<ExecutionPreviewDataConnectorPanel />)
    expect(screen.getByRole('button', { name: /Générer l’aperçu V2/i })).toBeDisabled()
  })

  it('renders a generated preview', () => {
    vi.mocked(useExecutionPreviewDataProvider).mockReturnValue(hookState({ status: 'ready', previewPlan: executionPreviewPlanFixture() }) as never)
    render(<ExecutionPreviewDataConnectorPanel />)
    expect(screen.getByText('Preview V2')).toBeInTheDocument()
  })

  it('renders controlled errors', () => {
    vi.mocked(useExecutionPreviewDataProvider).mockReturnValue(hookState({ status: 'failed', errors: ['Erreur contrôlée'], confidence: 0 }) as never)
    render(<ExecutionPreviewDataConnectorPanel />)
    expect(screen.getByText('Échec de la génération')).toBeInTheDocument()
    expect(screen.getByText('Erreur contrôlée')).toBeInTheDocument()
  })

  it('renders partial warnings', () => {
    vi.mocked(useExecutionPreviewDataProvider).mockReturnValue(hookState({ status: 'partial', warnings: ['Données partielles'], previewPlan: executionPreviewPlanFixture({ status: 'partial_preview' }) }) as never)
    render(<ExecutionPreviewDataConnectorPanel />)
    expect(screen.getByText('Données partielles')).toBeInTheDocument()
  })

  it('keeps apply, start and blocking controls structurally disabled', () => {
    vi.mocked(useExecutionPreviewDataProvider).mockReturnValue(hookState({ status: 'ready', previewPlan: executionPreviewPlanFixture() }) as never)
    render(<ExecutionPreviewDataConnectorPanel />)
    for (const name of ['Appliquer le plan', 'Démarrer une session', 'Activer le blocage']) {
      expect(screen.getByRole('button', { name })).toBeDisabled()
    }
  })
})
