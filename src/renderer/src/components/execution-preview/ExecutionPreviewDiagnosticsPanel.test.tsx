import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExecutionPreviewDiagnosticsPanel } from './ExecutionPreviewDiagnosticsPanel'

describe('ExecutionPreviewDiagnosticsPanel', () => {
  it('renders when debug info is provided', () => {
    render(<ExecutionPreviewDiagnosticsPanel debug={{ planId: '123', confidence: 95, pipelineSteps: [] }} diagnosticsSummary={['Test diag']} />)
    expect(screen.getByText('123')).toBeInTheDocument()
    expect(screen.getByText('95%')).toBeInTheDocument()
    expect(screen.getByText('Test diag')).toBeInTheDocument()
  })

  it('renders null when debug is undefined', () => {
    const { container } = render(<ExecutionPreviewDiagnosticsPanel debug={undefined} diagnosticsSummary={[]} />)
    expect(container.firstChild).toBeNull()
  })
})
