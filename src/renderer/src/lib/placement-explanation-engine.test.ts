import { describe, expect, it } from 'vitest'
import { explainPlacementPlan, explainProposedBlock, explainUnplacedItem } from './placement-explanation-engine'
import type { PlacementPlanV2, ProposedPlacementBlock, UnplacedPlacementItem } from '@shared/placement-model'

describe('placement-explanation-engine', () => {
  it('explains rescue plan with serious, action-oriented tone', () => {
    const plan = {
      mode: 'rescue',
      summary: { unplacedCount: 1, rescueMinutes: 60, deepWorkMinutes: 0 },
      explanation: { title: '', summary: '', reasons: [] }
    } as unknown as PlacementPlanV2

    explainPlacementPlan(plan)
    
    expect(plan.explanation.title).toContain('Sauvetage')
    expect(plan.explanation.summary).toContain('sauver le maximum')
    expect(plan.explanation.reasons.some(r => r.includes('stratégiques'))).toBe(true)
  })

  it('explains block dynamically based on kind and mode', () => {
    const block = {
      kind: 'deep_work',
      placementMode: 'normal',
      reasons: ['Fenêtre utile avant la deadline.']
    } as ProposedPlacementBlock

    const exp = explainProposedBlock(block)
    expect(exp).toContain('Travail profond')
    expect(exp).toContain('deadline')
    
    // Check no humiliating tone
    expect(exp.toLowerCase()).not.toContain('nul')
    expect(exp.toLowerCase()).not.toContain('échoué')
  })

  it('explains unplaced items clearly', () => {
    const item = { reason: 'deadline_impossible' } as UnplacedPlacementItem
    const exp = explainUnplacedItem(item)

    expect(exp).toContain('temps restant ne suffit pas')
  })

  it('explique un plan minimum_viable sans prétendre tout faire', () => {
    const plan = {
      mode: 'minimum_viable',
      summary: { unplacedCount: 2, rescueMinutes: 0, deepWorkMinutes: 0 },
      explanation: { title: '', summary: '', reasons: [] },
    } as unknown as PlacementPlanV2

    explainPlacementPlan(plan)
    // Le titre doit refléter un plan de survie, pas un plan complet.
    expect(plan.explanation.title.toLowerCase()).toContain('sauvetage')
    expect(plan.explanation.reasons.some((r) => r.includes('pas pu être placées'))).toBe(true)
  })

  it('explique un item non placé pour raison sleep_protected', () => {
    const item = { reason: 'sleep_protected' } as UnplacedPlacementItem
    const exp = explainUnplacedItem(item)
    const lowered = exp.toLowerCase()
    // Le message doit évoquer le repos ou la récupération.
    expect(lowered.includes('repos') || lowered.includes('récupération')).toBe(true)
  })

  it('explique une tâche vague comme nécessitant une clarification (ton non humiliant)', () => {
    const item = { reason: 'task_too_vague' } as UnplacedPlacementItem
    const exp = explainUnplacedItem(item)
    expect(exp.toLowerCase()).toContain('clarif')
    // Ton orienté action, jamais humiliant.
    expect(exp.toLowerCase()).not.toContain('nul')
    expect(exp.toLowerCase()).not.toContain('paresseux')
    expect(exp.toLowerCase()).not.toContain('échoué')
  })
})
