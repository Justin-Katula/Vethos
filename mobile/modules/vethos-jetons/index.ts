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

/** Les opérations sur les sélections rangées (null sans le module). */
export const jetons = {
  disponible: () => natif() !== null,
  compter: (id: string) => natif()?.compter(id) ?? null,
  vider: (id: string) => natif()?.vider(id),
  /** Ajoute `ajout` à `cible` (et vide `ajout`) : « + » n'ajoute que. */
  fusionner: (cible: string, ajout: string) => natif()?.fusionner(cible, ajout) ?? null,
}
