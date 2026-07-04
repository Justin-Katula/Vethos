import type { PreviewDependencyReport, ExecutionPreviewDay, PreviewSafetyReport, ExecutionPreviewDiagnostics, PreviewReadinessGateResult } from '@shared/execution-preview-model'

export function runExecutionPreviewReadinessGate(input: {
  dependencies: PreviewDependencyReport[]
  days: ExecutionPreviewDay[]
  safety: PreviewSafetyReport
  diagnostics?: ExecutionPreviewDiagnostics
  settings?: any
}): PreviewReadinessGateResult {
  const { dependencies, days, safety, diagnostics } = input

  let canDisplayPreview = false
  let readiness: PreviewReadinessGateResult['readiness'] = 'ready_for_ui_preview'
  const blockers: string[] = []
  const warnings: string[] = []
  const requiredActions: PreviewReadinessGateResult['requiredActions'] = []
  let confidence = 100

  // 1. Safety overrides
  if (safety.status === 'critical') {
    readiness = 'unsafe'
    blockers.push('Safety check returned critical status. Execution preview is strictly disabled.')
    confidence = 0
  } else if (safety.status === 'unsafe') {
    readiness = 'unsafe'
    blockers.push('Execution preview is unsafe.')
    confidence = 0
  }

  // 2. Dependencies checking
  if (readiness !== 'unsafe') {
    const missingDependencies = dependencies.filter(d => d.status === 'missing')
    const hasMissingCritical = missingDependencies.some(d => d.required)
    
    if (hasMissingCritical) {
      if (!dependencies.find(d => d.name === 'placement_plan' && d.status === 'available')) {
        readiness = 'blocked'
        blockers.push('Placement plan is missing entirely.')
        requiredActions.push('rebuild_placement_plan')
        confidence = 0
      } else {
        readiness = 'partial_preview_only'
        warnings.push('Some critical dependencies are missing, preview will be partial.')
        confidence = Math.max(0, confidence - 40)
      }
    }
  }

  // 3. Diagnostics overrides
  if (diagnostics?.status === 'critical' && readiness !== 'unsafe' && readiness !== 'blocked') {
    readiness = 'manual_review_required'
    warnings.push('Critical diagnostics found, manual review required.')
    requiredActions.push('manual_review')
    confidence = Math.min(confidence, 30)
  }

  // Determine displayability
  if (readiness === 'ready_for_ui_preview' || readiness === 'partial_preview_only' || readiness === 'manual_review_required') {
    canDisplayPreview = true
  }

  return {
    canDisplayPreview,
    // Point 10 — garantie structurelle : ce pipeline de prévisualisation ne devient
    // jamais celui qui applique quoi que ce soit. canApplyLater est false en
    // permanence, sans condition. L'application réelle passe par les propres
    // mécanismes d'activation des Points 7/8/9, jamais par la preview.
    // (executionEnabled reste utilisé par le plan-builder uniquement pour choisir
    // le mode d'affichage ui_preview vs debug_preview, pas une capacité d'application.)
    canApplyLater: false,
    readiness,
    blockers,
    warnings,
    requiredActions,
    confidence
  }
}
