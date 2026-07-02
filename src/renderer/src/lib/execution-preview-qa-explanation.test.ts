import { describe, it, expect } from 'vitest'
import { explainExecutionPreviewQaReport } from './execution-preview-qa-explanation'
import { ExecutionPreviewQaReport } from '@shared/execution-preview-qa-model'

describe('execution-preview-qa-explanation', () => {
  it('explains a healthy report', () => {
    const explanation = explainExecutionPreviewQaReport({
      qualityScore: { status: 'excellent', reasons: [] },
      mappingAudit: { 
        tasks: { sourceCount: 1, mappedCount: 1, warnings: [] },
        objectives: { sourceCount: 0, mappedCount: 0, warnings: [] },
        planning: { warnings: [] },
        appsAndSites: { warnings: [] }
      }
    } as unknown as ExecutionPreviewQaReport)
    
    expect(explanation.title).toContain('Preview cohérente')
    expect(explanation.nextRecommendedAction).toBe('keep_debug_only')
  })

  it('explains an unsafe report', () => {
    const explanation = explainExecutionPreviewQaReport({
      qualityScore: { status: 'unsafe', reasons: [] },
      mappingAudit: { 
        tasks: { sourceCount: 1, mappedCount: 1, warnings: [] },
        objectives: { sourceCount: 0, mappedCount: 0, warnings: [] },
        planning: { warnings: [] },
        appsAndSites: { warnings: [] }
      }
    } as unknown as ExecutionPreviewQaReport)
    
    expect(explanation.title).toContain('dangereuse')
    expect(explanation.nextRecommendedAction).toBe('do_not_activate')
  })
})
