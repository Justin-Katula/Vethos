import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { scanBrowserHistoryDomains } from './browser-history'

describe('scanBrowserHistoryDomains', () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'vethos-history-'))
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('extracts unique domains from browser SQLite bytes best-effort', async () => {
    const history = join(dir, 'History')
    await fs.writeFile(
      history,
      'SQLite format 3\0https://www.youtube.com/watch?v=1\0https://github.com/openai/codex',
      'latin1',
    )

    await expect(scanBrowserHistoryDomains([history], 1)).resolves.toEqual([
      'github.com',
      'youtube.com',
    ])
  })
})
