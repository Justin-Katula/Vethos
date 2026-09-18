import { describe, it, expect } from 'vitest'
import {
  CATEGORY_COLOR,
  CHOOSABLE_SHADES,
  entryFill,
  entryMark,
  nextShade,
} from './palette'

/**
 * Teinte d'une couleur, en degrés. `null` quand la saturation est si basse que
 * la teinte ne se voit pas — c'est alors un gris, quel que soit son angle.
 *
 * Le seuil (2 %) est celui de `palette.ts`. Recalculé ici plutôt qu'importé :
 * un test qui réutilise le prédicat de l'implémentation ne teste rien.
 */
function hueOf(hex: string): number | null {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  const l = (max + min) / 2
  const s = delta === 0 ? 0 : l > 0.5 ? delta / (2 - max - min) : delta / (max + min)
  if (s <= 0.02) return null
  const h =
    max === r
      ? ((g - b) / delta + (g < b ? 6 : 0)) * 60
      : max === g
        ? ((b - r) / delta + 2) * 60
        : ((r - g) / delta + 4) * 60
  return (h + 360) % 360
}

const estVert = (hex: string): boolean => {
  const h = hueOf(hex)
  return h !== null && h >= 60 && h <= 170
}

/** Les verts que des installations existantes ont déjà écrits sur disque. */
const VERTS_RETIRES = {
  'olive des objectifs': '#58664a',
  'vert pâle des engagements': '#d3dac9',
  'gris-vert du sommeil': '#d6d9d0',
  'gris-vert des teintes': '#6f7671',
}

describe('palette — plus aucun vert ne peut s’afficher', () => {
  it('aucune couleur par défaut n’est verte', () => {
    for (const [categorie, hex] of Object.entries(CATEGORY_COLOR)) {
      expect(estVert(hex), `${categorie} = ${hex}`).toBe(false)
    }
    for (const hex of CHOOSABLE_SHADES) {
      expect(estVert(hex), hex).toBe(false)
    }
    expect(estVert(nextShade(2))).toBe(false)
  })

  it('un vert déjà enregistré est dévert à l’affichage, dans les DEUX thèmes', () => {
    for (const [quoi, hex] of Object.entries(VERTS_RETIRES)) {
      expect(estVert(entryFill(hex, 'light')), `fond clair — ${quoi}`).toBe(false)
      expect(estVert(entryFill(hex, 'dark')), `fond sombre — ${quoi}`).toBe(false)
      expect(estVert(entryMark(hex, 'light')), `marque claire — ${quoi}`).toBe(false)
      expect(estVert(entryMark(hex, 'dark')), `marque sombre — ${quoi}`).toBe(false)
    }
  })

  it('déverdir retire la teinte sans déplacer le bloc dans la grille', () => {
    // Le poids visuel tient à la clarté : elle ne doit pas bouger.
    expect(entryFill('#d3dac9', 'light')).toBe('#d2d2d2')
  })
})

describe('palette — ce qui n’est pas vert ne bouge pas', () => {
  it('le thème clair rend la valeur stockée telle quelle, au caractère près', () => {
    expect(entryFill('#c9d4de', 'light')).toBe('#c9d4de')
    expect(entryFill('#c1121f', 'light')).toBe('#c1121f')
    expect(entryMark('#253047', 'light')).toBe('#253047')
  })

  it('les teintes froides et chaudes survivent au passage en sombre', () => {
    const ecole = hueOf(entryFill('#c9d4de', 'dark'))
    const travail = hueOf(entryFill('#d8d1c3', 'dark'))
    expect(ecole).toBeGreaterThan(180) // reste bleu
    expect(travail).toBeLessThan(60) // reste chaud
  })
})

describe('palette — un gris reste un gris', () => {
  it('une marque grise ne se teinte pas en rose sur fond sombre', () => {
    // Le plancher de saturation d'`entryMark` colorait les gris : teinte 0°,
    // c'est du rouge. Les catégories neutres en dépendent maintenant.
    for (const gris of ['#d9d9d9', '#c6c6c6', '#747474']) {
      expect(hueOf(entryMark(gris, 'dark')), gris).toBeNull()
      expect(hueOf(entryFill(gris, 'dark')), gris).toBeNull()
    }
  })

  it('une valeur illisible retombe sur un jeton, pas sur du vide', () => {
    expect(entryFill('pas une couleur', 'dark')).toBe('var(--surface-3)')
    expect(entryMark('', 'dark')).toBe('var(--line-strong)')
  })
})
