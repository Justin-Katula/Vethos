import { describe, expect, it } from 'vitest'
import { buildAppLockerPolicyXml } from './policy'

describe('buildAppLockerPolicyXml', () => {
  it('creates deny file path rules for unique exe names', () => {
    const xml = buildAppLockerPolicyXml(['chrome.exe', 'C:\\Tools\\chrome.exe', 'Discord.exe'], 'AuditOnly')

    expect(xml).toContain('EnforcementMode="AuditOnly"')
    expect(xml).toContain('Action="Deny"')
    expect(xml.match(/Nexus block chrome\.exe/g)).toHaveLength(1)
    expect(xml).toContain('Nexus block Discord.exe')
    expect(xml).toContain('Path="*\\chrome.exe"')
  })

  it('includes default allow rules to avoid locking down Windows globally', () => {
    const xml = buildAppLockerPolicyXml(['Code.exe'], 'Enabled')

    expect(xml).toContain('Nexus allow Windows')
    expect(xml).toContain('%WINDIR%\\*')
    expect(xml).toContain('Nexus allow Program Files')
  })
})
