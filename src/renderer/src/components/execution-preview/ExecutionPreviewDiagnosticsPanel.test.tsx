import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { executionPreviewPlanFixture } from '../../lib/execution-preview-test-fixtures'
import { ExecutionPreviewDiagnosticsPanel } from './ExecutionPreviewDiagnosticsPanel'

describe('ExecutionPreviewDiagnosticsPanel', () => {
  afterEach(cleanup)
  it('renders nothing without structured diagnostics', () => {
    const { container } = render(<ExecutionPreviewDiagnosticsPanel />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders issues and severity', () => {
    render(<ExecutionPreviewDiagnosticsPanel diagnostics={{ status: 'warning', issues: [{ id: 'i1', severity: 'high', message: 'Issue visible' }], summary: ['Résumé'] }} />)
    expect(screen.getByText('Issue visible')).toBeInTheDocument()
    expect(screen.getByText('high')).toBeInTheDocument()
  })

  it('renders pipeline steps, failed/warning counts and confidence', () => {
    const trace = executionPreviewPlanFixture().pipelineTrace
    render(<ExecutionPreviewDiagnosticsPanel pipelineTrace={{ ...trace, failedStepIds: ['f'], warningStepIds: ['w'] }} />)
    expect(screen.getByText('96%')).toBeInTheDocument()
    expect(screen.getAllByText('1')).toHaveLength(2)
    expect(screen.getByText('input_adaptation')).toBeInTheDocument()
  })
})
