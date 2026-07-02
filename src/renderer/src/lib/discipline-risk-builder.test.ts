import { describe, expect, it } from 'vitest'
import { buildDisciplineModel } from './discipline-risk-builder'

describe('discipline risk builder', () => {
  it('produit des risques expliqués et normalise les sites', () => {
    const events = Array.from({length:5}, (_, index) => ({ id:`e${index}`, type:'site_opened_during_session' as const, targetType:'site' as const, targetId:'https://example.test/private?token=x', createdAt:'2026-07-01T12:00:00.000Z' }))
    const model = buildDisciplineModel(events)
    expect(model.riskySites[0]?.domain).toBe('example.test')
    expect(model.riskySites[0]?.reasons.length).toBeGreaterThan(0)
    expect(model.globalDistractionRisk).toBeGreaterThan(20)
  })
})
