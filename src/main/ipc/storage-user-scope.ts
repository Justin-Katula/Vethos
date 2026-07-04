export function parseOptionalStorageUserId(rawUserId: unknown): string | undefined {
  if (rawUserId === undefined) return undefined
  if (typeof rawUserId !== 'string') throw new Error('userId must be a string or undefined')
  const trimmed = rawUserId.trim()
  return trimmed || undefined
}

export function resolveAuthorizedStorageUserId(rawUserId: unknown, currentUserId: string | undefined): string {
  const requested = parseOptionalStorageUserId(rawUserId)
  if (!currentUserId) throw new Error('Utilisateur non authentifié')
  if (requested && requested !== currentUserId) throw new Error('Accès inter-utilisateur refusé')
  return currentUserId
}
