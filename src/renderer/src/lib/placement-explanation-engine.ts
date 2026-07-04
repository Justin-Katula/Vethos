import type { ProposedPlacementBlock, UnplacedPlacementItem, PlacementPlanV2 } from '@shared/placement-model'

export function explainPlacementPlan(plan: PlacementPlanV2): void {
  const isRescue = plan.mode === 'rescue' || plan.mode === 'minimum_viable'
  const isIntensive = plan.mode === 'intensive'

  if (isRescue) {
    plan.explanation.title = 'Plan de Sauvetage Proposé'
    plan.explanation.summary = 'Le temps disponible avant les échéances ne suffit pas pour un plan complet. Ce plan vise à sauver le maximum possible en se concentrant sur l\'essentiel.'
  } else if (isIntensive) {
    plan.explanation.title = 'Plan Intensif Proposé'
    plan.explanation.summary = 'Une échéance approche. Le plan utilise au maximum les fenêtres disponibles pour garantir la complétion.'
  } else {
    plan.explanation.title = 'Plan de Travail Proposé'
    plan.explanation.summary = 'Répartition optimale des tâches dans les fenêtres disponibles.'
  }

  const baseReasons = []
  if (plan.summary.unplacedCount > 0) {
    baseReasons.push(`Certaines tâches n'ont pas pu être placées par manque de créneaux compatibles.`)
  }
  if (plan.summary.rescueMinutes > 0) {
    baseReasons.push(`Des blocs stratégiques courts ont été privilégiés face au manque de temps.`)
  }
  if (plan.summary.deepWorkMinutes > 0) {
    baseReasons.push(`Le travail profond a été sécurisé dans les fenêtres les plus longues.`)
  }

  plan.explanation.reasons = baseReasons
}

export function explainProposedBlock(block: ProposedPlacementBlock): string {
  const exp: string[] = []
  
  if (block.kind === 'deep_work') {
    exp.push('Travail profond placé dans une fenêtre adaptée.')
  } else if (block.placementMode === 'minimum_viable') {
    exp.push('Seul le minimum utile est placé pour éviter de déborder.')
  } else if (block.placementMode === 'rescue') {
    exp.push('Bloc de sauvetage prioritaire.')
  } else if (block.kind === 'recovery' || block.reasons.some(r => r.includes('Relance'))) {
    exp.push('Bloc court pour relancer le travail progressivement.')
  } else if (block.kind === 'manual_review') {
    exp.push('Revue ou clarification nécessaire avant de s\'y investir.')
  } else {
    exp.push('Créneau standard attribué en fonction du temps disponible.')
  }

  // Add one technical reason if it exists to be precise without being harsh
  const technical = block.reasons.find(r => r.includes('deadline') || r.includes('durée'))
  if (technical) {
    exp.push(technical)
  }

  return exp.join(' ')
}

export function explainUnplacedItem(item: UnplacedPlacementItem): string {
  switch (item.reason) {
    case 'no_usable_window':
      return 'Aucun créneau utilisable n\'existe avant l\'échéance ou pour cette durée.'
    case 'needs_deep_work_but_no_deep_window':
      return 'Cette tâche nécessite du travail profond, mais aucune fenêtre adéquate n\'est disponible.'
    case 'capacity_exceeded':
      return 'La capacité journalière a été atteinte. Le reste de la tâche ne peut être placé raisonnablement.'
    case 'deadline_impossible':
      return 'Le temps restant ne suffit pas pour tout faire avant l\'échéance.'
    case 'low_confidence':
      return 'Les données sont trop floues pour proposer un plan précis.'
    case 'task_too_large':
    case 'task_too_vague':
    case 'manual_review_required':
      return 'Cette tâche doit être clarifiée ou découpée avant d\'être placée.'
    case 'recovery_protected':
    case 'sleep_protected':
      return 'Le seul créneau disponible est protégé pour le repos ou la récupération.'
    default:
      return 'Impossible de placer cette tâche dans le temps disponible actuel.'
  }
}
