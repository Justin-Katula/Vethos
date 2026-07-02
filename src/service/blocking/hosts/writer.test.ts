import { describe, it, expect } from 'vitest'
import { renderVethosBlock } from './writer'
import { SENTINEL_BEGIN, SENTINEL_END } from './sentinels'

describe('renderVethosBlock', () => {
  it('renders sentinels and entries', () => {
    const out = renderVethosBlock({
      sessionId: 'abc-123',
      startedAt: '2026-05-04T10:00:00Z',
      domains: ['facebook.com', 'twitter.com'],
    })
    expect(out).toContain(SENTINEL_BEGIN)
    expect(out).toContain(SENTINEL_END)
    expect(out).toContain('# session: abc-123')
    expect(out).toContain('127.0.0.1 facebook.com')
    expect(out).toContain('127.0.0.1 www.facebook.com')
    expect(out).toContain('::1 facebook.com')
    expect(out).toContain('::1 m.twitter.com')
  })

  it('produces a block when no domains', () => {
    const out = renderVethosBlock({
      sessionId: 'x',
      startedAt: '2026-05-04T10:00:00Z',
      domains: [],
    })
    expect(out).toContain(SENTINEL_BEGIN)
    expect(out).toContain(SENTINEL_END)
  })

  it('is idempotent (same input → same output)', () => {
    const args = {
      sessionId: 'a',
      startedAt: '2026-05-04T10:00:00Z',
      domains: ['x.com'],
    }
    expect(renderVethosBlock(args)).toBe(renderVethosBlock(args))
  })
})
