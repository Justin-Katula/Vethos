import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/ipc', () => ({
  nexus: {
    storage: {
      read: vi.fn(),
      write: vi.fn(),
      exists: vi.fn(),
    },
  },
}))

import { nexus } from '@/lib/ipc'
import { useAuthStore } from './auth.store'

const mockStorage = nexus.storage as unknown as {
  read: ReturnType<typeof vi.fn>
  write: ReturnType<typeof vi.fn>
  exists: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  mockStorage.read.mockReset()
  mockStorage.write.mockReset()
  mockStorage.exists.mockReset()
  mockStorage.write.mockResolvedValue({ ok: true })
  useAuthStore.setState({
    loaded: false,
    account: null,
    session: null,
    isAuthenticated: false,
  })
})

describe('useAuthStore', () => {
  it('load() depuis storage vide garde la session inactive', async () => {
    mockStorage.read.mockResolvedValue(null)

    await useAuthStore.getState().load()

    expect(useAuthStore.getState()).toMatchObject({
      loaded: true,
      account: null,
      session: null,
      isAuthenticated: false,
    })
  })

  it('signUp() crée un compte, hash le mot de passe et persiste la session', async () => {
    await useAuthStore.getState().signUp({
      name: 'Obedi',
      email: 'OBEDI@example.com',
      password: 'super-secret',
    })

    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.account?.email).toBe('obedi@example.com')
    expect(state.account?.passwordHash).toBeTruthy()
    expect(state.account?.passwordHash).not.toBe('super-secret')
    expect(state.account?.passwordSalt).toBeTruthy()
    expect(mockStorage.write).toHaveBeenCalledWith(
      'auth',
      expect.objectContaining({
        account: expect.objectContaining({ email: 'obedi@example.com' }),
        session: expect.objectContaining({ accountId: state.account?.id }),
      }),
    )
  })

  it('signIn() restaure une session avec le bon mot de passe', async () => {
    await useAuthStore.getState().signUp({
      name: 'Obedi',
      email: 'obedi@example.com',
      password: 'super-secret',
    })
    const account = useAuthStore.getState().account
    useAuthStore.setState({ account, session: null, isAuthenticated: false, loaded: true })
    mockStorage.write.mockClear()

    await useAuthStore.getState().signIn({
      email: 'OBEDI@example.com',
      password: 'super-secret',
    })

    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(mockStorage.write).toHaveBeenCalledWith(
      'auth',
      expect.objectContaining({
        account,
        session: expect.objectContaining({ accountId: account?.id }),
      }),
    )
  })

  it('signIn() rejette un mauvais mot de passe', async () => {
    await useAuthStore.getState().signUp({
      name: 'Obedi',
      email: 'obedi@example.com',
      password: 'super-secret',
    })
    const account = useAuthStore.getState().account
    useAuthStore.setState({ account, session: null, isAuthenticated: false, loaded: true })

    await expect(
      useAuthStore.getState().signIn({
        email: 'obedi@example.com',
        password: 'wrong-password',
      }),
    ).rejects.toThrow('Email ou mot de passe incorrect.')
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('signOut() conserve le compte et efface la session persistée', async () => {
    await useAuthStore.getState().signUp({
      name: 'Obedi',
      email: 'obedi@example.com',
      password: 'super-secret',
    })
    mockStorage.write.mockClear()

    await useAuthStore.getState().signOut()

    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(useAuthStore.getState().account?.email).toBe('obedi@example.com')
    expect(mockStorage.write).toHaveBeenCalledWith(
      'auth',
      expect.objectContaining({
        account: expect.objectContaining({ email: 'obedi@example.com' }),
        session: null,
      }),
    )
  })
})

