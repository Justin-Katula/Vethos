import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExecutionPreviewBlockCard } from './ExecutionPreviewBlockCard'
import type { ExecutionPreviewBlockViewModel } from '../../lib/execution-preview-view-model'

describe('ExecutionPreviewBlockCard', () => {
  it('renders time, duration, kind, protection and readiness', () => {
    const block: ExecutionPreviewBlockViewModel = {
      id: 'b1',
      title: 'Titre',
      timeLabel: '10:00 - 11:00',
      durationLabel: '60 min',
      kindLabel: 'Focus',
      modeLabel: 'Strict',
      protectionLabel: 'Max',
      readinessLabel: 'ready',
      readinessSeverity: 'good',
      reasons: ['Reason A'],
      warnings: ['Warn B'],
      confidenceLabel: '100%'
    }
    render(<ExecutionPreviewBlockCard block={block} />)
    
    expect(screen.getByText('Titre')).toBeInTheDocument()
    expect(screen.getByText(/10:00 - 11:00/)).toBeInTheDocument()
    expect(screen.getByText(/60 min/)).toBeInTheDocument()
    expect(screen.getByText(/Focus/)).toBeInTheDocument()
    expect(screen.getByText(/Max/)).toBeInTheDocument()
    expect(screen.getByText('ready')).toBeInTheDocument()
    expect(screen.getByText('Reason A')).toBeInTheDocument()
    expect(screen.getByText('Warn B')).toBeInTheDocument()
    
    // Assure that we don't have start or block buttons
    expect(screen.queryByRole('button', { name: /start/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /apply/i })).not.toBeInTheDocument()
  })
})
