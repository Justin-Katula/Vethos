import { describe, it, expect } from 'vitest'
import { parseHostsFile } from './parser'
import { SENTINEL_BEGIN, SENTINEL_END } from './sentinels'

const PLAIN = `# Copyright (c) 1993-2009 Microsoft Corp.\n127.0.0.1 localhost\n`

const WITH_BLOCK = `${PLAIN}${SENTINEL_BEGIN}\n# session: abc | started: 2026-05-04T10:00:00Z\n127.0.0.1 facebook.com\n::1 facebook.com\n${SENTINEL_END}\nfooter\n`

describe('parseHostsFile', () => {
  it('returns null block when no sentinels present', () => {
    const r = parseHostsFile(PLAIN)
    expect(r.nexusBlock).toBeNull()
    expect(r.outside).toBe(PLAIN)
  })

  it('extracts the block when sentinels present', () => {
    const r = parseHostsFile(WITH_BLOCK)
    expect(r.nexusBlock).not.toBeNull()
    expect(r.nexusBlock!.entries).toEqual([
      { ip: '127.0.0.1', host: 'facebook.com' },
      { ip: '::1', host: 'facebook.com' },
    ])
    expect(r.nexusBlock!.sessionId).toBe('abc')
    expect(r.outside).toContain('# Copyright')
    expect(r.outside).toContain('footer')
    expect(r.outside).not.toContain('facebook.com')
  })

  it('handles CRLF line endings', () => {
    const crlf = WITH_BLOCK.replace(/\n/g, '\r\n')
    const r = parseHostsFile(crlf)
    expect(r.nexusBlock?.entries.length).toBe(2)
  })

  it('strips UTF-8 BOM', () => {
    const r = parseHostsFile('\uFEFF' + WITH_BLOCK)
    expect(r.nexusBlock?.entries.length).toBe(2)
  })

  it('treats double Nexus block as corruption — keeps first, drops second from outside', () => {
    const dbl = WITH_BLOCK + WITH_BLOCK
    const r = parseHostsFile(dbl)
    expect(r.nexusBlock).not.toBeNull()
    expect(r.outside).not.toContain(SENTINEL_BEGIN)
    expect(r.outside).not.toContain(SENTINEL_END)
  })
})
