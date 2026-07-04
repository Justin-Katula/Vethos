import { describe, it, expect } from 'vitest'
import { runExecutionPreviewCalibration } from './execution-preview-calibration-engine'
import { ExecutionPreviewMappingAudit } from '@shared/execution-preview-qa-model'

describe('execution-preview-calibration-engine', () => {
  it('returns unsafe for critical consistency', () => {
    const report = runExecutionPreviewCalibration({
      mappingAudit: { status: 'healthy', planning: { hasScheduleData: true } } as unknown as ExecutionPreviewMappingAudit,
      consistency: { status: 'critical', checks: [], summary: [], confidence: 100 }
    })
    
    expect(report.status).toBe('unsafe')
    expect(report.recommendations.some(r => r.nextAction === 'do_not_activate')).toBe(true)
  })
})
