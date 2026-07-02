import { describe, it, expect } from 'vitest'
import { runExecutionPreviewMappingAudit } from './execution-preview-mapping-audit'

describe('execution-preview-mapping-audit', () => {
  it('detects unmapped tasks', () => {
    const audit = runExecutionPreviewMappingAudit({
      qaInputSummary: {
        sourceCounts: { tasks: 5, objectives: 0, schedules: 0, sessions: 0, apps: 0, sites: 0 },
        sanitizedCounts: { tasks: 5, objectives: 0, schedules: 0, sessions: 0, apps: 0, sites: 0 },
        dataWarnings: [],
        pipelineWarnings: [],
        pipelineErrors: [],
        confidence: 100
      },
      previewPlan: {
        id: '1',
        days: [{ date: '2026-06-26', blocks: [] }],
        safety: { status: 'safe', warnings: [], errors: [], confidence: 100 },
        totals: { totalProposedMinutes: 0 },
        canApplyLater: false
      }
    })
    
    expect(audit.tasks.mappedCount).toBe(0)
    expect(audit.tasks.warnings.length).toBeGreaterThan(0)
    expect(audit.status).toBe('partial')
  })

  it('handles missing structures without crashing', () => {
    const audit = runExecutionPreviewMappingAudit({})
    expect(audit.status).toBe('invalid')
  })
})
