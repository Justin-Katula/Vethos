import { describe, it, expect } from 'vitest'
import { buildExecutionPreviewEmptyState } from './execution-preview-empty-state'

describe('execution-preview-empty-state', () => {
  it('returns correctly formatted empty state for no_preview_built', () => {
    const state = buildExecutionPreviewEmptyState('no_preview_built')
    expect(state.title).toBe('Aucune preview générée')
    expect(state.icon).toBe('info')
  })

  it('returns correctly formatted empty state for missing_planning_context', () => {
    const state = buildExecutionPreviewEmptyState('missing_planning_context')
    expect(state.title).toBe('Contexte de planning manquant')
    expect(state.icon).toBe('warning')
  })

  it('returns correctly formatted empty state for unsafe_preview', () => {
    const state = buildExecutionPreviewEmptyState('unsafe_preview')
    expect(state.title).toBe('Preview bloquée (Sécurité)')
    expect(state.icon).toBe('error')
  })
})
