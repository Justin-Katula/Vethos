/**
 * Système de couleurs centralisé de Vethos pour les 3 types d'éléments :
 *
 * 1. OBJECTIFS → Famille Rouge (12 variantes sobres)
 * 2. TÂCHES    → Famille Gris (12 variantes sobres)
 * 3. ANCRES    → Famille Bleu Froid (12 variantes sobres, alias Encre)
 *
 * Règle d'identité absolue : aucun vert (hue entre 60° et 170°).
 * Toutes les couleurs sont conçues pour fonctionner harmonieusement
 * avec le fond sombre (#000000, #141414, #232323) tout en restant sobres et mates.
 *
 * Algorithme d'allocation :
 * - Aucune répétition de couleur tant qu'il reste des teintes disponibles parmi les 12.
 * - Quand une tâche/engagement se termine ou est supprimé, sa couleur est libérée.
 * - Si les 12 couleurs sont simultanément utilisées, la suivante réutilise la couleur
 *   de l'élément actif qui va se terminer le plus tôt.
 */

// ─── 1. Objectifs : Famille Rouge (12 variantes fortement différenciées) ───
export const PALETTE_OBJECTIFS = [
  '#e03131', // 0. Écarlate Vif (rouge vif cardinal, signature Vethos)
  '#731238', // 1. Bordeaux Lie-de-Vin (sombre, bleuté, velouté)
  '#d9532f', // 2. Terracotta Chaleureux (terre cuite orangée-rouge)
  '#c91a5b', // 3. Rubis Impérial (framboisé profond bijou)
  '#f06565', // 4. Corail Lumineux (teinte claire éclatante)
  '#942b16', // 5. Brique Rôtie (rouge terreux cuivré sombre)
  '#e64980', // 6. Framboise Intense (rose-rouge lumineux vibrant)
  '#63131d', // 7. Grenat Noir (très sombre, rouge sang noble)
  '#e84a1a', // 8. Paprika Ardent (rouge-orange flamboyant)
  '#a63d5c', // 9. Bois de Rose Feutré (rouge poudré vintage)
  '#c25848', // 10. Terre Cuite Douce (rouge argile poudré doux)
  '#ad152b', // 11. Sang Impérial (carmin dense puissant)
] as const

// ─── 2. Tâches : Famille Gris (12 variantes) ──────────────────────────────
export const PALETTE_TACHES = [
  '#505359', // 0. Graphite Vethos canonique
  '#6b7280', // 1. Zinc moyen
  '#8c929d', // 2. Étain froid
  '#a8adb5', // 3. Cendre claire
  '#454950', // 4. Anthracite
  '#5c636e', // 5. Titane ardoisé
  '#717882', // 6. Acier
  '#7e828a', // 7. Minéral neutre
  '#9aa0a6', // 8. Brume
  '#b8bec8', // 9. Platine mat
  '#636b77', // 10. Ardoise froide
  '#3d4147', // 11. Fonte profonde
] as const

// ─── 3. Encre / Ancres : Famille Bleu Froid (12 variantes) ─────────────────
export const PALETTE_ANCRES = [
  '#2c3a56', // 0. Encre nuit Vethos canonique
  '#3b5998', // 1. Cobalt mat
  '#253047', // 2. Bleu ancre historique
  '#466995', // 3. Acier froid
  '#516b8b', // 4. Ardoise boréale
  '#2b4162', // 5. Saphir profond
  '#415a77', // 6. Bleu tempête
  '#344e73', // 7. Abysse
  '#6888ab', // 8. Glaciaire
  '#394a68', // 9. Indigo froid
  '#274060', // 10. Outremer sombre
  '#779ecb', // 11. Brume d'hiver
] as const

/** Alias sémantique pour la famille Encre / Ancres */
export const PALETTE_ENCRE = PALETTE_ANCRES

// ─── Couleurs canoniques par défaut ───────────────────────────────────────
export const COULEUR_OBJECTIF = PALETTE_OBJECTIFS[0]
export const COULEUR_TACHE = PALETTE_TACHES[0]
export const COULEUR_ANCRE = PALETTE_ANCRES[0]
export const COULEUR_ENCRE = PALETTE_ENCRE[0]

export type TypeElement = 'objective' | 'task' | 'ancre'

/**
 * Retourne la variante de couleur pour un objectif selon son rang d'ajout.
 */
export function couleurObjectif(index: number): string {
  const i = Math.abs(Math.floor(index))
  return PALETTE_OBJECTIFS[i % PALETTE_OBJECTIFS.length]!
}

/**
 * Retourne la variante de couleur pour une tâche selon son rang d'ajout.
 */
export function couleurTache(index: number): string {
  const i = Math.abs(Math.floor(index))
  return PALETTE_TACHES[i % PALETTE_TACHES.length]!
}

/**
 * Retourne la variante de couleur pour une ancre / encre selon son rang d'ajout.
 */
export function couleurAncre(index: number): string {
  const i = Math.abs(Math.floor(index))
  return PALETTE_ANCRES[i % PALETTE_ANCRES.length]!
}

export const couleurEncre = couleurAncre

/**
 * Retourne la couleur d'un élément selon sa nature et son rang d'index.
 */
export function couleurElement(type: TypeElement, index: number = 0): string {
  if (type === 'objective') return couleurObjectif(index)
  if (type === 'task') return couleurTache(index)
  return couleurAncre(index)
}

