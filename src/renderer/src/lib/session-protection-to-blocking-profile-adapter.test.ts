import { describe, expect, it } from 'vitest'
import { buildBlockingProfileDraftFromSessionProtection } from './session-protection-to-blocking-profile-adapter'
import { sessionPlanFixture } from './session-test-fixtures'

describe('session-protection-to-blocking-profile-adapter', () => {
  it('maps the session protection plan without side effects', () => {
    const sessionPlan = sessionPlanFixture()
    sessionPlan.protection = {
      ...sessionPlan.protection,
      usefulApps: ['vscode.exe'], usefulSites: ['github.com'],
      blockedApps: ['discord.exe'], blockedSites: ['youtube.com'], conditionalApps: ['slack.exe'],
    }
    const draft = buildBlockingProfileDraftFromSessionProtection({ sessionPlan })
    expect(draft.apps.allow).toContain('vscode.exe')
    expect(draft.apps.block).toContain('discord.exe')
    expect(draft.apps.conditional).toContain('slack.exe')
    expect(draft.sites.allow).toContain('github.com')
    expect(draft.unlockPolicy).toBe('cooldown')
  })

  it('never emits an empty allowlist profile', () => {
    const sessionPlan = sessionPlanFixture()
    sessionPlan.protection = {
      ...sessionPlan.protection, mode: 'strict_allowlist', usefulApps: [], usefulSites: [],
      blockedApps: [], blockedSites: [],
    }
    const draft = buildBlockingProfileDraftFromSessionProtection({ sessionPlan })
    expect(draft.mode).toBe('blocklist')
    expect(draft.warnings).toContain('Allowlist vide refusée : repli sûr vers blocklist sans blocage global.')
  })
})
