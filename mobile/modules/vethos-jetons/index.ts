import type { ComponentType } from 'react'
import { Platform } from 'react-native'
import { requireNativeViewManager, requireOptionalNativeModule } from 'expo-modules-core'

export type Comptes = { applicationCount: number; categoryCount: number; webDomainCount: number }

export type ProprietesJetons = {
  selectionId: string
  version?: number
  couleur?: string
  taillePolice?: number
  /** Un « × » par élément pour le retirer. */
  modifiable?: boolean
  onChange?: (e: { nativeEvent: Comptes }) => void
  style?: unknown
}

type ModuleJetons = {
  compter(id: string): Comptes
  vider(id: string): void
  fusionner(cible: string, ajout: string): Comptes
}

const natif = (): ModuleJetons | null => (Platform.OS === 'ios' ? requireOptionalNativeModule<ModuleJetons>('VethosJetons') : null)

/**
 * La vue native qui dessine (et laisse retirer) les éléments d'une liste, ou
 * null — Expo Go, le web, ou une build plus ancienne qui ne l'embarque pas.
 * L'appelant retombe alors sur les nombres.
 */
export function vueJetons(): ComponentType<ProprietesJetons> | null {
  if (!natif()) return null
  try {
    return requireNativeViewManager<ProprietesJetons>('VethosJetons')
  } catch {
    return null
  }
}

/**
 * Une fonction du module, ou null — une build plus ancienne peut embarquer le
 * module SANS cette fonction (le JS arrive par Metro, le natif par EAS).
 */
function fonction<K extends keyof ModuleJetons>(nom: K): ModuleJetons[K] | null {
  const m = natif()
  return m && typeof m[nom] === 'function' ? ((m[nom] as (...a: unknown[]) => unknown).bind(m) as ModuleJetons[K]) : null
}

/** Les opérations sur les sélections rangées (null sans le module). */
export const jetons = {
  /** Le « + » qui n'ajoute que a besoin des trois. */
  disponible: () => fonction('compter') !== null && fonction('vider') !== null && fonction('fusionner') !== null,
  compter: (id: string) => fonction('compter')?.(id) ?? null,
  vider: (id: string) => void fonction('vider')?.(id),
  /** Ajoute `ajout` à `cible` (et vide `ajout`) : « + » n'ajoute que. */
  fusionner: (cible: string, ajout: string) => fonction('fusionner')?.(cible, ajout) ?? null,
}
