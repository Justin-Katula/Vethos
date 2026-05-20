import { describe, it, expect } from 'vitest'
import { loadColor } from './load-heatmap'

describe('loadColor', () => {
  it('jour le plus libre (max) → vert', () => {
    expect(loadColor(600, 100, 600)).toBe('#22c55e')
  })

  it('jour le plus chargé (min) → rouge', () => {
    expect(loadColor(100, 100, 600)).toBe('#ef4444')
  })

  it('milieu de l échelle → jaune', () => {
    expect(loadColor(350, 100, 600)).toBe('#eab308')
  })

  it('tous les jours identiques (min === max) → vert', () => {
    expect(loadColor(300, 300, 300)).toBe('#22c55e')
  })

  it('clampe sous le min → rouge', () => {
    expect(loadColor(50, 100, 600)).toBe('#ef4444')
  })

  it('clampe au-dessus du max → vert', () => {
    expect(loadColor(700, 100, 600)).toBe('#22c55e')
  })
})
