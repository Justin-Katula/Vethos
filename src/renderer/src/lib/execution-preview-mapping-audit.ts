import { ExecutionPreviewMappingAudit } from '@shared/execution-preview-qa-model'
import type { ExecutionPreviewQaInputSummary } from '@shared/execution-preview-data-connector-model'
import { ExecutionPreviewPlanV2 } from '@shared/execution-preview-model'

export type MappingAuditInput = {
  qaInputSummary?: ExecutionPreviewQaInputSummary
  previewPlan?: ExecutionPreviewPlanV2
}

export function runExecutionPreviewMappingAudit(
  input: MappingAuditInput
): ExecutionPreviewMappingAudit {
  const { qaInputSummary, previewPlan } = input

  const audit: ExecutionPreviewMappingAudit = {
    status: 'healthy',
    tasks: {
      sourceCount: qaInputSummary?.sourceCounts.tasks ?? 0,
      mappedCount: 0,
      ignoredCount: 0,
      invalidCount: 0,
      warnings: [],
    },
    objectives: {
      sourceCount: qaInputSummary?.sourceCounts.objectives ?? 0,
      mappedCount: 0,
      ignoredCount: 0,
      invalidCount: 0,
      warnings: [],
    },
    planning: {
      hasScheduleData: (qaInputSummary?.sourceCounts.schedules ?? 0) > 0,
      hasUsableTimeWindows: false,
      fixedBlocksCount: 0,
      warnings: [],
    },
    appsAndSites: {
      sourceAppsCount: qaInputSummary?.sourceCounts.apps ?? 0,
      sourceSitesCount: qaInputSummary?.sourceCounts.sites ?? 0,
      mappedRestrictionsCount: 0,
      warnings: [],
    },
    confidence: qaInputSummary?.confidence ?? 0,
  }

  if (previewPlan) {
    const tasksInPlan = new Set<string>()
    previewPlan.days.forEach(day => {
      day.blocks.forEach(block => {
        if (block.targetType === 'task') tasksInPlan.add(block.targetId)
      })
    })

    audit.tasks.mappedCount = tasksInPlan.size
    if (audit.tasks.sourceCount > 0 && audit.tasks.mappedCount === 0) {
      audit.tasks.warnings.push('Tâches sources présentes mais aucune tâche mappée dans les blocs')
    }

    if (audit.tasks.mappedCount > audit.tasks.sourceCount) {
       audit.tasks.warnings.push('Plus de tâches mappées que de tâches sources (duplications possibles)')
    }

    audit.planning.fixedBlocksCount = previewPlan.days.reduce((acc, day) => acc + day.blocks.length, 0)
    audit.planning.hasUsableTimeWindows = audit.planning.fixedBlocksCount > 0
    
    if (audit.planning.hasScheduleData && !audit.planning.hasUsableTimeWindows) {
      audit.planning.warnings.push('Planning présent mais aucune fenêtre exploitable')
    }
  } else {
    audit.planning.warnings.push('Preview plan absent')
  }

  if (
    audit.tasks.warnings.length > 0 ||
    audit.planning.warnings.length > 0 ||
    audit.appsAndSites.warnings.length > 0
  ) {
    audit.status = 'partial'
  }
  
  if (!qaInputSummary) {
     audit.status = 'invalid'
  }

  return audit
}