/**
 * Retourne la liste des variantes pour un type d'élément donné.
 */
export function variantesType(type: TypeElement): readonly string[] {
  if (type === 'objective') return PALETTE_OBJECTIFS
  if (type === 'task') return PALETTE_TACHES
  return PALETTE_ANCRES
}

/**
 * Vérifie si une chaîne hexadécimale correspond à l'une des couleurs de la famille d'un type.
 */
export function estCouleurDansFamille(type: TypeElement, couleur: string | undefined | null): boolean {
  if (!couleur) return false
  const lower = couleur.trim().toLowerCase()
  const palette = variantesType(type)
  return palette.some((c) => c.toLowerCase() === lower)
}

/**
 * Assainit une couleur pour un type donné : si la couleur stockée n'appartient pas
 * à la palette autorisée (par exemple un ancien objectif bleu), elle est remplacée
 * par une couleur valide de sa propre famille.
 */
export function assainirCouleur(type: TypeElement, couleur: string | undefined | null, index: number = 0): string {
  if (estCouleurDansFamille(type, couleur)) {
    return couleur!.trim()
  }
  return couleurElement(type, index)
}

/**
 * Algorithme d'allocation intelligente d'une couleur parmi les 12 variantes :
 *
 * 1. Tant que des couleurs de la palette ne sont pas utilisées par les éléments actifs,
 *    on attribue la première couleur libre (garantit zéro doublon tant que <= 12 éléments).
 * 2. Dès qu'un élément est supprimé ou terminé, sa couleur est automatiquement libérée.
 * 3. Si les 12 couleurs sont toutes utilisées simultanément, on réutilise la couleur
 *    de l'élément qui se termine le plus tôt (`dateFinDe`).
 */
export function allouerCouleurDisponible<T>(
  palette: readonly string[],
  elementsActifs: readonly T[],
  couleurDe: (el: T) => string | undefined | null,
  dateFinDe: (el: T) => number | string,
): string {
  const setPalette = new Set(palette.map((c) => c.toLowerCase()))
  const enUsage = new Set<string>()

  for (const el of elementsActifs) {
    const c = couleurDe(el)?.toLowerCase()
    if (c && setPalette.has(c)) {
      enUsage.add(c)
    }
  }

  // 1. Chercher la première couleur libre dans la palette
  for (const c of palette) {
    if (!enUsage.has(c.toLowerCase())) {
      return c
    }
  }

  // 2. Toutes les couleurs sont prises : réutiliser celle de l'élément qui finit le plus tôt
  const candidats = [...elementsActifs]
    .filter((el) => {
      const c = couleurDe(el)?.toLowerCase()
      return Boolean(c && setPalette.has(c))
    })
    .sort((a, b) => {
      const finA = dateFinDe(a)
      const finB = dateFinDe(b)
      if (finA < finB) return -1
      if (finA > finB) return 1
      return 0
    })

  if (candidats.length > 0) {
    const c = couleurDe(candidats[0]!)
    if (c) return c
  }

  return palette[0]!
}

/**
 * Alloue une couleur pour une nouvelle tâche :
 * - Famille gris
 * - Zéro doublon tant qu'il y a des couleurs libres
 * - Si 12 tâches actives : reprend la couleur de la tâche qui a l'échéance la plus proche.
 */
export function allouerCouleurTache<T extends { echeance?: string; deadline?: string; couleur?: string; color?: string }>(
  tachesActives: readonly T[],
): string {
  return allouerCouleurDisponible(
    PALETTE_TACHES,
    tachesActives,
    (t) => t.couleur ?? t.color,
    (t) => t.echeance ?? t.deadline ?? '9999-99-99',
  )
}

/**
 * Alloue une couleur pour un nouvel objectif :
 * - Famille rouge (stricte)
 * - Zéro doublon tant qu'il y a des couleurs libres
 * - Si 12 objectifs actifs : reprend la couleur de l'objectif ayant le quota le plus bas / le plus ancien.
 */
export function allouerCouleurObjectif<
  T extends {
    couleur?: string
    color?: string
    cibleHebdoMinutes?: number
    weeklyTargetMinutes?: number
    creeLe?: string
    createdAt?: string
  },
>(objectifsActifs: readonly T[]): string {
  return allouerCouleurDisponible(
    PALETTE_OBJECTIFS,
    objectifsActifs,
    (o) => o.couleur ?? o.color,
    (o) => o.creeLe ?? o.createdAt ?? (o.cibleHebdoMinutes ?? o.weeklyTargetMinutes ?? 0),
  )
}

/**
 * Alloue une couleur pour une nouvelle ancre :
 * - Famille bleu froid (stricte)
 * - Zéro doublon tant qu'il y a des couleurs libres
 * - Si 12 ancres actives : reprend la couleur de l'ancre qui commence le plus tôt dans la journée.
 */
export function allouerCouleurAncre<
  T extends { couleur?: string; color?: string; minuteAncrage?: number; anchorMinute?: number },
>(ancresActives: readonly T[]): string {
  return allouerCouleurDisponible(
    PALETTE_ANCRES,
    ancresActives,
    (a) => a.couleur ?? a.color,
    (a) => a.minuteAncrage ?? a.anchorMinute ?? 0,
  )
}
