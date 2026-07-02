import { ActivationBridgeViewModel } from './activation-bridge-view-model'

export interface ActivationBridgeUiGuardsResult {
  safe: boolean
  issues: Array<{
    id: string
    severity: 'low' | 'medium' | 'high' | 'critical'
    message: string
  }>
}

export function guardActivationBridgeUi(viewModel: ActivationBridgeViewModel): ActivationBridgeUiGuardsResult {
  const result: ActivationBridgeUiGuardsResult = {
    safe: true,
    issues: []
  }

  const addIssue = (severity: 'low' | 'medium' | 'high' | 'critical', message: string, id: string) => {
    result.safe = false
    result.issues.push({ id, severity, message })
  }

  if (viewModel.canProceedToRealActivation) {
    addIssue('critical', 'Le modèle de vue autorise canProceedToRealActivation = true.', 'guard_can_proceed')
  }

  if (viewModel.canApplyAnythingNow) {
    addIssue('critical', 'Le modèle de vue autorise canApplyAnythingNow = true.', 'guard_can_apply')
  }

  for (const row of viewModel.futureActionRows) {
    if (row.canExecuteNow) {
      addIssue('critical', `La ligne d'action future "${row.id}" se déclare exécutable.`, 'guard_can_execute_now')
    }
  }

  if (!viewModel.forbiddenActionNotice) {
    addIssue('high', 'La notice d\'interdiction d\'action est absente du modèle de vue.', 'guard_missing_notice')
  }

  if (viewModel.statusSeverity === 'good' && viewModel.blockers.length > 0) {
    addIssue('critical', 'Le statut est "good" alors qu\'il y a des bloqueurs.', 'guard_good_with_blockers')
  }

  // Wording checks
  // Un label impératif dangereux qui donne l'impression d'une action
  // Exemples: "Activer", "Appliquer", "Démarrer", "Bloquer", "Exécuter", "Auto-fix"
  // Note: On cherche des mots isolés ou au début de phrase. S'ils sont précédés de "Future", "Would", ou "Interdit de", on les tolère (c'est le rôle de l'ActionBuilder). 
  // Mais ici, on va faire un regex basique sur l'UI entière pour les boutons/labels s'il y en avait, mais vm ne contient pas de boutons.
  // Vérifions les labels des actions futures. Si ça commence par un impératif, c'est mal.
  const dangerousImperatives = /^(appliquer|activer|démarrer|bloquer\s+maintenant|exécuter|auto-fix|start|apply|activate|execute)\b/i

  for (const row of viewModel.futureActionRows) {
    if (dangerousImperatives.test(row.label)) {
      addIssue('high', `La ligne d'action "${row.id}" utilise un vocabulaire impératif dangereux qui suggère une action exécutable: "${row.label}"`, 'guard_imperative_wording')
    }
  }

  // Check the title and status labels for those words too, just in case
  const fullText = `${viewModel.title} ${viewModel.statusLabel}`
  if (dangerousImperatives.test(fullText)) {
    addIssue('high', `Le titre ou statut utilise un vocabulaire impératif dangereux: "${fullText}"`, 'guard_title_wording')
  }

  return result
}
