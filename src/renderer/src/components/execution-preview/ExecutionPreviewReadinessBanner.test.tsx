import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ExecutionPreviewReadinessBanner } from './ExecutionPreviewReadinessBanner'

describe('ExecutionPreviewReadinessBanner', () => {
  afterEach(cleanup)
  it.each([
    ['ready_for_debug_preview', 'Prête pour la preview de debug'],
    ['ready_for_ui_preview', 'Prête pour la preview UI'],
    ['partial_preview_only', 'Preview partielle seulement'],
    ['manual_review_required', 'Examen manuel requis'],
    ['blocked', 'Preview bloquée'],
    ['unsafe', 'Preview non sécurisée'],
  ] as const)('renders %s', (status, label) => {
    render(<ExecutionPreviewReadinessBanner status={status} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('renders structured blockers and warnings', () => {
    render(<ExecutionPreviewReadinessBanner status="partial_preview_only" blockers={['blocage']} warnings={['alerte']} />)
    expect(screen.getByText('blocage')).toBeInTheDocument()
    expect(screen.getByText('alerte')).toBeInTheDocument()
  })
})
