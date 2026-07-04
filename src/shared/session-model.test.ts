import { describe, expect, it } from 'vitest'
import { sessionFlags } from './session-flags'

describe('session-model contracts', () => {
  it('activates all seven runtime controls by default', () => {
    expect(sessionFlags.sessionControlsDisplay).toBe(true)
    expect(sessionFlags.sessionControlsSessionStore).toBe(true)
    expect(sessionFlags.sessionControlsTimer).toBe(true)
    expect(sessionFlags.sessionControlsBlocking).toBe(true)
    expect(sessionFlags.sessionControlsOverlay).toBe(true)
    expect(sessionFlags.sessionControlsCompletion).toBe(true)
    expect(sessionFlags.sessionControlsAutoStart).toBe(true)
  })

  it('contains no temporary vocabulary in the public flags', () => {
    expect(Object.keys(sessionFlags).join(' ')).not.toMatch(/shadow/iu)
  })
})
