import { describe, expect, it } from 'vitest'
import { buildUserModelSnapshot } from './user-model-snapshot'
import { buildEmptyUserModel } from '@shared/user-model'
import { buildOnboardingResult } from '@shared/onboarding-model'

describe('user model snapshot', () => {
  it('reconstruit un snapshot déterministe et immuable depuis les vraies sources', () => {
    const input = { userId:'user-1', now:'2026-07-02T00:00:00.000Z', objectives:[{ id:'o1', level:7, createdAt:'2026-06-01T00:00:00.000Z' }], tasks:[{ id:'t1', linkedObjectiveId:'o1', status:'completed', completedAt:'2026-07-01T00:00:00.000Z' }], sessions:[], appRegistry:[], siteRegistry:[] }
    const before = JSON.stringify(input)
    const first = buildUserModelSnapshot(input)
    const second = buildUserModelSnapshot(input)
    expect(first).toEqual(second)
    expect(first.userId).toBe('user-1')
    expect(first.objectivePreferences[0]?.momentumScore).toBeGreaterThan(0)
    expect(JSON.stringify(input)).toBe(before)
  })
  it('fusionne l’onboarding dans un modèle déjà chargé', () => {
    const result = buildUserModelSnapshot({
      userId:'user-1', previousModel:buildEmptyUserModel('user-1', { now:'2026-07-01T00:00:00.000Z' }),
      onboardingResult:buildOnboardingResult({ createdAt:'2026-07-02T00:00:00.000Z', firstObjective:{ statement:'objectif central', importance:'central' } }),
      now:'2026-07-02T00:00:00.000Z',
    })
    expect(result.disciplineCommitments.length).toBeGreaterThan(0)
    expect(result.objectivePreferences[0]?.declaredImportanceScore).toBe(100)
  })
})
