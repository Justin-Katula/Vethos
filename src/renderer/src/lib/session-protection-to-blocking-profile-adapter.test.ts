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

  // CORR 1 — Résolution de contradictions allow/block (Point 9.7).
  it('résout les contradictions allow/block : une cible n\'est jamais dans les deux listes', () => {
    const sessionPlan = sessionPlanFixture()
    sessionPlan.protection = {
      ...sessionPlan.protection,
      mode: 'allowlist',
      // "vscode.exe" est à la fois utile et bloqué — contradiction.
      usefulApps: ['vscode.exe', 'terminal.exe'],
      blockedApps: ['vscode.exe', 'discord.exe'],
      usefulSites: ['github.com'],
      blockedSites: ['github.com', 'youtube.com'],
    }
    const draft = buildBlockingProfileDraftFromSessionProtection({ sessionPlan })

    // En mode allowlist, allow gagne : vscode reste dans allow, plus dans block.
    expect(draft.apps.allow).toContain('vscode.exe')
    expect(draft.apps.block).not.toContain('vscode.exe')
    expect(draft.sites.allow).toContain('github.com')
    expect(draft.sites.block).not.toContain('github.com')
    // Un warning explique la décision.
    expect(draft.warnings.some((w) => w.includes('résolu en faveur de allow'))).toBe(true)
    // discord reste bloqué (pas de conflit).
    expect(draft.apps.block).toContain('discord.exe')
  })

  it('résout les contradictions en faveur de block en mode blocklist', () => {
    const sessionPlan = sessionPlanFixture()
    sessionPlan.protection = {
      ...sessionPlan.protection,
      mode: 'blocklist',
      usefulApps: ['vscode.exe'],
      blockedApps: ['vscode.exe'],
      usefulSites: [],
      blockedSites: [],
    }
    const draft = buildBlockingProfileDraftFromSessionProtection({ sessionPlan })
    // En mode blocklist, block gagne.
    expect(draft.apps.block).toContain('vscode.exe')
    expect(draft.warnings.some((w) => w.includes('résolu en faveur de block'))).toBe(true)
  })

  // CORR 2 — strict_allowlist : vérifier apps OU sites vides.
  it('repli vers blocklist si strict_allowlist sans sites utiles (apps présentes)', () => {
    const sessionPlan = sessionPlanFixture()
    sessionPlan.protection = {
      ...sessionPlan.protection,
      mode: 'strict_allowlist',
      usefulApps: ['vscode.exe'], // apps présentes
      usefulSites: [],             // mais aucun site utile → dangereux
      blockedApps: [],
      blockedSites: [],
    }
    const draft = buildBlockingProfileDraftFromSessionProtection({ sessionPlan })
    expect(draft.mode).toBe('blocklist')
    expect(draft.warnings.some((w) => w.includes('Allowlist vide refusée'))).toBe(true)
  })
})
