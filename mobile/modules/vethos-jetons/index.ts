import type { ComponentType } from 'react'
import { Platform } from 'react-native'
import { requireNativeViewManager, requireOptionalNativeModule } from 'expo-modules-core'

export type ProprietesJetons = {
  selectionId: string
  version?: number
  couleur?: string
  taillePolice?: number
  style?: unknown
}

/**
 * La vue native qui dessine les apps écartées, ou null — Expo Go, le web, ou
 * une build plus ancienne qui ne l'embarque pas. L'appelant retombe alors sur
 * les nombres.
 */
export function vueJetons(): ComponentType<ProprietesJetons> | null {
  if (Platform.OS !== 'ios') return null
  if (!requireOptionalNativeModule('VethosJetons')) return null
  try {
    return requireNativeViewManager<ProprietesJetons>('VethosJetons')
  } catch {
    return null
  }
}
