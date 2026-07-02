import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExecutionPreviewActions } from './ExecutionPreviewActions'
import type { ExecutionPreviewActionViewModel } from '../../lib/execution-preview-view-model'

describe('ExecutionPreviewActions', () => {
  it('renders disabled dangerous actions', () => {
    const actions: ExecutionPreviewActionViewModel[] = [
      { label: 'Apply', actionType: 'disabled_apply', enabled: false, reason: 'Reason A' },
      { label: 'Start', actionType: 'disabled_start_session', enabled: false, reason: 'Reason B' },
      { label: 'Block', actionType: 'disabled_blocking', enabled: false, reason: 'Reason C' }
    ]
    render(<ExecutionPreviewActions actions={actions} />)
    
    expect(screen.getByText('Apply')).toBeInTheDocument()
    expect(screen.getByText('Start')).toBeInTheDocument()
    expect(screen.getByText('Block')).toBeInTheDocument()
    
    expect(screen.getByText('Apply').closest('button')).toBeDisabled()
    expect(screen.getByText('Start').closest('button')).toBeDisabled()
    expect(screen.getByText('Block').closest('button')).toBeDisabled()
    
    expect(screen.getByText('Reason A')).toBeInTheDocument()
  })
})
