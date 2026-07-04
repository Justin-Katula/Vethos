import { describe, it, expect } from 'vitest'
import { runExecutionPreviewCalibration } from './execution-preview-calibration-engine'
import { ExecutionPreviewMappingAudit } from '@shared/execution-preview-qa-model'

describe('execution-preview-calibration-engine', () => {
  const baseMappingAudit = {
    status: 'healthy',
    tasks: { sourceCount: 1, mappedCount: 1, ignoredCount: 0, invalidCount: 0, warnings: [] },
    objectives: { sourceCount: 1, mappedCount: 1, ignoredCount: 0, invalidCount: 0, warnings: [] },
    planning: { hasScheduleData: true, hasUsableTimeWindows: true, fixedBlocksCount: 0, warnings: [] },
    appsAndSites: { sourceAppsCount: 0, sourceSitesCount: 0, mappedRestrictionsCount: 0, warnings: [] },
    confidence: 100,
  } as unknown as ExecutionPreviewMappingAudit

  it('returns unsafe for critical consistency', () => {
    const report = runExecutionPreviewCalibration({
      mappingAudit: { ...baseMappingAudit },
      consistency: { status: 'critical', checks: [], summary: [], confidence: 100 }
    })

    expect(report.status).toBe('unsafe')
    expect(report.recommendations.some(r => r.nextAction === 'do_not_activate')).toBe(true)
  })

  it('retourne calibrated quand tout est sain et cohérent', () => {
    const report = runExecutionPreviewCalibration({
      mappingAudit: { ...baseMappingAudit },
      consistency: { status: 'consistent', checks: [], summary: [], confidence: 100 },
      providerState: { status: 'ready', errors: [], warnings: [], canGeneratePreview: false, canApplyPreview: false, confidence: 100 },
    })
    expect(report.status).toBe('calibrated')
    expect(report.recommendations).toHaveLength(0)
  })

  it('retourne needs_major_adjustment quand le mapping est weak avec tâches non mappées', () => {
    const report = runExecutionPreviewCalibration({
      mappingAudit: {
        ...baseMappingAudit,
        status: 'weak',
        tasks: { sourceCount: 5, mappedCount: 0, ignoredCount: 0, invalidCount: 0, warnings: [] },
      },
      consistency: { status: 'consistent', checks: [], summary: [], confidence: 100 },
    })
    expect(report.status).toBe('needs_major_adjustment')
    expect(report.recommendations.some(r => r.nextAction === 'adjust_mapping')).toBe(true)
  })

  it('retourne needs_minor_adjustment pour une recommandation non-critique (provider partial)', () => {
    const report = runExecutionPreviewCalibration({
      mappingAudit: { ...baseMappingAudit },
      consistency: { status: 'consistent', checks: [], summary: [], confidence: 100 },
      providerState: { status: 'partial', errors: [], warnings: [], canGeneratePreview: false, canApplyPreview: false, confidence: 80 },
    })
    expect(report.recommendations.some(r => r.nextAction === 'manual_review')).toBe(true)
    expect(['needs_minor_adjustment', 'needs_major_adjustment']).toContain(report.status)
  })

  it('retourne not_enough_data quand il n\'y a ni schedule ni tâches source', () => {
    const report = runExecutionPreviewCalibration({
      mappingAudit: {
        ...baseMappingAudit,
        planning: { hasScheduleData: false, hasUsableTimeWindows: false, fixedBlocksCount: 0, warnings: [] },
        tasks: { sourceCount: 0, mappedCount: 0, ignoredCount: 0, invalidCount: 0, warnings: [] },
      },
      consistency: { status: 'consistent', checks: [], summary: [], confidence: 100 },
    })
    expect(report.status).toBe('not_enough_data')
  })
})
