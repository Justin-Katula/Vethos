import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import Constants from 'expo-constants'
import { Platform } from 'react-native'

/**
 * Le client Supabase de l'app. L'adresse et la clé PUBLIABLE viennent de
 * `extra.supabase` (app.json) : cette clé est faite pour vivre dans une app,
 * elle n'ouvre que ce que les règles de la base autorisent. La clé secrète,
 * elle, ne quitte jamais le serveur.
 */
export type ConfigConnexion = {
  url?: string
  cle?: string
  /** Connexion Apple : vraie quand le fournisseur est activé dans Supabase. */
  apple?: boolean
  /** Identifiants OAuth Google (console Google Cloud). Vides : pas de bouton Google. */
  googleWeb?: string
  googleIos?: string
}

export const config = (): ConfigConnexion =>
  ((Constants.expoConfig?.extra as { supabase?: ConfigConnexion } | undefined)?.supabase ?? {})

let client: SupabaseClient | null | undefined
export function supabase(): SupabaseClient | null {
  if (client !== undefined) return client
  const { url, cle } = config()
  client = url && cle
    ? createClient(url, cle, {
        auth: {
          storage: AsyncStorage,
          persistSession: true,
          autoRefreshToken: true,
          // Sur le web, le retour de Google arrive dans l'adresse de la page.
          detectSessionInUrl: Platform.OS === 'web',
          flowType: 'pkce',
        },
      })
    : null
  return client
}
