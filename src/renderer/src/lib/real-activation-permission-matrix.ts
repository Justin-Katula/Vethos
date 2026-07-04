import { MinimalExecutionBoundaryV2, RealExecutableModuleAudit, RealActivationPermissionMatrix } from '../../../shared/real-activation-protocol-model'

export interface RealActivationPermissionMatrixInput {
  boundary: MinimalExecutionBoundaryV2
  moduleAudit: RealExecutableModuleAudit[]
  activationBridgeDraft?: unknown
}

export function buildRealActivationPermissionMatrix(input: RealActivationPermissionMatrixInput): RealActivationPermissionMatrix {
  const matrix: RealActivationPermissionMatrix = {
    status: 'draft_only',
    permissions: [],
    canActivateNow: false,
    confidence: 1
  }

  // Symbolically mapping OS permissions that will be needed
  matrix.permissions.push({
    id: 'perm_os_admin',
    label: 'Élévation Privilèges Admin',
    category: 'os',
    requiredForFutureActivation: true,
    grantedNow: false,
    canRequestNow: false,
    reason: 'Nécessaire pour l\'écriture du fichier hosts et les règles pare-feu.',
    riskLevel: 'critical'
  })

  matrix.permissions.push({
    id: 'perm_store_write',
    label: 'Écriture Zustand',
    category: 'store_write',
    requiredForFutureActivation: true,
    grantedNow: false,
    canRequestNow: false,
    reason: 'Nécessaire pour appliquer le planning et modifier le statut des tâches.',
    riskLevel: 'high'
  })

  matrix.permissions.push({
    id: 'perm_session_manager',
    label: 'Contrôle Session Manager',
    category: 'session',
    requiredForFutureActivation: true,
    grantedNow: false,
    canRequestNow: false,
    reason: 'Nécessaire pour déclencher startSession et la boucle anti-triche.',
    riskLevel: 'critical'
  })

  matrix.permissions.push({
    id: 'perm_user_confirm',
    label: 'Confirmation Explicite',
    category: 'user_confirmation',
    requiredForFutureActivation: true,
    grantedNow: false,
    canRequestNow: false,
    reason: 'L\'utilisateur doit valider consciemment la perte de contrôle.',
    riskLevel: 'low'
  })

  if (input.boundary.status === 'unsafe' || input.boundary.status === 'invalid') {
    matrix.status = 'unsafe'
  } else if (input.boundary.status === 'blocked') {
    matrix.status = 'blocked'
  }

  return matrix
}
