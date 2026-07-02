import type {
  OnboardingDeepWorkWindow,
  OnboardingDistractionKind,
  OnboardingLifeArea,
  OnboardingProtectionStyle,
  OnboardingResult,
} from './onboarding-model'

export const USER_MODEL_VERSION = 1
export const DEFAULT_USER_BEHAVIOR_EVENT_LIMIT = 1000
export const MAX_USER_BEHAVIOR_EVENT_LIMIT = 2000
export const DEFAULT_USER_CORRECTION_LIMIT = 500

export type DeclaredUserType =
  | 'student'
  | 'worker'
  | 'student_worker'
  | 'entrepreneur'
  | 'parent_caregiver'
  | 'between_jobs'
  | 'other'
  | 'unknown'

export type UserLifeArea =
  | 'school'
  | 'work'
  | 'project'
  | 'discipline'
  | 'health'
  | 'finance'
  | 'future'
  | 'personal'

export type UserProtectionStyle = OnboardingProtectionStyle

export type DeclaredUserProfile = {
  userName?: string
  userType: DeclaredUserType
  primaryLifeArea?: UserLifeArea
  protectionStyle: UserProtectionStyle
  createdAt: string
  updatedAt: string
}

export type UserDisciplineCommitment = {
  id: string
  type:
    | 'sleep'
    | 'wake'
    | 'deep_work'
    | 'objective'
    | 'distraction_control'
    | 'session_resistance'
  label: string
  targetValue: string | number | string[]
  strength: 'normal' | 'strong' | 'non_negotiable'
  protectedByVethos: boolean
  source: 'onboarding' | 'settings' | 'coach' | 'user_correction'
  createdAt: string
  updatedAt: string
}

export type UserObjectivePreference = {
  objectiveId: string
  declaredImportanceScore: number
  observedCommitmentScore: number
  lifeImpactScore: number
  avoidanceScore: number
  stagnationScore: number
  momentumScore: number
  confidence: number
  reasons: string[]
  updatedAt: string
}

export type UserBehaviorEventType =
  | 'task_created'
  | 'task_started'
  | 'task_completed'
  | 'task_skipped'
  | 'task_expired'
  | 'session_started'
  | 'session_completed'
  | 'session_aborted'
  | 'objective_selected'
  | 'recommendation_accepted'
  | 'recommendation_rejected'
  | 'app_opened_during_session'
  | 'site_opened_during_session'
  | 'unlock_requested'
  | 'unlock_accepted'
  | 'unlock_refused'
  | 'app_manually_allowed'
  | 'app_manually_blocked'
  | 'site_manually_allowed'
  | 'site_manually_blocked'

export type UserBehaviorEvent = {
  id: string
  type: UserBehaviorEventType
  targetType?: 'task' | 'objective' | 'app' | 'site' | 'session'
  targetId?: string
  context?: {
    taskId?: string
    objectiveId?: string
    sessionId?: string
    blockId?: string
  }
  metadata?: Record<string, unknown>
  createdAt: string
}

export type UserCognitiveModel = {
  declaredChronotype: 'morning' | 'intermediate' | 'evening' | 'unknown'
  detectedChronotype: 'morning' | 'intermediate' | 'evening' | 'unknown'
  hourlyPerformance: Array<{
    hour: number
    averageEfficiency: number
    sampleCount: number
    confidence: number
  }>
  bestDeepWorkWindows: Array<{
    startHour: number
    endHour: number
    confidence: number
  }>
  fatigueRiskByHour: Array<{
    hour: number
    risk: number
  }>
  updatedAt: string
}

export type UserDisciplineContext =
  | 'school'
  | 'work'
  | 'project'
  | 'discipline'
  | 'health'
  | 'finance'
  | 'future'
  | 'personal'

