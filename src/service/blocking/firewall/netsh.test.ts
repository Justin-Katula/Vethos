import { describe, it, expect } from 'vitest'
import { parseNetshShowRules, ruleNameFor } from './netsh'

const FIXTURE = `

Rule Name:                            Vethos_Block_abc123_chrome.exe
----------------------------------------------------------------------
Enabled:                              Yes
Direction:                            Out
Profiles:                             Domain,Private,Public
Action:                               Block

Rule Name:                            SomeOtherRule
----------------------------------------------------------------------
Enabled:                              Yes
`

describe('parseNetshShowRules', () => {
  it('extracts rule names', () => {
    expect(parseNetshShowRules(FIXTURE)).toEqual([
      'Vethos_Block_abc123_chrome.exe',
      'SomeOtherRule',
    ])
  })

  it('returns empty array on no match', () => {
    expect(parseNetshShowRules('No rules')).toEqual([])
  })
})

describe('ruleNameFor', () => {
  it('builds a stable rule name', () => {
    expect(ruleNameFor('abc-123', 'C:\\foo\\bar.exe')).toBe('Vethos_Block_abc-123_bar.exe')
  })
})
