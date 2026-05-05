/**
 * Système de niveaux 1→10. Seuils en minutes cumulées de focus.
 * Index 0..10 : index = niveau (1..10) → seuil minimum d'XP pour ce niveau.
 * L'index 10 (50000) sert de plafond — au-delà, on est niveau 10 isMax.
 */
export const LEVEL_THRESHOLDS_MIN = [
  0, 600, 1500, 3000, 5000, 8000, 12000, 18000, 26000, 36000, 50000,
] as const

export type LevelInfo = {
  /** Niveau 1..10 */
  level: number
  /** Minutes XP au début du niveau courant */
  currentLevelStart: number
  /** Minutes XP au début du niveau suivant (ou plafond 50000 si niveau max) */
  nextLevelStart: number
  /** Progression 0..1 vers le niveau suivant ; 1 si niveau 10 atteint */
  progress: number
  /** True si niveau 10 atteint */
  isMax: boolean
}

export function getLevelInfo(xpMinutes: number): LevelInfo {
  const xp = Math.max(0, xpMinutes)

  // Niveau max atteint
  if (xp >= LEVEL_THRESHOLDS_MIN[10]!) {
    return {
      level: 10,
      currentLevelStart: LEVEL_THRESHOLDS_MIN[9]!,
      nextLevelStart: LEVEL_THRESHOLDS_MIN[10]!,
      progress: 1,
      isMax: true,
    }
  }

  // Trouver le niveau courant : plus grand i tel que xp >= seuil[i]
  // Niveaux 1..9 : entre seuil[level-1] (inclus) et seuil[level] (exclu)
  for (let level = 1; level <= 9; level++) {
    const start = LEVEL_THRESHOLDS_MIN[level - 1]!
    const next = LEVEL_THRESHOLDS_MIN[level]!
    if (xp >= start && xp < next) {
      return {
        level,
        currentLevelStart: start,
        nextLevelStart: next,
        progress: (xp - start) / (next - start),
        isMax: false,
      }
    }
  }

  // Cas xp dans [seuil[9], seuil[10]) → niveau 10, pas encore max strict
  // (mais spec : à partir de seuil[9]=36000 on est niveau 10)
  return {
    level: 10,
    currentLevelStart: LEVEL_THRESHOLDS_MIN[9]!,
    nextLevelStart: LEVEL_THRESHOLDS_MIN[10]!,
    progress: 1,
    isMax: true,
  }
}
