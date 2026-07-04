import {
  ExecutionPreviewCalibrationReport,
  ExecutionPreviewConsistencyReport,
  ExecutionPreviewMappingAudit,
  ExecutionPreviewQaCheck
} from '@shared/execution-preview-qa-model'
import { ExecutionPreviewProviderState } from '@shared/execution-preview-data-connector-model'

export type CalibrationEngineInput = {
  mappingAudit: ExecutionPreviewMappingAudit
  consistency: ExecutionPreviewConsistencyReport
  providerState?: ExecutionPreviewProviderState
}

export function runExecutionPreviewCalibration(
  input: CalibrationEngineInput
): ExecutionPreviewCalibrationReport {
  const { mappingAudit, consistency, providerState } = input
  const findings: ExecutionPreviewQaCheck[] = []
  const recommendations: ExecutionPreviewCalibrationReport['recommendations'] = []
  
  if (consistency.status === 'critical') {
    recommendations.push({
      id: 'rec-1',
      priority: 'critical',
      title: 'Do Not Activate',
      description: 'Critical consistency errors found in the preview generation.',
      nextAction: 'do_not_activate'
    })
  } else if (providerState?.status === 'unsafe' || providerState?.status === 'failed') {
    recommendations.push({
      id: 'rec-2',
      priority: 'critical',
      title: 'Do Not Activate',
      description: 'Provider state is unsafe or failed.',
      nextAction: 'do_not_activate'
    })
  } else if (providerState?.status === 'partial') {
    recommendations.push({
      id: 'rec-3',
      priority: 'high',
      title: 'Manual Review Needed',
      description: 'Preview is partial or requires manual review.',
      nextAction: 'manual_review'
    })
  }

  if (mappingAudit.status === 'invalid' || mappingAudit.status === 'weak') {
    if (mappingAudit.tasks.sourceCount > 0 && mappingAudit.tasks.mappedCount === 0) {
      recommendations.push({
        id: 'rec-4',
        priority: 'high',
        title: 'Improve Preview Builder',
        description: 'Source tasks exist but none were mapped into blocks. Preview builder might be failing.',
        nextAction: 'adjust_mapping'
      })
    }
  }

  if (mappingAudit.planning.hasScheduleData === false) {
    recommendations.push({
      id: 'rec-5',
      priority: 'medium',
      title: 'Improve Input Data',
      description: 'No schedule data was found. Improve real schedule data to get better previews.',
      nextAction: 'improve_input_data'
    })
  }

  let status: ExecutionPreviewCalibrationReport['status'] = 'calibrated'
  if (recommendations.some(r => r.priority === 'critical')) {
    status = 'unsafe'
  } else if (recommendations.some(r => r.nextAction === 'adjust_mapping')) {
    status = 'needs_major_adjustment'
  } else if (recommendations.some(r => r.nextAction === 'improve_input_data' && mappingAudit.tasks.sourceCount === 0)) {
    status = 'not_enough_data'
  } else if (recommendations.length > 0) {
    status = 'needs_minor_adjustment'
  }

  return {
    status,
    findings,
    recommendations,
    confidence: providerState?.confidence ?? 100
  }
}
