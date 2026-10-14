import { describe, expect, it } from 'vitest'
import { avancementZoom, etiquette, HAUTEUR, LARGEUR, sablier, vue, ZOOM_DEBUT, ZOOM_DUREE } from './cadran-zoom'

describe('Le cadran qui zoome sur la séance', () => {
  it('part du cadran entier et finit serré sur l’arc', () => {
    const avant = vue(14 * 60, 15 * 60 + 30, 0)
    const apres = vue(14 * 60, 15 * 60 + 30, 1)
    expect(avant.w).toBeGreaterThan(400) // le cercle (diamètre 384) tient dedans
    expect(apres.w).toBeLessThan(avant.w / 2)
  })

  it('les deux heures de la séance restent dans la fenêtre une fois zoomé', () => {
    const v = vue(14 * 60, 15 * 60 + 30, 1)
    for (const m of [14 * 60, 15 * 60 + 30]) {
      const e = etiquette(m, v)
      expect(e.x).toBeGreaterThan(0)
      expect(e.x).toBeLessThan(LARGEUR)
      expect(e.y).toBeGreaterThan(0)
      expect(e.y).toBeLessThan(HAUTEUR)
    }
  })

  it('une séance qui passe minuit ne casse pas la fenêtre', () => {
    const v = vue(23 * 60, 24 * 60 + 60, 1)
    expect(Number.isFinite(v.x) && Number.isFinite(v.w)).toBe(true)
  })

  it('attend, zoome, puis s’arrête', () => {
    expect(avancementZoom(0)).toBe(0)
    expect(avancementZoom(ZOOM_DEBUT)).toBe(0)
    expect(avancementZoom(ZOOM_DEBUT + ZOOM_DUREE / 2)).toBeCloseTo(0.5)
    expect(avancementZoom(ZOOM_DEBUT + ZOOM_DUREE + 500)).toBe(1)
  })

  it('le sablier se vide avec la séance, et le filet ne coule qu’entre les deux', () => {
    expect(sablier(0).filet).toBeNull()
    expect(sablier(0.5).filet).not.toBeNull()
    expect(sablier(1).filet).toBeNull()
  })
})
