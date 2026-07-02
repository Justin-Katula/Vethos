import { describe, expect, it } from 'vitest'
import { buildAppLockerPolicyXml, pickBlockingStrategy } from './policy'

describe('buildAppLockerPolicyXml', () => {
  it('creates deny file path rules for unique exe names', () => {
    const xml = buildAppLockerPolicyXml(['chrome.exe', 'C:\\Tools\\chrome.exe', 'Discord.exe'], 'AuditOnly')

    expect(xml).toContain('EnforcementMode="AuditOnly"')
    expect(xml).toContain('Action="Deny"')
    expect(xml.match(/Vethos block chrome\.exe/g)).toHaveLength(1)
    expect(xml).toContain('Vethos block Discord.exe')
    expect(xml).toContain('Path="*\\chrome.exe"')
  })

  it('includes default allow rules to avoid locking down Windows globally', () => {
    const xml = buildAppLockerPolicyXml(['Code.exe'], 'Enabled')

    expect(xml).toContain('Vethos allow Windows')
    expect(xml).toContain('%WINDIR%\\*')
    expect(xml).toContain('Vethos allow Program Files')
  })
})

describe('pickBlockingStrategy', () => {
  it('uses AppLocker when elevated and edition supports it', () => {
    expect(
      pickBlockingStrategy({
        elevated: true,
        strictBlocking: true,
        edition: {
          productName: 'Windows 11 Pro',
          editionId: 'Professional',
          supportsAppLocker: true,
        },
      }),
    ).toEqual({ processLayer: 'applocker', appLockerMode: 'Enabled' })
  })

  it('stays unavailable on unsupported editions', () => {
    expect(
      pickBlockingStrategy({
        elevated: true,
        strictBlocking: false,
        edition: {
          productName: 'Windows 11 Home',
          editionId: 'Core',
          supportsAppLocker: false,
        },
      }),
    ).toMatchObject({ processLayer: 'unavailable', appLockerMode: 'AuditOnly' })
  })
})
