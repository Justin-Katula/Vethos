import { describe, expect, it } from 'vitest'
import { positionMinute, projectionIntervalle } from './carte-semaine'

describe('projection de la carte de semaine', () => {
  it('place le milieu de la journée au milieu de la carte', () => {
    expect(positionMinute(12 * 60, 6 * 60, 18 * 60, 300)).toBe(150)
  })

  it('rogne un bloc qui commence avant la fenêtre visible', () => {
    expect(projectionIntervalle(5 * 60, 8 * 60, 7 * 60, 19 * 60, 360)).toEqual({
      top: 0,
      height: 30,
    })
  })

  it('ignore un bloc entièrement hors de la fenêtre visible', () => {
    expect(projectionIntervalle(60, 120, 7 * 60, 19 * 60, 360)).toBeNull()
  })
})
