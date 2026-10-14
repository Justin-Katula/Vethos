import { describe, expect, it } from 'vitest'
import { PALETTE_OBJECTIFS, PALETTE_TACHES } from '@shared/palettes'
import { traitDe, VISIBLES } from './couleurs-engagement'

/** Luminance relative WCAG d'un #rrggbb. */
function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!
}

describe('couleurs des engagements', () => {
  it('deux engagements de même nature n’ont pas la même couleur', () => {
    expect(traitDe('GOAL', PALETTE_OBJECTIFS[0])).not.toBe(traitDe('GOAL', PALETTE_OBJECTIFS[1]))
    expect(new Set(VISIBLES.GOAL).size).toBe(12)
    expect(new Set(VISIBLES.TASK).size).toBe(12)
    expect(new Set(VISIBLES.ANCHOR).size).toBe(12)
  })

  it('le quasi-noir rangé reste visible sur le fond noir', () => {
    // #111215 est dans la palette des tâches : affiché tel quel, il disparaîtrait.
    const affiche = traitDe('TASK', PALETTE_TACHES[2])
    expect((luminance(affiche) + 0.05) / 0.05).toBeGreaterThan(3)
  })

  it('tous les tons affichés contrastent sur le noir', () => {
    for (const l of Object.values(VISIBLES)) for (const c of l) expect((luminance(c) + 0.05) / 0.05).toBeGreaterThan(3)
  })

  it('sans couleur rangée, un même identifiant donne toujours le même ton', () => {
    expect(traitDe('ANCHOR', null, 'abc')).toBe(traitDe('ANCHOR', undefined, 'abc'))
  })
})
