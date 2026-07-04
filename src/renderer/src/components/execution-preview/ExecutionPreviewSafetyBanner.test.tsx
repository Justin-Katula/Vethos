import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ExecutionPreviewSafetyBanner } from './ExecutionPreviewSafetyBanner'

describe('ExecutionPreviewSafetyBanner', () => {
  afterEach(cleanup)
  it('renders safe', () => { render(<ExecutionPreviewSafetyBanner status="safe" reasons={[]} />); expect(screen.getByText(/lecture seule/i)).toBeInTheDocument() })
  it('renders warning details', () => { render(<ExecutionPreviewSafetyBanner status="warning" reasons={['raison']} warnings={['alerte']} />); expect(screen.getByText('raison')).toBeInTheDocument(); expect(screen.getByText('alerte')).toBeInTheDocument() })
  it.each(['unsafe', 'critical'] as const)('blocks %s without bypass', (status) => {
    render(<ExecutionPreviewSafetyBanner status={status} reasons={['danger']} />)
    expect(screen.getByText('Cette preview ne doit pas être appliquée.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