export type UserDisciplineModel = {
  globalDistractionRisk: number
  confidence: number
  reasons: string[]
  riskByContext: Array<{
    context: UserDisciplineContext
    risk: number
    confidence: number
  }>
  riskyApps: Array<{
    identifier: string
    riskScore: number
    contexts: string[]
    reasons: string[]
  }>
  riskySites: Array<{
    domain: string
    riskScore: number
    contexts: string[]
    reasons: string[]
  }>
  unlockPattern: {
    frequentRequests: boolean
    repeatedExcuses: boolean
    contradictionRisk: number
    averageCredibility: number
  }
  updatedAt: string
}

export type UserAppSitePreference = {
  identifier: string
  kind: 'app' | 'site'
  globalCategory?: string
  contextRules: Array<{
    contextType: 'task' | 'objective' | 'domain'
    contextId?: string
    domain?: UserDisciplineContext
    classification: 'useful' | 'neutral' | 'distraction' | 'conditional'
    confidence: number
    source: 'user' | 'coach' | 'usage' | 'system' | 'fallback'
    reasons: string[]
    updatedAt: string
  }>
  updatedAt: string
}

export type UserCorrection = {
  id: string
  type:
    | 'objective_importance_corrected'
    | 'task_estimate_corrected'
    | 'app_classification_corrected'
    | 'site_classification_corrected'
    | 'chronotype_corrected'
    | 'recommendation_rejected'
    | 'recommendation_accepted'
    | 'coach_wrong'
    | 'coach_right'
  targetType: 'task' | 'objective' | 'app' | 'site' | 'user_model'
  targetId?: string
  oldValue?: unknown
  newValue?: unknown
  strength: 'weak' | 'normal' | 'strong' | 'permanent'
  context?: {
    duringSession?: boolean
    sessionId?: string
    objectiveId?: string
    taskId?: string
  }
  createdAt: string
}

export type UserModel = {
  userId: string
  declaredProfile: DeclaredUserProfile
  disciplineCommitments: UserDisciplineCommitment[]
  objectivePreferences: UserObjectivePreference[]
  behaviorEvents: UserBehaviorEvent[]
  cognitiveModel: UserCognitiveModel
  disciplineModel: UserDisciplineModel
  appSitePreferences: UserAppSitePreference[]
  corrections: UserCorrection[]
  metadata: {
    version: number
    confidence: number
    createdAt: string
    updatedAt: string
  }
}

export type UserModelBuildOptions = {
  now?: string
  eventLimit?: number
  correctionLimit?: number
}

function nowIso(): string {
  return new Date().toISOString()
}

function safeLimit(value: number | undefined, fallback: number, max: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(1, Math.min(max, Math.round(value!)))
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values))
}

function stableId(parts: Array<string | number | undefined | null>): string {
  return parts
    .filter((part): part is string | number => part !== undefined && part !== null && String(part).length > 0)
    .map((part) => String(part).toLowerCase().replace(/[^a-z0-9_-]+/giu, '-'))
    .join(':')
}

