import { describe, expect, it } from 'vitest'
import { buildExecutionPreviewEmptyState, type EmptyStateReason } from './execution-preview-empty-state'

describe('buildExecutionPreviewEmptyState', () => {
  it.each([
    ['no_preview_built', 'Aucune preview générée'],
    ['missing_planning_context', 'Contexte de planning manquant'],
    ['missing_placement_plan', 'Plan de placement manquant'],
    ['missing_session_plans', 'Plans de session manquants'],
    ['unsafe_preview', 'Preview non sécurisée'],
    ['manual_review_required', 'Examen manuel requis'],
    ['invalid_date_range', 'Période invalide'],
  ] as Array<[EmptyStateReason, string]>)('maps %s from its structured reason', (reason, title) => {
    const state = buildExecutionPreviewEmptyState(reason)
    expect(state.title).toBe(title)
    expect(state.description.length).toBeGreaterThan(10)
  })
})
