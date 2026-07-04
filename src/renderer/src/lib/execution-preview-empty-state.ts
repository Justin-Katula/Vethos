export interface ExecutionPreviewEmptyState {
  title: string
  description: string
  icon: 'info' | 'warning' | 'error'
}

export type EmptyStateReason =
  | 'no_preview_built'
  | 'missing_planning_context'
  | 'missing_placement_plan'
  | 'missing_session_plans'
  | 'unsafe_preview'
  | 'manual_review_required'
  | 'invalid_date_range'

export function buildExecutionPreviewEmptyState(reason: EmptyStateReason): ExecutionPreviewEmptyState {
  switch (reason) {
    case 'no_preview_built':
      return {
        title: 'Aucune preview générée',
        description: 'Le planificateur n’a pas encore généré de plan proposé pour cette période.',
        icon: 'info',
      }
    case 'missing_planning_context':
      return {
        title: 'Contexte de planning manquant',
        description: 'Le pipeline a besoin du PlanningContextV2 pour générer une preview complète.',
        icon: 'warning',
      }
    case 'missing_placement_plan':
      return {
        title: 'Plan de placement manquant',
        description: 'Vethos doit d’abord répartir le travail dans les créneaux disponibles.',
        icon: 'warning',
      }
    case 'missing_session_plans':
      return {
        title: 'Plans de session manquants',
        description: 'Les sessions n’ont pas été générées pour ce plan.',
        icon: 'warning',
      }
    case 'unsafe_preview':
      return {
        title: 'Preview non sécurisée',
        description: 'Le plan peut être examiné, mais aucune de ses actions ne doit être appliquée.',
        icon: 'error',
      }
    case 'manual_review_required':
      return {
        title: 'Examen manuel requis',
        description: 'La preview est suspendue en attente d’un examen manuel de l’utilisateur.',
        icon: 'warning',
      }
    case 'invalid_date_range':
      return {
        title: 'Période invalide',
        description: 'La plage de dates demandée pour la preview est incorrecte.',
        icon: 'error',
      }
    default:
      return {
        title: 'Preview indisponible',
        description: 'Impossible d’afficher le plan.',
        icon: 'info',
      }
  }
}
