import { describe, expect, it } from 'vitest'
import { canUserModelControl, DEFAULT_USER_MODEL_FLAGS } from './user-model-flags'

describe('user model flags', () => {
  it('active la collecte mais aucun contrôle sensible par défaut', () => {
    expect(DEFAULT_USER_MODEL_FLAGS.userModelEnabled).toBe(true)
    expect(DEFAULT_USER_MODEL_FLAGS.userEventCollectorEnabled).toBe(true)
    expect(canUserModelControl('planning')).toBe(false)
    expect(canUserModelControl('blocking')).toBe(false)
    expect(JSON.stringify(DEFAULT_USER_MODEL_FLAGS).toLowerCase()).not.toContain('shadow')
  })
})
