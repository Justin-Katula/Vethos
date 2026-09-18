import { describe, expect, it } from 'vitest'
import { activeSessionAt, blockSessionIsActiveAt, type BlockSession } from './schedule'

const start = new Date(2026, 6, 29, 10, 0, 0, 0).getTime()

function block(overrides: Partial<BlockSession> = {}): BlockSession {
  return {
    blockId: 'task-1',
    startedAt: start,
    endsAt: start + 30 * 60_000,
    appIds: ['discord.exe'],
    blockedSites: [],
    ...overrides,
  }
}

describe('blockSessionIsActiveAt', () => {
  it('utilise une fenêtre semi-ouverte', () => {
    const session = block()
    expect(blockSessionIsActiveAt(session, new Date(start))).toBe(true)
    expect(blockSessionIsActiveAt(session, new Date(start + 29 * 60_000))).toBe(true)
    expect(blockSessionIsActiveAt(session, new Date(session.endsAt))).toBe(false)
  })

  it('refuse une durée nulle ou inversée', () => {
    expect(blockSessionIsActiveAt(block({ endsAt: start }), new Date(start))).toBe(false)
    expect(blockSessionIsActiveAt(block({ endsAt: start - 1 }), new Date(start))).toBe(false)
  })
})

describe('activeSessionAt', () => {
  it('ne dérive la session que du bloc de planning confirmé', () => {
    expect(activeSessionAt({ block: block() }, new Date(start + 1_000))).toEqual({
      blockedAppIds: ['discord.exe'],
      blockedSites: [],
      endsAt: start + 30 * 60_000,
    })
  })

  it('ignore les anciennes sessions manuelles et récurrentes persistées', () => {
    const legacy = {
      block: null,
      manual: { startedAt: start, endsAt: start + 60_000, appIds: ['steam.exe'] },
      slots: [{ appIds: ['spotify.exe'] }],
    }
    expect(activeSessionAt(legacy, new Date(start))).toBeNull()
  })

  it('dédoublonne les applications et les sites du bloc', () => {
    const session = block({
      appIds: ['discord.exe', 'discord.exe'],
      blockedSites: ['youtube.com', 'youtube.com'],
    })
    expect(activeSessionAt({ block: session }, new Date(start))?.blockedAppIds).toEqual([
      'discord.exe',
    ])
    expect(activeSessionAt({ block: session }, new Date(start))?.blockedSites).toEqual([
      'youtube.com',
    ])
  })
})
