import { create } from 'zustand'
import { addUserBehaviorEvent, buildEmptyUserModel, type UserBehaviorEvent, type UserCorrection, type UserModel } from '@shared/user-model'
import type { UserModelSnapshotInput } from '@/lib/user-model-snapshot'
import { buildUserModelSnapshot } from '@/lib/user-model-snapshot'
import { loadUserModel, saveUserModel } from '@/lib/user-model-storage'
import { applyUserCorrectionToModel } from '@/lib/user-correction-system'
import { DEFAULT_USER_MODEL_FLAGS } from '@shared/user-model-flags'

type State = {
  userId: string | null
  loaded: boolean
  model: UserModel | null
  setUserId: (userId?: string | null) => void
  reset: () => void
  load: (userId?: string) => Promise<void>
  rebuild: (input: Omit<UserModelSnapshotInput, 'userId'|'previousModel'>) => Promise<UserModel | null>
  recordEvent: (event: UserBehaviorEvent) => Promise<void>
  applyCorrection: (correction: UserCorrection) => Promise<void>
}

const initial = { userId: null, loaded: false, model: null }

export const useUserModelStore = create<State>((set, get) => ({
  ...initial,
  setUserId(raw) {
    const userId = raw?.trim() || null
    if (get().userId !== userId) set({ ...initial, userId })
  },
  reset() { set({ ...initial }) },
  async load(raw) {
    const userId = raw?.trim() || get().userId
    if (!userId || !DEFAULT_USER_MODEL_FLAGS.userModelEnabled) { get().reset(); return }
    const model = DEFAULT_USER_MODEL_FLAGS.userModelStorageEnabled ? await loadUserModel(userId) : null
    set({ userId, loaded: true, model: model ?? buildEmptyUserModel(userId) })
  },
  async rebuild(input) {
    const userId = get().userId
    if (!userId || !DEFAULT_USER_MODEL_FLAGS.userModelEnabled || !DEFAULT_USER_MODEL_FLAGS.userModelSnapshotEnabled) return null
    const model = buildUserModelSnapshot({ ...input, userId, previousModel: get().model ?? undefined })
    set({ model, loaded: true })
    if (DEFAULT_USER_MODEL_FLAGS.userModelStorageEnabled) await saveUserModel(model)
    return model
  },
  async recordEvent(event) {
    const { userId } = get()
    if (!userId || !DEFAULT_USER_MODEL_FLAGS.userModelEnabled || !DEFAULT_USER_MODEL_FLAGS.userEventCollectorEnabled) return
    const base = get().model ?? buildEmptyUserModel(userId)
    const model = addUserBehaviorEvent(base, event)
    set({ model })
    if (DEFAULT_USER_MODEL_FLAGS.userModelStorageEnabled) await saveUserModel(model)
  },
  async applyCorrection(correction) {
    const { userId } = get()
    if (!userId || !DEFAULT_USER_MODEL_FLAGS.userCorrectionSystemEnabled) return
    const model = applyUserCorrectionToModel(get().model ?? buildEmptyUserModel(userId), correction)
    set({ model })
    if (DEFAULT_USER_MODEL_FLAGS.userModelStorageEnabled) await saveUserModel(model)
  },
}))
