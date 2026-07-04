import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ExecutionPreviewDataConnectorPanel } from './ExecutionPreviewDataConnectorPanel'
import { useExecutionPreviewDataProvider } from '../../hooks/useExecutionPreviewDataProvider'

// Mock le hook
vi.mock('../../hooks/useExecutionPreviewDataProvider', () => ({
  useExecutionPreviewDataProvider: vi.fn()
}))

describe('ExecutionPreviewDataConnectorPanel', () => {
  it('renders idle state initially', () => {
    const mockGenerate = vi.fn()
    vi.mocked(useExecutionPreviewDataProvider).mockReturnValue({
      state: {
        status: 'idle',
        warnings: [],
        errors: [],
        canGeneratePreview: true,
        canApplyPreview: false,
        confidence: 100
      },
      generatePreview: mockGenerate,
      clearPreview: vi.fn(),
      canGeneratePreview: true,
      canApplyPreview: false
    })

    render(<ExecutionPreviewDataConnectorPanel />)
    expect(screen.getByText(/Cliquez sur « Générer l’aperçu V2 » pour lire l'état actuel/i)).toBeInTheDocument()
    
    const btn = screen.getByRole('button', { name: /Générer l’aperçu V2/i })
    expect(btn).toBeInTheDocument()
    
    fireEvent.click(btn)
    expect(mockGenerate).toHaveBeenCalled()
  })

  it('renders failure errors', () => {
    vi.mocked(useExecutionPreviewDataProvider).mockReturnValue({
      state: {
        status: 'failed',
        warnings: [],
        errors: ['Erreur de connexion test'],
        canGeneratePreview: true,
        canApplyPreview: false,
        confidence: 0
      },
      generatePreview: vi.fn(),
      clearPreview: vi.fn(),
      canGeneratePreview: true,
      canApplyPreview: false
    })

    render(<ExecutionPreviewDataConnectorPanel />)
    expect(screen.getByText('Échec de la génération')).toBeInTheDocument()
    expect(screen.getByText('Erreur de connexion test')).toBeInTheDocument()
  })
})
