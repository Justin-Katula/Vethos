import { describe, expect, it } from 'vitest'
import { resolveAuthorizedStorageUserId } from './storage-user-scope'

describe('storage user scope', () => {
  it('utilise seulement l’utilisateur authentifié', () => {
    expect(resolveAuthorizedStorageUserId(undefined, 'user-a')).toBe('user-a')
    expect(resolveAuthorizedStorageUserId('user-a', 'user-a')).toBe('user-a')
    expect(() => resolveAuthorizedStorageUserId('user-b', 'user-a')).toThrow('inter-utilisateur')
    expect(() => resolveAuthorizedStorageUserId('user-a', undefined)).toThrow('non authentifié')
  })
})
