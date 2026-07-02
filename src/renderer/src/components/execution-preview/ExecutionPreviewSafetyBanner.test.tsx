import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExecutionPreviewSafetyBanner } from './ExecutionPreviewSafetyBanner'

describe('ExecutionPreviewSafetyBanner', () => {
  it('renders safe status', () => {
    render(<ExecutionPreviewSafetyBanner status="safe" reasons={[]} />)
    expect(screen.getByText(/Ce plan est sûr/i)).toBeInTheDocument()
  })

  it('renders warning status', () => {
    render(<ExecutionPreviewSafetyBanner status="warning" reasons={['Reason W']} />)
    expect(screen.getByText('Avertissement de sécurité')).toBeInTheDocument()
    expect(screen.getByText('Reason W')).toBeInTheDocument()
  })

  it('renders unsafe status and warning message', () => {
    render(<ExecutionPreviewSafetyBanner status="unsafe" reasons={['Reason U']} />)
    expect(screen.getByText('Preview non sécurisée (Rejetée)')).toBeInTheDocument()
    expect(screen.getByText('Ce plan ne doit en aucun cas être appliqué.')).toBeInTheDocument()
  })
})
