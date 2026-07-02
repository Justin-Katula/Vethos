export type UserModelFlags = {
  userModelEnabled: boolean
  userEventCollectorEnabled: boolean
  userModelSnapshotEnabled: boolean
  objectivePreferenceModelEnabled: boolean
  cognitiveModelEnabled: boolean
  disciplineModelEnabled: boolean
  appSiteContextModelEnabled: boolean
  userCorrectionSystemEnabled: boolean
  userModelExplanationsEnabled: boolean
  userModelDiagnosticsEnabled: boolean
  userModelStorageEnabled: boolean
  userModelControlsDisplay: boolean
  userModelControlsRecommendations: boolean
  userModelControlsPlanning: boolean
  userModelControlsBlocking: boolean
}

export const DEFAULT_USER_MODEL_FLAGS: Readonly<UserModelFlags> = Object.freeze({
  userModelEnabled: true,
  userEventCollectorEnabled: true,
  userModelSnapshotEnabled: true,
  objectivePreferenceModelEnabled: true,
  cognitiveModelEnabled: true,
  disciplineModelEnabled: true,
  appSiteContextModelEnabled: true,
  userCorrectionSystemEnabled: true,
  userModelExplanationsEnabled: true,
  userModelDiagnosticsEnabled: true,
  userModelStorageEnabled: true,
  userModelControlsDisplay: false,
  userModelControlsRecommendations: false,
  userModelControlsPlanning: false,
  userModelControlsBlocking: false,
})

export function canUserModelControl(
  area: 'display' | 'recommendations' | 'planning' | 'blocking',
  flags: UserModelFlags = DEFAULT_USER_MODEL_FLAGS,
): boolean {
  if (!flags.userModelEnabled) return false
  return flags[`userModelControls${area[0]!.toUpperCase()}${area.slice(1)}` as keyof UserModelFlags] === true
}
