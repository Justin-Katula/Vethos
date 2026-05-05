import { describe, it, expect } from 'vitest'
import { parseTasklistCsv } from './enumerator'

const FIXTURE = `"explorer.exe","1234","Console","1","45,123 K"
"chrome.exe","5678","Console","1","123,456 K"
"chrome.exe","5680","Console","1","98,000 K"
`

describe('parseTasklistCsv', () => {
  it('parses CSV rows into Process objects', () => {
    const rows = parseTasklistCsv(FIXTURE)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual({ name: 'explorer.exe', pid: 1234 })
    expect(rows[1]).toEqual({ name: 'chrome.exe', pid: 5678 })
  })

  it('ignores empty lines and bad rows', () => {
    const rows = parseTasklistCsv('\n\n"bad"\n"chrome.exe","1","Console","1","1 K"\n')
    expect(rows).toEqual([{ name: 'chrome.exe', pid: 1 }])
  })

  it('lowercases names for matching', () => {
    const rows = parseTasklistCsv('"NotePad.EXE","9","Console","1","1 K"\n')
    expect(rows[0]?.name).toBe('notepad.exe')
  })
})
