import { create } from 'zustand'
import { nexus } from '@/lib/ipc'
import { assertStorageWrite } from '@/lib/storage-write'
import type { AuthAccount, AuthSession, AuthState as PersistedAuthState } from '@shared/schemas'
import { useToastStore } from './toast.store'

const PASSWORD_MIN_LENGTH = 8
const PBKDF2_ITERATIONS = 180_000
const HASH_BITS = 256
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type SignUpInput = {
  name: string
  email: string
  password: string
}

type SignInInput = {
  email: string
  password: string
}

type AuthStore = {
  loaded: boolean
  account: AuthAccount | null
  session: AuthSession | null
  isAuthenticated: boolean

  load: () => Promise<void>
  signUp: (input: SignUpInput) => Promise<void>
  signIn: (input: SignInInput) => Promise<void>
  signOut: () => Promise<void>
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function assertCryptoAvailable(): Crypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Le chiffrement local n'est pas disponible sur cet appareil.")
  }
  return globalThis.crypto
}

function bytesToBase64(bytes: Uint8Array<ArrayBufferLike>): string {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function constantTimeEqual(leftBase64: string, rightBase64: string): boolean {
  const left = base64ToBytes(leftBase64)
  const right = base64ToBytes(rightBase64)
  if (left.length !== right.length) return false

  let diff = 0
  for (let i = 0; i < left.length; i += 1) {
    diff |= left[i]! ^ right[i]!
  }
  return diff === 0
}

function createSalt(): string {
  const crypto = assertCryptoAvailable()
  const salt = new Uint8Array(16)
  crypto.getRandomValues(salt)
  return bytesToBase64(salt)
}

async function derivePasswordHash(password: string, saltBase64: string): Promise<string> {
  const crypto = assertCryptoAvailable()
  const encodedPassword = new TextEncoder().encode(password)
  const key = await crypto.subtle.importKey('raw', encodedPassword, 'PBKDF2', false, [
    'deriveBits',
  ])
  const hash = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: base64ToBytes(saltBase64),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    key,
    HASH_BITS,
  )
  return bytesToBase64(new Uint8Array(hash))
}

function isSessionValid(account: AuthAccount | null, session: AuthSession | null): boolean {
  return Boolean(account && session && session.accountId === account.id)
}

function validateIdentity(name: string, email: string, password: string): void {
  if (!name.trim()) {
    throw new Error('Indique un nom pour ton compte.')
  }
  if (!EMAIL_REGEX.test(email)) {
    throw new Error('Entre une adresse email valide.')
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`)
  }
}

function validateSignIn(email: string, password: string): void {
  if (!EMAIL_REGEX.test(email) || !password) {
    throw new Error('Email ou mot de passe incorrect.')
  }
}

function notifyPersistError(err: unknown): void {
  useToastStore.getState().push({
    variant: 'error',
    title: 'Sauvegarde auth échouée',
    description: err instanceof Error ? err.message : String(err),
  })
}

async function persistAuth(state: PersistedAuthState): Promise<void> {
  try {
    const result = await nexus.storage.write<PersistedAuthState>('auth', state)
    assertStorageWrite(result, 'auth')
  } catch (err) {
    notifyPersistError(err)
    throw err
  }
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  loaded: false,
  account: null,
  session: null,
  isAuthenticated: false,

  async load() {
    const stored = await nexus.storage.read<PersistedAuthState>('auth')
    const account = stored?.account ?? null
    const session = isSessionValid(account, stored?.session ?? null) ? stored!.session : null

    set({
      loaded: true,
      account,
      session,
      isAuthenticated: isSessionValid(account, session),
    })
  },

  async signUp({ name, email, password }) {
    const normalizedEmail = normalizeEmail(email)
    validateIdentity(name, normalizedEmail, password)

    if (get().account) {
      throw new Error('Un compte existe déjà sur cette installation.')
    }

    const now = new Date().toISOString()
    const salt = createSalt()
    const account: AuthAccount = {
      id: crypto.randomUUID(),
      name: name.trim(),
      email: normalizedEmail,
      passwordSalt: salt,
      passwordHash: await derivePasswordHash(password, salt),
      createdAt: now,
      updatedAt: now,
    }
    const session: AuthSession = {
      accountId: account.id,
      signedInAt: now,
    }

    await persistAuth({ account, session })
    set({ account, session, loaded: true, isAuthenticated: true })
  },

  async signIn({ email, password }) {
    const normalizedEmail = normalizeEmail(email)
    validateSignIn(normalizedEmail, password)

    const account = get().account
    if (!account) {
      throw new Error("Crée d'abord ton compte Nexus.")
    }
    if (account.email !== normalizedEmail) {
      throw new Error('Email ou mot de passe incorrect.')
    }

    const attemptedHash = await derivePasswordHash(password, account.passwordSalt)
    if (!constantTimeEqual(attemptedHash, account.passwordHash)) {
      throw new Error('Email ou mot de passe incorrect.')
    }

    const session: AuthSession = {
      accountId: account.id,
      signedInAt: new Date().toISOString(),
    }

    await persistAuth({ account, session })
    set({ session, loaded: true, isAuthenticated: true })
  },

  async signOut() {
    const account = get().account
    await persistAuth({ account, session: null })
    set({ session: null, loaded: true, isAuthenticated: false })
  },
}))
