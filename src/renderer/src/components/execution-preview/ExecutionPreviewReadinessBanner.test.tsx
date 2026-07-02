import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExecutionPreviewReadinessBanner } from './ExecutionPreviewReadinessBanner'

describe('ExecutionPreviewReadinessBanner', () => {
  it('renders ready', () => {
    render(<ExecutionPreviewReadinessBanner status="ready" />)
    expect(screen.getByText('Preview complète')).toBeInTheDocument()
  })
  it('renders partial', () => {
    render(<ExecutionPreviewReadinessBanner status="partial" />)
    expect(screen.getByText('Preview partielle')).toBeInTheDocument()
  })
  it('renders manual_review', () => {
    render(<ExecutionPreviewReadinessBanner status="manual_review" />)
    expect(screen.getByText('Examen manuel requis')).toBeInTheDocument()
  })
  it('renders unsafe', () => {
    render(<ExecutionPreviewReadinessBanner status="unsafe" />)
    expect(screen.getByText('Preview non sécurisée')).toBeInTheDocument()
  })
  it('renders null for empty', () => {
    const { container } = render(<ExecutionPreviewReadinessBanner status="empty" />)
    expect(container.firstChild).toBeNull()
  })
})
