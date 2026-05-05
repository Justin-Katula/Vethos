import { describe, it, expect } from 'vitest'
import {
  TEMPLATES,
  applyTemplate,
  type TemplateId,
} from './onboarding-templates'
import { hasOverlap } from './schedule-selectors'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

describe('TEMPLATES', () => {
  it('contient 3 templates : student, pro, balanced', () => {
    expect(TEMPLATES).toHaveLength(3)
    const ids = TEMPLATES.map((t) => t.id)
    expect(ids).toContain('student')
    expect(ids).toContain('pro')
    expect(ids).toContain('balanced')
  })

  it.each<TemplateId>(['student', 'pro', 'balanced'])(
    'template "%s" : ≥3 règles, ≥6 entrées, pas de chevauchement',
    (id) => {
      const tpl = TEMPLATES.find((t) => t.id === id)!
      expect(tpl.rules.length).toBeGreaterThanOrEqual(3)
      expect(tpl.entries.length).toBeGreaterThanOrEqual(6)

      // No overlap
      const accumulated: Array<{
        id: string
        createdAt: string
        ruleId: string
        dayOfWeek: number
        startMinute: number
        endMinute: number
      }> = []
      for (const e of tpl.entries) {
        expect(
          hasOverlap(accumulated, {
            dayOfWeek: e.dayOfWeek,
            startMinute: e.startMinute,
            endMinute: e.endMinute,
          }),
        ).toBe(false)
        accumulated.push({
          id: `tmp-${accumulated.length}`,
          createdAt: new Date().toISOString(),
          ruleId: e.ruleId,
          dayOfWeek: e.dayOfWeek,
          startMinute: e.startMinute,
          endMinute: e.endMinute,
        })
      }
    },
  )

  it.each<TemplateId>(['student', 'pro', 'balanced'])(
    'template "%s" : chaque entry référence un ruleId existant',
    (id) => {
      const tpl = TEMPLATES.find((t) => t.id === id)!
      const ruleIds = new Set(tpl.rules.map((r) => r.id))
      for (const e of tpl.entries) {
        expect(ruleIds.has(e.ruleId)).toBe(true)
      }
    },
  )
})

describe('applyTemplate', () => {
  it('régénère tous les UUIDs de règles et entrées', () => {
    const tpl = TEMPLATES[0]!
    const out = applyTemplate(tpl)
    for (const r of out.rules) expect(r.id).toMatch(UUID_RE)
    for (const e of out.entries) expect(e.id).toMatch(UUID_RE)
  })

  it('préserve le mapping rule → entries', () => {
    const tpl = TEMPLATES[0]!
    const out = applyTemplate(tpl)

    // Pour chaque entry du template original, on retrouve l'entry correspondante
    // dans out.entries (même position) liée à la nouvelle règle correspondante.
    for (let i = 0; i < tpl.entries.length; i++) {
      const original = tpl.entries[i]!
      const applied = out.entries[i]!
      const originalRule = tpl.rules.find((r) => r.id === original.ruleId)!
      const appliedRule = out.rules.find((r) => r.id === applied.ruleId)!
      expect(appliedRule.name).toBe(originalRule.name)
      expect(appliedRule.color).toBe(originalRule.color)
    }
  })

  it('produit des règles et entrées toutes datées createdAt ISO', () => {
    const tpl = TEMPLATES[0]!
    const out = applyTemplate(tpl)
    for (const r of out.rules) expect(() => new Date(r.createdAt).toISOString()).not.toThrow()
    for (const e of out.entries) expect(() => new Date(e.createdAt).toISOString()).not.toThrow()
  })

  it('appels successifs génèrent des UUIDs différents', () => {
    const tpl = TEMPLATES[0]!
    const a = applyTemplate(tpl)
    const b = applyTemplate(tpl)
    const aIds = new Set(a.rules.map((r) => r.id))
    for (const r of b.rules) expect(aIds.has(r.id)).toBe(false)
  })
})
