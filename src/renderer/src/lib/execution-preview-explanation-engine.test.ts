import { describe, it, expect } from 'vitest'
import { explainExecutionPreviewPlan } from './execution-preview-explanation-engine'

describe('execution-preview-explanation-engine', () => {
  const basePlan = {
    readiness: { readiness: 'ready_for_ui_preview' },
    safety: { status: 'safe' },
    summary: { rescueMinutes: 0, totalProposedMinutes: 60 },
    confidence: 100
  } as any

  it('explains a normal preview', () => {
    const expl = explainExecutionPreviewPlan(basePlan)
    expect(expl.nextRecommendedAction).toBe('show_ui_preview')
    expect(expl.summary).toContain('preview of the upcoming sessions')
  })

  it('explains a rescue preview', () => {
    const expl = explainExecutionPreviewPlan({
      ...basePlan,
      summary: { ...basePlan.summary, rescueMinutes: 30 }
    })
    expect(expl.nextRecommendedAction).toBe('show_ui_preview')
    expect(expl.summary).toContain('rescue modes')
  })

  it('explains a partial preview', () => {
    const expl = explainExecutionPreviewPlan({
      ...basePlan,
      readiness: { readiness: 'partial_preview_only' }
    })
    expect(expl.nextRecommendedAction).toBe('fix_inputs_first')
    expect(expl.summary).toContain('incomplete')
  })

  it('explains an unsafe preview', () => {
    const expl = explainExecutionPreviewPlan({
      ...basePlan,
      safety: { status: 'critical' }
    })
    expect(expl.nextRecommendedAction).toBe('do_not_apply')
    expect(expl.summary).toContain('unsafe')
  })
})
