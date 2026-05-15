import { describe, it, expect } from 'vitest'
import { TEMPLATES, applyTemplate } from './onboarding-templates'
import { hasOverlap } from './schedule-selectors'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * V2 P2 : les 3 templates STUDENT / PRO / BALANCED ont été remplacés
 * par un seul template `BASE` (id conservé `'student'` pour rétrocompat).
 * L'onboarding fait désormais saisir l'utilisateur directement plutôt
 * que choisir parmi des presets.
 *
 * Ce fichier teste seulement l'invariant structurel du template et le
 * comportement de `applyTemplate` (UUID regen, mapping rule→entry, dates).
 */

describe('TEMPLATES (V2 P2 — single BASE template)', () => {
  it('contient au moins un template (BASE)', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(1)
  })

  it('chaque template référence ses propres ruleIds dans ses entries', () => {
    for (const tpl of TEMPLATES) {
      const ruleIds = new Set(tpl.rules.map((r) => r.id))
      for (const e of tpl.entries) {
        expect(ruleIds.has(e.ruleId)).toBe(true)
      }
    }
  })

  it("les entries de chaque template n'ont pas de chevauchement intra-template", () => {
    for (const tpl of TEMPLATES) {
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
    }
  })
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
