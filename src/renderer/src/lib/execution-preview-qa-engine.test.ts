import { describe, it, expect } from 'vitest'
import { runExecutionPreviewQa } from './execution-preview-qa-engine'

describe('execution-preview-qa-engine', () => {
  it('generates a full QA report without mutating inputs', () => {
    const input = {
      providerState: { 
        status: 'ready', 
        confidence: 100,
        qaInputSummary: {
          sourceCounts: { tasks: 1, objectives: 1, schedules: 1, sessions: 1, apps: 1, sites: 1 },
          sanitizedCounts: { tasks: 1, objectives: 1, schedules: 1, sessions: 1, apps: 1, sites: 1 },
          dataWarnings: [],
          pipelineWarnings: [],
          pipelineErrors: [],
          confidence: 100
        }
      } as any,
      previewPlan: {
        id: '123',
        safety: { status: 'safe', warnings: [], errors: [], confidence: 100 },
        totals: { totalProposedMinutes: 60 },
        days: []
      } as any,
      now: '2026-06-26T00:00:00Z',
      idFactory: () => 'test-id'
    }

    const report = runExecutionPreviewQa(input)

    expect(report.id).toBe('test-id')
    expect(report.metadata.createdAt).toBe('2026-06-26T00:00:00Z')
    expect(report.canProceedToActivationPlanning).toBe(false)
    expect(report.explanation).toBeDefined()
    expect(report.diagnostics).toBeDefined()
  })
})
