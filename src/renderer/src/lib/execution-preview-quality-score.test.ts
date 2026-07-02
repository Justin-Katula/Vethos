import { describe, it, expect } from 'vitest'
import { calculateExecutionPreviewQualityScore } from './execution-preview-quality-score'
import { ExecutionPreviewMappingAudit, ExecutionPreviewConsistencyReport, ExecutionPreviewCalibrationReport } from '@shared/execution-preview-qa-model'

describe('execution-preview-quality-score', () => {
  it('deducts points for warnings and avoids NaNs', () => {
    const score = calculateExecutionPreviewQualityScore({
      mappingAudit: { status: 'healthy', planning: { warnings: ['warning 1'] } } as unknown as ExecutionPreviewMappingAudit,
      consistency: { status: 'consistent' } as ExecutionPreviewConsistencyReport,
      calibration: { status: 'calibrated' } as ExecutionPreviewCalibrationReport,
      previewPlan: {
        safety: { status: 'safe' }
      } as any
    })
    
    expect(score.planning).toBeLessThan(100)
    expect(score.overall).toBeLessThan(100)
    expect(isNaN(score.overall)).toBe(false)
  })

  it('drops safety to 0 if unsafe', () => {
    const score = calculateExecutionPreviewQualityScore({
      mappingAudit: { status: 'healthy', planning: { warnings: [] } } as unknown as ExecutionPreviewMappingAudit,
      consistency: { status: 'consistent' } as ExecutionPreviewConsistencyReport,
      calibration: { status: 'unsafe' } as ExecutionPreviewCalibrationReport
    })
    
    expect(score.safety).toBe(0)
    expect(score.status).toBe('unsafe')
  })
})
