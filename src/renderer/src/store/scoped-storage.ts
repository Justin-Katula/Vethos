export type ScopedUserState = {
  userId: string | null
}

export type ScopedStoreControls = ScopedUserState & {
  setUserId: (userId?: string | null) => void
  reset: () => void
}

export function normalizeStorageUserId(userId: string | null | undefined): string | undefined {
  const trimmed = userId?.trim()
  return trimmed ? trimmed : undefined
}

export function storageUserIdFromState(state: ScopedUserState): string | undefined {
  return normalizeStorageUserId(state.userId)
}

export function resolveStorageUserId(
  rawUserId: string | null | undefined,
  state: ScopedUserState,
): string | undefined {
  return normalizeStorageUserId(rawUserId) ?? storageUserIdFromState(state)
}
