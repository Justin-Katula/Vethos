import { describe, it, expect } from 'vitest'
import { computeOverlayPlacement, type TargetGeometry } from './geometry'

function makeTarget(overrides: Partial<TargetGeometry> = {}): TargetGeometry {
  return {
    bounds: { left: 100, top: 200, right: 900, bottom: 800 },
    showState: 'normal',
    cloaked: false,
    visible: true,
    ...overrides,
  }
}

describe('computeOverlayPlacement', () => {
  it("place l'overlay exactement sur des bounds valides", () => {
    expect(computeOverlayPlacement(makeTarget())).toEqual({
      kind: 'placed',
      x: 100,
      y: 200,
      width: 800,
      height: 600,
    })
  })

  it("suit la cible quand elle est maximisée", () => {
    const placement = computeOverlayPlacement(
      makeTarget({ showState: 'maximized', bounds: { left: 0, top: 0, right: 2560, bottom: 1392 } }),
    )
    expect(placement).toEqual({ kind: 'placed', x: 0, y: 0, width: 2560, height: 1392 })
  })

  it("masque au lieu de placer a -32000 — le bug 5", () => {
    const placement = computeOverlayPlacement(
      makeTarget({ bounds: { left: -32000, top: -32000, right: -31840, bottom: -31972 } }),
    )
    expect(placement).toEqual({ kind: 'hidden', reason: 'bounds hors écran (-32000)' })
  })

  it("masque quand la cible est minimisee", () => {
    expect(computeOverlayPlacement(makeTarget({ showState: 'minimized' }))).toEqual({
      kind: 'hidden',
      reason: 'cible minimisée',
    })
  })

  it("masque quand la cible est invisible", () => {
    expect(computeOverlayPlacement(makeTarget({ visible: false }))).toEqual({
      kind: 'hidden',
      reason: 'cible invisible',
    })
  })

  it("masque quand la cible est masquee par DWM", () => {
    expect(computeOverlayPlacement(makeTarget({ cloaked: true }))).toEqual({
      kind: 'hidden',
      reason: 'cible masquée par DWM',
    })
  })

  it("masque sur des bounds degenerees plutot que de placer une fenetre nulle", () => {
    const zeroWidth = makeTarget({ bounds: { left: 50, top: 50, right: 50, bottom: 400 } })
    expect(computeOverlayPlacement(zeroWidth)).toEqual({
      kind: 'hidden',
      reason: 'bounds dégénérées',
    })
    const inverted = makeTarget({ bounds: { left: 500, top: 50, right: 100, bottom: 400 } })
    expect(computeOverlayPlacement(inverted)).toEqual({
      kind: 'hidden',
      reason: 'bounds dégénérées',
    })
  })

  it("accepte des coordonnees negatives legitimes — ecran secondaire a gauche", () => {
    const placement = computeOverlayPlacement(
      makeTarget({ bounds: { left: -1920, top: 0, right: -1120, bottom: 600 } }),
    )
    expect(placement).toEqual({ kind: 'placed', x: -1920, y: 0, width: 800, height: 600 })
  })

  it("ne place jamais a 0,0 par defaut quand l'etat est douteux", () => {
    // Garde-fou explicite du bug 5 : aucune combinaison douteuse ne doit
    // produire un placement, encore moins un placement au coin de l'ecran
    const suspects: TargetGeometry[] = [
      makeTarget({ visible: false }),
      makeTarget({ cloaked: true }),
      makeTarget({ showState: 'minimized' }),
      makeTarget({ bounds: { left: -32000, top: -32000, right: -31000, bottom: -31000 } }),
      makeTarget({ bounds: { left: 0, top: 0, right: 0, bottom: 0 } }),
    ]
    for (const target of suspects) {
      expect(computeOverlayPlacement(target).kind).toBe('hidden')
    }
  })
})
