import { describe, expect, it } from 'vitest'
import type { SessionPlan } from '@shared/engine-results'
import { explainAppAccess } from './access-explanation'

describe('access explanation', () => {
  it('explique une app absente de l’allowlist pendant une protection forte', () => {
    const plan: SessionPlan = { targetType:'session', targetId:'s1', durationMinutes:60, protectionLevel:90, mode:'allowlist', allowedApps:['editor.exe'], allowedSites:[], blockedApps:[], blockedSites:[], unlockPolicy:{ type:'none' }, reasons:[], confidence:90 }
    const result = explainAppAccess('other.exe', plan)
    expect(result.access).toBe('blocked')
    expect(result.reasons.join(' ')).toContain('pas requis')
    expect(result.reasons.join(' ')).toContain('protection forte')
  })
})
