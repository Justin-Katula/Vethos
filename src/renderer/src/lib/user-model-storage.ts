import { vethos } from './ipc'
import {
  DEFAULT_USER_BEHAVIOR_EVENT_LIMIT,
  DEFAULT_USER_CORRECTION_LIMIT,
  USER_MODEL_VERSION,
  buildEmptyUserModel,
  sanitizeUserBehaviorEvent,
  sanitizeUserCorrection,
  type UserCorrection,
  type UserModel,
} from '@shared/user-model'

type UserModelStorage = Pick<typeof vethos.storage, 'read' | 'write'>

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function pruneUserModelHistory(
  model: UserModel,
  options: { eventLimit?: number; correctionLimit?: number; now?: string } = {},
): UserModel {
  const eventLimit = Math.max(1, Math.min(2000, options.eventLimit ?? DEFAULT_USER_BEHAVIOR_EVENT_LIMIT))
  const correctionLimit = Math.max(1, options.correctionLimit ?? DEFAULT_USER_CORRECTION_LIMIT)
  const permanent = model.corrections.filter((item) => item.strength === 'permanent')
  const otherSlots = Math.max(0, correctionLimit - permanent.length)
  const others = model.corrections.filter((item) => item.strength !== 'permanent').slice(-otherSlots)
  const corrections = (permanent.length >= correctionLimit ? permanent : [...permanent, ...others])
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(sanitizeUserCorrection)
  return {
    ...model,
    behaviorEvents: model.behaviorEvents.slice(-eventLimit).map(sanitizeUserBehaviorEvent),
    corrections,
    appSitePreferences: model.appSitePreferences.map((preference) => ({
      ...preference,
      identifier:
        preference.kind === 'site'
          ? sanitizeUserBehaviorEvent({ id: '', type: 'site_manually_allowed', targetType: 'site', targetId: preference.identifier, createdAt: '' }).targetId!
          : preference.identifier,
    })),
    metadata: { ...model.metadata, updatedAt: options.now ?? model.metadata.updatedAt },
  }
}

export function migrateUserModelIfNeeded(raw: unknown, expectedUserId?: string): UserModel | null {
  if (!isRecord(raw) || typeof raw.userId !== 'string' || !raw.userId.trim()) return null
  if (expectedUserId && raw.userId !== expectedUserId) return null
  const base = buildEmptyUserModel(raw.userId, {
    now: isRecord(raw.metadata) && typeof raw.metadata.createdAt === 'string'
      ? raw.metadata.createdAt
      : new Date().toISOString(),
  })
  const candidate = raw as Partial<UserModel>
  const migrated: UserModel = {
    ...base,
    ...candidate,
    userId: raw.userId,
    declaredProfile: { ...base.declaredProfile, ...(isRecord(candidate.declaredProfile) ? candidate.declaredProfile : {}) },
    disciplineCommitments: Array.isArray(candidate.disciplineCommitments) ? candidate.disciplineCommitments : [],
    objectivePreferences: Array.isArray(candidate.objectivePreferences) ? candidate.objectivePreferences : [],
    behaviorEvents: Array.isArray(candidate.behaviorEvents) ? candidate.behaviorEvents : [],
    appSitePreferences: Array.isArray(candidate.appSitePreferences) ? candidate.appSitePreferences : [],
    corrections: Array.isArray(candidate.corrections) ? candidate.corrections as UserCorrection[] : [],
    cognitiveModel: { ...base.cognitiveModel, ...(isRecord(candidate.cognitiveModel) ? candidate.cognitiveModel : {}) },
    disciplineModel: { ...base.disciplineModel, ...(isRecord(candidate.disciplineModel) ? candidate.disciplineModel : {}) },
    metadata: {
      ...base.metadata,
      ...(isRecord(candidate.metadata) ? candidate.metadata : {}),
      version: USER_MODEL_VERSION,
    },
  }
  return pruneUserModelHistory(migrated)
}

export async function loadUserModel(userId: string, storage: UserModelStorage = vethos.storage): Promise<UserModel | null> {
  if (!userId.trim()) return null
  try {
    return migrateUserModelIfNeeded(await storage.read<unknown>('user_model', userId), userId)
  } catch {
    return null
  }
}

export async function saveUserModel(model: UserModel, storage: UserModelStorage = vethos.storage): Promise<UserModel> {
  if (!model.userId.trim()) throw new Error('Cannot save a UserModel without userId')
  const clean = pruneUserModelHistory(model)
  const result = await storage.write('user_model', clean, model.userId)
  if (!result.ok) throw new Error(result.error)
  return clean
}

export async function clearUserModel(userId: string, storage: UserModelStorage = vethos.storage): Promise<void> {
  if (!userId.trim()) return
  const cleared = buildEmptyUserModel(userId)
  const result = await storage.write('user_model', cleared, userId)
  if (!result.ok) throw new Error(result.error)
}
