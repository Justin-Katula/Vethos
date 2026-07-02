import type { PlacementPlanV2, PlacementDiagnostics, PlacementDiagnosticIssue } from '@shared/placement-model'
import type { AnyPlanningContextV2 } from './placement-window-selector'

export function runPlacementDiagnostics(plan: PlacementPlanV2, planningContext: AnyPlanningContextV2): PlacementDiagnostics {
  const issues: PlacementDiagnosticIssue[] = []
  
  let status: 'healthy' | 'warning' | 'critical' = 'healthy'
  
  const addIssue = (severity: 'low' | 'medium' | 'high' | 'critical', message: string, targetId?: string) => {
    issues.push({ id: `diag-${Date.now()}-${issues.length}`, severity, message, targetId })
    if (severity === 'critical') status = 'critical'
    else if (severity === 'high' || severity === 'medium') {
      if (status !== 'critical') status = 'warning'
    }
  }

  // 1. Calculate usable total
  const totalUsableMinutes = planningContext.usableFreeWindows.reduce((acc, w) => acc + w.usableDurationMinutes, 0)
  if (plan.summary.totalProposedMinutes > totalUsableMinutes) {
    addIssue('critical', 'Le total des minutes proposées dépasse le temps libre utilisable.')
  }

  // 2. Check each block
  for (const [i, block] of plan.proposedBlocks.entries()) {
    
    if (block.durationMinutes <= 0) {
      addIssue('critical', `Bloc ${block.id} a une durée <= 0.`, block.id)
    }

    if (block.start < plan.dateRange.startDate || block.end > plan.dateRange.endDate) {
      // Very naive string comparison for now.
      addIssue('medium', `Bloc ${block.id} semble hors du dateRange.`, block.id)
    }

    const window = planningContext.usableFreeWindows.find(w => w.id === block.sourceWindowId)
    if (!window) {
      addIssue('critical', `Bloc ${block.id} orphelin (aucune FreeTimeWindow correspondante).`, block.id)
    } else {
      if (block.start < window.start || block.end > window.end) {
        addIssue('critical', `Bloc ${block.id} déborde de sa fenêtre.`, block.id)
      }
      if (block.kind === 'deep_work' && !window.canHostDeepWork) {
        addIssue('high', `Bloc deep_work ${block.id} placé dans une fenêtre non-deep_work.`, block.id)
      }
      if (['unsafe', 'preparation_only'].includes(window.windowType)) {
        addIssue('critical', `Bloc ${block.id} placé dans une fenêtre interdite (${window.windowType}).`, block.id)
      }
    }

    // Overlaps
    for (let j = i + 1; j < plan.proposedBlocks.length; j++) {
      const other = plan.proposedBlocks[j]
      if (!other) continue
      if (block.start < other.end && block.end > other.start) {
        addIssue('critical', `Chevauchement détecté entre le bloc ${block.id} et ${other.id}.`)
      }
    }
  }

  // 3. Plan-level rules
  if ((plan.mode === 'rescue' || plan.mode === 'minimum_viable') && plan.warnings.length === 0) {
    addIssue('medium', 'Le plan est en mode crisis mais ne contient aucun warning global.')
  }

  if (plan.confidence > 90 && plan.unplacedItems.some(i => i.reason === 'low_confidence')) {
    addIssue('medium', 'Confiance du plan très élevée alors que certaines données manquent (low_confidence).')
  }

  // Check important missing items without reason (we assume unplacedItems covers all of them, but check if reason is 'unknown')
  for (const item of plan.unplacedItems) {
    if (item.reason === 'unknown' && item.confidence < 50) {
      addIssue('medium', `Item non placé sans raison claire (${item.targetId}).`, item.targetId)
    }
  }

  return {
    status,
    issues,
    summary: [
      `${issues.length} problème(s) détecté(s).`,
      ...(status === 'healthy' ? ['Le plan proposé semble sain.'] : ['Le plan nécessite potentiellement une révision.'])
    ]
  }
}
