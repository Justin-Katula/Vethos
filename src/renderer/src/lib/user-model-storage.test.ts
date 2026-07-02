import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildEmptyUserModel, type UserModel } from '@shared/user-model'

const data = new Map<string, unknown>()
const storage = {
  read: vi.fn(async (_key: string, userId?: string) => data.get(userId ?? '') ?? null),
  write: vi.fn(async (_key: string, value: unknown, userId?: string) => { data.set(userId ?? '', value); return { ok:true as const } }),
}
vi.stubGlobal('window', { vethos:{ storage } })

describe('user model storage', () => {
  beforeEach(() => data.clear())
  it('isole save/load/clear par userId et conserve les corrections permanentes au prune', async () => {
    const { clearUserModel, loadUserModel, pruneUserModelHistory, saveUserModel } = await import('./user-model-storage')
    await saveUserModel(buildEmptyUserModel('a'), storage as never)
    await saveUserModel(buildEmptyUserModel('b'), storage as never)
    expect((await loadUserModel('a', storage as never))?.userId).toBe('a')
    await clearUserModel('a', storage as never)
    expect((await loadUserModel('b', storage as never))?.userId).toBe('b')
    const base = buildEmptyUserModel('a')
    const model: UserModel = { ...base, corrections:[{ id:'permanent', type:'coach_wrong', targetType:'user_model', strength:'permanent', createdAt:'2026-01-01T00:00:00.000Z' }, { id:'weak', type:'coach_right', targetType:'user_model', strength:'weak', createdAt:'2026-02-01T00:00:00.000Z' }] }
    expect(pruneUserModelHistory(model, { correctionLimit:1 }).corrections[0]?.id).toBe('permanent')
  })
  it('rejette un modèle corrompu ou appartenant à un autre utilisateur', async () => {
    const { migrateUserModelIfNeeded } = await import('./user-model-storage')
    expect(migrateUserModelIfNeeded({ nope:true }, 'a')).toBeNull()
    expect(migrateUserModelIfNeeded(buildEmptyUserModel('b'), 'a')).toBeNull()
  })
})