export function normalizeUserModelDomain(value: string): string {
  const trimmed = value.trim().toLowerCase()
  const withoutProtocol = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//u, '')
  const withoutAuth = withoutProtocol.replace(/^[^@\s/]+@/u, '')
  const host = withoutAuth.split(/[/?#]/u)[0] ?? withoutAuth
  return host.replace(/^www\./u, '')
}

function stripSensitiveUrlText(value: string): string {
  return value
    .replace(/https?:\/\/([^/\s?#]+)[^\s]*/giu, (_match, host: string) =>
      normalizeUserModelDomain(host),
    )
    .replace(/\bwww\.([a-z0-9.-]+\.[a-z]{2,})(?:[/?#][^\s]*)?/giu, (_match, host: string) =>
      normalizeUserModelDomain(host),
    )
    .replace(
      /\b((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,})(?:\/[^\s]*)/giu,
      (_match, host: string) => normalizeUserModelDomain(host),
    )
}

function sanitizeUnknown(value: unknown): unknown {
  if (typeof value === 'string') return stripSensitiveUrlText(value)
  if (Array.isArray(value)) return value.map(sanitizeUnknown)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, sanitizeUnknown(nested)]))
  }
  return value
}

export function sanitizeUserBehaviorEvent(event: UserBehaviorEvent): UserBehaviorEvent {
  return {
    ...event,
    targetId: event.targetType === 'site' && event.targetId ? normalizeUserModelDomain(event.targetId) : event.targetId,
    metadata: event.metadata ? (sanitizeUnknown(event.metadata) as Record<string, unknown>) : undefined,
  }
}

export function sanitizeUserCorrection(correction: UserCorrection): UserCorrection {
  return {
    ...correction,
    targetId:
      correction.targetType === 'site' && correction.targetId
        ? normalizeUserModelDomain(correction.targetId)
        : correction.targetId,
    oldValue: sanitizeUnknown(correction.oldValue),
    newValue: sanitizeUnknown(correction.newValue),
  }
}

function mapLifeArea(area: OnboardingLifeArea | undefined): UserLifeArea | undefined {
  switch (area) {
    case 'studies':
      return 'school'
    case 'work':
      return 'work'
    case 'personal_project':
      return 'project'
    case 'discipline':
      return 'discipline'
    case 'health':
      return 'health'
    case 'money':
      return 'finance'
    case 'future':
      return 'future'
    default:
      return undefined
  }
}

function firstPrimaryLifeArea(result: OnboardingResult): UserLifeArea | undefined {
  return mapLifeArea(result.firstObjective.lifeArea ?? result.protectedLifeAreas[0])
}

function importanceScore(importance: OnboardingResult['firstObjective']['importance']): number {
  if (importance === 'central') return 100
  if (importance === 'very_important') return 80
  return 60
}

function commitmentStrengthForProtection(style: OnboardingProtectionStyle): UserDisciplineCommitment['strength'] {
  if (style === 'strict') return 'non_negotiable'
  return 'strong'
}

function distractionLabel(distraction: OnboardingDistractionKind): string {
  switch (distraction) {
    case 'video_platforms':
      return 'Vidéos en ligne'
    case 'social_networks':
      return 'Réseaux sociaux'
    case 'games':
      return 'Jeux'
    case 'instant_messaging':
      return 'Messagerie instantanée'
    case 'aimless_browsing':
      return 'Navigation sans but'
    case 'music_entertainment':
      return 'Musique / divertissement'
    case 'other':
      return 'Autre distraction'
  }
}

function buildCommitmentsFromOnboarding(result: OnboardingResult): UserDisciplineCommitment[] {
  const updatedAt = result.createdAt
  const commitments: UserDisciplineCommitment[] = [
    {
      id: stableId(['commitment', 'sleep', result.sleepCommitment.sleepAt]),
      type: 'sleep',
      label: `Dormir à ${result.sleepCommitment.sleepAt}`,
      targetValue: result.sleepCommitment.sleepAt,
      strength: 'strong',
      protectedByVethos: true,
      source: 'onboarding',
      createdAt: result.createdAt,
      updatedAt,
    },
    {
      id: stableId(['commitment', 'wake', result.sleepCommitment.wakeAt]),
      type: 'wake',
      label: `Se lever à ${result.sleepCommitment.wakeAt}`,
      targetValue: result.sleepCommitment.wakeAt,
      strength: 'strong',
      protectedByVethos: true,
      source: 'onboarding',
      createdAt: result.createdAt,
      updatedAt,
    },
    {
      id: stableId(['commitment', 'objective', result.firstObjective.statement]),
      type: 'objective',
      label: `Protéger : ${result.firstObjective.statement}`,
      targetValue: result.firstObjective.statement,
      strength: result.firstObjective.importance === 'central' ? 'non_negotiable' : 'strong',
      protectedByVethos: true,
      source: 'onboarding',
      createdAt: result.createdAt,
      updatedAt,
    },
    {
      id: stableId(['commitment', 'session_resistance', result.protectionStyle]),
      type: 'session_resistance',
      label: 'Résister aux décisions faibles pendant les sessions',
      targetValue: result.protectionStyle,
      strength: commitmentStrengthForProtection(result.protectionStyle),
      protectedByVethos: true,
      source: 'onboarding',
      createdAt: result.createdAt,
      updatedAt,
    },
  ]

  if (result.deepWorkWindow !== 'unknown') {
    commitments.push({
      id: stableId(['commitment', 'deep_work', result.deepWorkWindow]),
      type: 'deep_work',
      label: `Défendre le bloc fort : ${result.deepWorkWindow}`,
      targetValue: result.deepWorkWindow,
      strength: 'strong',
      protectedByVethos: true,
      source: 'onboarding',
      createdAt: result.createdAt,
      updatedAt,
    })
  }

  if (result.distractionProfile.timeThieves.length > 0) {
    commitments.push({
      id: stableId(['commitment', 'distraction_control', ...result.distractionProfile.timeThieves]),
      type: 'distraction_control',
      label: 'Bloquer les voleurs de contrôle pendant les sessions',
      targetValue: result.distractionProfile.timeThieves.map(distractionLabel),
      strength: 'strong',
      protectedByVethos: true,
      source: 'onboarding',
      createdAt: result.createdAt,
      updatedAt,
    })
  }

  return commitments
}

function mergeCommitments(
  current: UserDisciplineCommitment[],
  incoming: UserDisciplineCommitment[],
): UserDisciplineCommitment[] {
  const map = new Map(current.map((commitment) => [commitment.id, commitment]))
  for (const commitment of incoming) map.set(commitment.id, commitment)
  return Array.from(map.values())
}

function objectivePreferenceFromOnboarding(result: OnboardingResult): UserObjectivePreference {
  const declaredImportanceScore = importanceScore(result.firstObjective.importance)
  return {
    objectiveId: 'onboarding:first-objective',
    declaredImportanceScore,
    observedCommitmentScore: 15,
    lifeImpactScore: clampScore(declaredImportanceScore - 5),
    avoidanceScore: result.painPoints.includes('postpones_important') ? 35 : 10,
    stagnationScore: 20,
    momentumScore: 10,
    confidence: clampScore(55 + result.painPoints.length * 5 + result.weaknessPatterns.length * 4),
    reasons: [
      `Objectif déclaré ${result.firstObjective.importance}.`,
      'Préférence créée depuis les engagements déclarés pendant l’onboarding.',
    ],
    updatedAt: result.createdAt,
  }
}

function mergeObjectivePreferences(
  current: UserObjectivePreference[],
  incoming: UserObjectivePreference[],
): UserObjectivePreference[] {
  const map = new Map(current.map((preference) => [preference.objectiveId, preference]))
  for (const preference of incoming) map.set(preference.objectiveId, preference)
  return Array.from(map.values())
}

function buildEmptyCognitiveModel(updatedAt: string): UserCognitiveModel {
  return {
    declaredChronotype: 'unknown',
    detectedChronotype: 'unknown',
    hourlyPerformance: [],
    bestDeepWorkWindows: [],
    fatigueRiskByHour: [],
    updatedAt,
  }
}

function buildEmptyDisciplineModel(updatedAt: string): UserDisciplineModel {
  return {
    globalDistractionRisk: 0,
    confidence: 0,
    reasons: ['Pas encore assez de signaux comportementaux.'],
    riskByContext: [],
    riskyApps: [],
    riskySites: [],
    unlockPattern: {
      frequentRequests: false,
      repeatedExcuses: false,
      contradictionRisk: 0,
      averageCredibility: 0,
    },
    updatedAt,
  }
}

function updatedModel(userModel: UserModel, updatedAt: string, confidenceDelta = 0): UserModel {
  return {
    ...userModel,
    metadata: {
      ...userModel.metadata,
      confidence: clampScore(userModel.metadata.confidence + confidenceDelta),
      updatedAt,
    },
  }
}

export function buildEmptyUserModel(
  userId: string,
  options: UserModelBuildOptions = {},
): UserModel {
  if (!userId.trim()) throw new Error('userId is required to build a UserModel')
  const now = options.now ?? nowIso()
  return {
    userId,
    declaredProfile: {
      userType: 'unknown',
      protectionStyle: 'firm',
      createdAt: now,
      updatedAt: now,
    },
    disciplineCommitments: [],
    objectivePreferences: [],
    behaviorEvents: [],
    cognitiveModel: buildEmptyCognitiveModel(now),
    disciplineModel: buildEmptyDisciplineModel(now),
    appSitePreferences: [],
    corrections: [],
    metadata: {
      version: USER_MODEL_VERSION,
      confidence: 0,
      createdAt: now,
      updatedAt: now,
    },
  }
}

export function buildUserModelFromOnboarding(
  userId: string,
  onboardingResult: OnboardingResult,
): UserModel {
  return mergeUserModelWithOnboarding(
    buildEmptyUserModel(userId, { now: onboardingResult.createdAt }),
    onboardingResult,
  )
}

export function mergeUserModelWithOnboarding(
  userModel: UserModel,
  onboardingResult: OnboardingResult,
): UserModel {
  const updatedAt = onboardingResult.createdAt
  const incomingCommitments = buildCommitmentsFromOnboarding(onboardingResult)
  const incomingPreference = objectivePreferenceFromOnboarding(onboardingResult)
  const merged = updatedModel(
    {
      ...userModel,
      declaredProfile: {
        ...userModel.declaredProfile,
        primaryLifeArea: firstPrimaryLifeArea(onboardingResult) ?? userModel.declaredProfile.primaryLifeArea,
        protectionStyle: onboardingResult.protectionStyle,
        updatedAt,
      },
      disciplineCommitments: mergeCommitments(userModel.disciplineCommitments, incomingCommitments),
      objectivePreferences: mergeObjectivePreferences(userModel.objectivePreferences, [incomingPreference]),
    },
    updatedAt,
    35,
  )

  return {
    ...merged,
    metadata: {
      ...merged.metadata,
      confidence: clampScore(
        35 +
          incomingCommitments.length * 5 +
          onboardingResult.painPoints.length * 3 +
          onboardingResult.weaknessPatterns.length * 3,
      ),
    },
  }
}

export function addUserBehaviorEvent(
  userModel: UserModel,
  event: UserBehaviorEvent,
  options: UserModelBuildOptions = {},
): UserModel {
  const limit = safeLimit(
    options.eventLimit,
    DEFAULT_USER_BEHAVIOR_EVENT_LIMIT,
    MAX_USER_BEHAVIOR_EVENT_LIMIT,
  )
  const sanitized = sanitizeUserBehaviorEvent(event)
  return updatedModel(
    {
      ...userModel,
      behaviorEvents: [...userModel.behaviorEvents, sanitized].slice(-limit),
    },
    sanitized.createdAt,
    1,
  )
}

export function addUserCorrection(
  userModel: UserModel,
  correction: UserCorrection,
  options: UserModelBuildOptions = {},
): UserModel {
  const limit = safeLimit(options.correctionLimit, DEFAULT_USER_CORRECTION_LIMIT, DEFAULT_USER_CORRECTION_LIMIT)
  const sanitized = sanitizeUserCorrection(correction)
  const confidenceDelta =
    sanitized.strength === 'permanent' ? 8 : sanitized.strength === 'strong' ? 5 : sanitized.strength === 'normal' ? 3 : 1

  return updatedModel(
    {
      ...userModel,
      corrections: [...userModel.corrections, sanitized].slice(-limit),
    },
    sanitized.createdAt,
    confidenceDelta,
  )
}

export function onboardingDeepWorkWindowToCommitmentValue(
  value: OnboardingDeepWorkWindow,
): string {
  if (value === 'morning') return 'Matin'
  if (value === 'afternoon') return 'Après-midi'
  if (value === 'evening') return 'Soir'
  return 'À calibrer'
}
