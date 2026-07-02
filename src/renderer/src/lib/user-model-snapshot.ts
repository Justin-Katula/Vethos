import { buildEmptyUserModel, buildUserModelFromOnboarding, mergeUserModelWithOnboarding, type UserBehaviorEvent, type UserCorrection, type UserModel } from '@shared/user-model'
import type { OnboardingResult } from '@shared/onboarding-model'
import { buildObjectivePreferenceModel, type ObjectivePreferenceSource } from './objective-preference-builder'
import { buildCognitiveModel } from './cognitive-profile-builder'
import { buildDisciplineModel } from './discipline-risk-builder'
import { buildAppSitePreferenceModel, type RegistryPreferenceEntry } from './app-site-context-model'
import { mergeCorrections } from './user-correction-system'

export type UserModelSnapshotInput = {
  userId: string
  onboardingResult?: OnboardingResult
  settings?: Record<string, unknown>
  schedule?: readonly unknown[] | Record<string, unknown>
  tasks?: readonly Record<string, unknown>[]
  objectives?: readonly ObjectivePreferenceSource[]
  sessions?: readonly Record<string, unknown>[]
  appRegistry?: readonly RegistryPreferenceEntry[]
  siteRegistry?: readonly RegistryPreferenceEntry[]
  blockingHistory?: readonly Record<string, unknown>[]
  behaviorEvents?: readonly UserBehaviorEvent[]
  corrections?: readonly UserCorrection[]
  cognitiveStats?: readonly Record<string, unknown>[]
  previousModel?: UserModel
  now?: string
}

export function buildUserModelSnapshot(input: UserModelSnapshotInput): UserModel {
  if (!input.userId.trim()) throw new Error('userId is required to build a UserModel snapshot')
  const now = input.now ?? new Date().toISOString()
  const previous = input.previousModel?.userId === input.userId ? input.previousModel : undefined
  const initial = previous
    ? input.onboardingResult ? mergeUserModelWithOnboarding(previous, input.onboardingResult) : previous
    : input.onboardingResult
      ? buildUserModelFromOnboarding(input.userId, input.onboardingResult)
      : buildEmptyUserModel(input.userId, { now })
  const events = [...(input.previousModel?.behaviorEvents ?? []), ...(input.behaviorEvents ?? [])]
  const uniqueEvents = [...new Map(events.map((event) => [event.id, event])).values()].slice(-1000)
  const corrections = mergeCorrections([...(input.previousModel?.corrections ?? []), ...(input.corrections ?? [])])
  const objectives = input.objectives ?? []
  const tasks = input.tasks ?? []
  const sessions = [...(input.sessions ?? []), ...(input.blockingHistory ?? [])]
  const objectivePreferences = objectives.length ? objectives.map((objective) => buildObjectivePreferenceModel(
    objective,
    tasks as Parameters<typeof buildObjectivePreferenceModel>[1],
    sessions as Parameters<typeof buildObjectivePreferenceModel>[2],
    uniqueEvents,
    corrections,
    { now, primaryLifeArea: initial.declaredProfile.primaryLifeArea },
  )) : initial.objectivePreferences
  const hasCognitiveSources = input.sessions !== undefined || input.cognitiveStats !== undefined || input.settings !== undefined
  const cognitiveModel = hasCognitiveSources ? buildCognitiveModel(
    sessions as Parameters<typeof buildCognitiveModel>[0],
    input.cognitiveStats as Parameters<typeof buildCognitiveModel>[1],
    input.settings as Parameters<typeof buildCognitiveModel>[2],
    uniqueEvents,
    now,
  ) : initial.cognitiveModel
  const appRegistry = input.appRegistry ?? []
  const siteRegistry = input.siteRegistry ?? []
  const registry = [...appRegistry, ...siteRegistry]
  const hasDisciplineSources = input.behaviorEvents !== undefined || input.sessions !== undefined || input.blockingHistory !== undefined || input.appRegistry !== undefined || input.siteRegistry !== undefined
  const disciplineModel = hasDisciplineSources ? buildDisciplineModel(uniqueEvents, sessions, input.blockingHistory, appRegistry, siteRegistry, corrections, { now }) : initial.disciplineModel
  const appSitePreferences = input.appRegistry !== undefined || input.siteRegistry !== undefined
    ? buildAppSitePreferenceModel(registry, tasks, objectives, uniqueEvents, corrections, undefined, { now })
    : initial.appSitePreferences
  const evidence = uniqueEvents.length + sessions.length + tasks.length + objectives.length
  return {
    ...initial,
    objectivePreferences,
    behaviorEvents: uniqueEvents,
    cognitiveModel,
    disciplineModel,
    appSitePreferences,
    corrections,
    metadata: { ...initial.metadata, confidence: Math.max(initial.metadata.confidence, Math.min(95, 10 + evidence * 3)), updatedAt: now },
  }
}
