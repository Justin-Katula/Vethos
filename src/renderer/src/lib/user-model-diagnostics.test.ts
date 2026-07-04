import { describe, expect, it } from 'vitest'
import { buildEmptyUserModel } from '@shared/user-model'
import { runUserModelDiagnostics } from './user-model-diagnostics'

describe('user model diagnostics', () => {
  it('détecte score hors limite, risque sans raison et URL complète', () => {
    const base = buildEmptyUserModel('user-1')
    const model = { ...base, disciplineModel:{ ...base.disciplineModel, globalDistractionRisk:120, reasons:[] }, appSitePreferences:[{ identifier:'https://example.test/private', kind:'site' as const, contextRules:[], updatedAt:base.metadata.updatedAt }] }
    const result = runUserModelDiagnostics(model)
    expect(result.status).toBe('warning')
    expect(result.issues.some((issue)=>issue.id.startsWith('score-out-of-range'))).toBe(true)
    expect(result.issues.some((issue)=>issue.id.startsWith('full-url'))).toBe(true)
  })
})
