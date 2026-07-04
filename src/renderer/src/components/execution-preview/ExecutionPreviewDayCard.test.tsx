import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExecutionPreviewDayCard } from './ExecutionPreviewDayCard'
import type { ExecutionPreviewDayViewModel } from '../../lib/execution-preview-view-model'

describe('ExecutionPreviewDayCard', () => {
  it('renders day summary and empty day message', () => {
    const day: ExecutionPreviewDayViewModel = {
      date: '2025-01-01',
      title: 'Jour 1',
      statusLabel: 'healthy',
      statusSeverity: 'good',
      blocks: [],
      summary: ['S1', 'S2'],
      warnings: ['Day Warn']
    }
    render(<ExecutionPreviewDayCard day={day} />)
    
    expect(screen.getByText('Jour 1')).toBeInTheDocument()
    expect(screen.getByText('healthy')).toBeInTheDocument()
    expect(screen.getByText('S1')).toBeInTheDocument()
    expect(screen.getByText('S2')).toBeInTheDocument()
    expect(screen.getByText('Day Warn')).toBeInTheDocument()
    expect(screen.getByText(/Aucun bloc planifié pour cette journée./i)).toBeInTheDocument()
  })

  it.each(['Mode secours', 'Examen manuel requis', 'Fragmentée'])('renders the structured special status %s', (statusLabel) => {
    const day: ExecutionPreviewDayViewModel = {
      date: '2025-01-01', title: 'Jour spécial', statusLabel, statusSeverity: 'warning',
      blocks: [], summary: ['Proposé : 0 min'], warnings: [],
    }
    render(<ExecutionPreviewDayCard day={day} />)
    expect(screen.getByText(statusLabel)).toBeInTheDocument()
  })
})
