import Constants from 'expo-constants'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import { creerClientCoach, type ClientCoach } from '@shared/coach/client'

/**
 * Le Coach, côté téléphone. L'adresse du serveur vient de `extra.coachUrl`
 * (app.json) ; la clé DeepSeek n'est JAMAIS ici — seulement un jeton
 * d'installation anonyme, rangé dans le trousseau. Sans adresse, le Coach
 * n'existe pas et rien ne s'affiche.
 */
const CLE_JETON = 'vethos.coach.jeton'

const lire = async () => {
  if (Platform.OS === 'web') return globalThis.localStorage?.getItem(CLE_JETON) ?? null
  return SecureStore.getItemAsync(CLE_JETON)
}
const ecrire = async (j: string | null) => {
  if (Platform.OS === 'web') {
    if (j) globalThis.localStorage?.setItem(CLE_JETON, j)
    else globalThis.localStorage?.removeItem(CLE_JETON)
  } else if (j) await SecureStore.setItemAsync(CLE_JETON, j)
  else await SecureStore.deleteItemAsync(CLE_JETON)
}

let client: ClientCoach | null = null
export function coach(): ClientCoach {
  if (!client) {
    const url = (Constants.expoConfig?.extra as { coachUrl?: string } | undefined)?.coachUrl
    client = creerClientCoach({ url, lireJeton: lire, ecrireJeton: ecrire })
  }
  return client
}
