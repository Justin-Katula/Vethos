import { describe, expect, it } from 'vitest'
import {
  COULEUR_ANCRE,
  COULEUR_ENCRE,
  COULEUR_OBJECTIF,
  COULEUR_TACHE,
  PALETTE_ANCRES,
  PALETTE_ENCRE,
  PALETTE_OBJECTIFS,
  PALETTE_TACHES,
  allouerCouleurAncre,
  allouerCouleurDisponible,
  allouerCouleurObjectif,
  allouerCouleurTache,
  assainirCouleur,
  couleurAncre,
  couleurElement,
  couleurEncre,
  couleurObjectif,
  couleurTache,
  estCouleurDansFamille,
  variantesType,
} from './palettes'

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) throw new Error(`Invalid hex color: ${hex}`)
  const int = parseInt(match[1]!, 16)
  const r = ((int >> 16) & 255) / 255
  const g = ((int >> 8) & 255) / 255
  const b = (int & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  const l = (max + min) / 2
  const s = delta === 0 ? 0 : l > 0.5 ? delta / (2 - max - min) : delta / (max + min)
  let h = 0
  if (delta !== 0) {
    h =
      max === r
        ? ((g - b) / delta + (g < b ? 6 : 0)) * 60
        : max === g
          ? ((b - r) / delta + 2) * 60
          : ((r - g) / delta + 4) * 60
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) }
}

describe('Système de couleurs centralisé Vethos', () => {
  it('propose au minimum 10 variantes de couleurs par type', () => {
    expect(PALETTE_OBJECTIFS.length).toBeGreaterThanOrEqual(10)
    expect(PALETTE_TACHES.length).toBeGreaterThanOrEqual(10)
    expect(PALETTE_ANCRES.length).toBeGreaterThanOrEqual(10)
    expect(PALETTE_ENCRE.length).toBeGreaterThanOrEqual(10)
  })

  it('ne comporte aucun doublon au sein de chaque palette', () => {
    const checkUnique = (palette: readonly string[], nom: string) => {
      const set = new Set(palette.map((c) => c.toLowerCase()))
      expect(set.size, `Doublons dans ${nom}`).toBe(palette.length)
    }
    checkUnique(PALETTE_OBJECTIFS, 'PALETTE_OBJECTIFS')
    checkUnique(PALETTE_TACHES, 'PALETTE_TACHES')
    checkUnique(PALETTE_ANCRES, 'PALETTE_ANCRES')
  })

  it('interdit rigoureusement toute couleur verte (60° à 170°)', () => {
    const toutes = [...PALETTE_OBJECTIFS, ...PALETTE_TACHES, ...PALETTE_ANCRES]
    for (const hex of toutes) {
      const hsl = hexToHsl(hex)
      const estVert = hsl.s > 2 && hsl.h >= 60 && hsl.h <= 170
      expect(estVert, `${hex} (H: ${hsl.h}°, S: ${hsl.s}%) tombe dans la zone verte interdite`).toBe(false)
    }
  })

  it('respecte la famille rouge pour les objectifs', () => {
    for (const hex of PALETTE_OBJECTIFS) {
      const hsl = hexToHsl(hex)
      const estDansFamilleRouge = hsl.h <= 30 || hsl.h >= 330
      expect(estDansFamilleRouge, `${hex} (H: ${hsl.h}°) n'appartient pas à la famille rouge`).toBe(true)
      expect(hsl.s, `${hex} doit avoir une saturation minimale pour être rouge`).toBeGreaterThan(30)
    }
  })

  it('respecte la famille gris pour les tâches', () => {
    for (const hex of PALETTE_TACHES) {
      const hsl = hexToHsl(hex)
      expect(hsl.s, `${hex} (S: ${hsl.s}%) est trop saturé pour être un gris sobre`).toBeLessThanOrEqual(20)
    }
  })

  it('respecte la famille bleu froid pour les ancres / encre', () => {
    for (const hex of PALETTE_ANCRES) {
      const hsl = hexToHsl(hex)
      const estBleuFroid = hsl.h >= 195 && hsl.h <= 235
      expect(estBleuFroid, `${hex} (H: ${hsl.h}°) n'est pas un bleu froid`).toBe(true)
      expect(hsl.s, `${hex} doit avoir une composante bleutée sensible`).toBeGreaterThan(15)
    }
  })

  it('assainit et interdit rigoureusement le bleu pour un objectif', () => {
    const bleuHistorique = '#253047'
    expect(estCouleurDansFamille('objective', bleuHistorique)).toBe(false)
    const assaini = assainirCouleur('objective', bleuHistorique)
    expect(estCouleurDansFamille('objective', assaini)).toBe(true)
    expect(assaini).not.toBe(bleuHistorique)

    // Un rouge valide est conservé
    expect(assainirCouleur('objective', PALETTE_OBJECTIFS[1])).toBe(PALETTE_OBJECTIFS[1])
  })

  it('alloue 12 couleurs uniques sans doublon tant que des teintes sont libres', () => {
    const taches: { id: string; echeance: string; couleur: string }[] = []
    for (let i = 0; i < 12; i++) {
      const couleur = allouerCouleurTache(taches)
      taches.push({
        id: `t-${i}`,
        echeance: `2026-09-${String(20 + i).padStart(2, '0')}`,
        couleur,
      })
    }

    const setCouleurs = new Set(taches.map((t) => t.couleur.toLowerCase()))
    expect(setCouleurs.size).toBe(12)
  })

  it('réutilise la couleur de la tâche qui finit la plus tôt une fois les 12 couleurs épuisées', () => {
    const taches: { id: string; echeance: string; couleur: string }[] = []
    for (let i = 0; i < 12; i++) {
      const couleur = allouerCouleurTache(taches)
      taches.push({
        id: `t-${i}`,
        // t-0 est celle qui finit le plus tôt (2026-09-10)
        echeance: `2026-09-${String(10 + i).padStart(2, '0')}`,
        couleur,
      })
    }

    // 13ème tâche : les 12 couleurs sont occupées
    const couleur13 = allouerCouleurTache(taches)
    // Elle doit reprendre la couleur de t-0 (échéance 2026-09-10)
    expect(couleur13).toBe(taches[0]!.couleur)
  })

  it('libère immédiatement une couleur quand un engagement est terminé ou supprimé', () => {
    const taches: { id: string; echeance: string; couleur: string }[] = []
    for (let i = 0; i < 12; i++) {
      taches.push({
        id: `t-${i}`,
        echeance: `2026-09-${String(20 + i).padStart(2, '0')}`,
        couleur: PALETTE_TACHES[i]!,
      })
    }

    // On retire la tâche t-4 (qui portait PALETTE_TACHES[4])
    const couleurT4 = taches[4]!.couleur
    const tachesApresSuppression = taches.filter((t) => t.id !== 't-4')

    // La prochaine allocation doit reprendre cette couleur libérée
    const nouvelleCouleur = allouerCouleurTache(tachesApresSuppression)
    expect(nouvelleCouleur).toBe(couleurT4)
  })
})
