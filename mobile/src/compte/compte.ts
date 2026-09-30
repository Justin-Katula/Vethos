import type { Session } from '@supabase/supabase-js'
import Constants, { ExecutionEnvironment } from 'expo-constants'
import * as Crypto from 'expo-crypto'
import * as Linking from 'expo-linking'
import * as WebBrowser from 'expo-web-browser'
import { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import { config, supabase } from './supabase'

/**
 * Le compte Vethos : se connecter avec Apple ou Google, se déconnecter,
 * supprimer son compte (Apple l'exige dès qu'on peut en créer un). Aucun mot
 * de passe : rien à oublier, rien à voler.
 *
 * L'app marche sans compte ; le compte se propose, il ne s'impose pas.
 */

/**
 * Dans Expo Go, les modules natifs de Vethos (Google, achats, Temps d'écran)
 * n'existent pas : la connexion Google passe alors par le navigateur de
 * l'iPhone, comme sur le web.
 */
const dansExpoGo = () => Constants.executionEnvironment === ExecutionEnvironment.StoreClient

export type Resultat = { ok: true } | { ok: false; raison: 'annule' | 'indisponible' | 'erreur' }

/** Ce qu'on peut proposer sur cet appareil, selon la configuration réelle. */
export async function fournisseurs(): Promise<{ apple: boolean; google: boolean }> {
  const c = config()
  if (!supabase()) return { apple: false, google: false }
  let apple = false
  if (c.apple) {
    if (Platform.OS === 'ios') {
      const AppleAuthentication = await import('expo-apple-authentication')
      apple = await AppleAuthentication.isAvailableAsync().catch(() => false)
    } else if (Platform.OS === 'web') apple = true
  }
  const google =
    Platform.OS === 'web' || dansExpoGo() ? !!c.googleWeb : Platform.OS === 'ios' ? !!(c.googleWeb && c.googleIos) : !!c.googleWeb
  return { apple, google }
}

/** Sur le web : le fournisseur ouvre sa page, puis revient ici avec la session. */
async function parRedirection(provider: 'apple' | 'google'): Promise<Resultat> {
  const sb = supabase()
  if (!sb) return { ok: false, raison: 'indisponible' }
  const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: globalThis.location?.origin } })
  return error ? { ok: false, raison: 'erreur' } : { ok: true }
}

/**
 * Sur le téléphone sans module natif : la page du fournisseur s'ouvre dans le
 * navigateur intégré, puis revient dans l'app avec un code, échangé contre la
 * session (PKCE : un code intercepté ne sert à rien sans le secret gardé ici).
 */
async function parNavigateur(provider: 'apple' | 'google'): Promise<Resultat> {
  const sb = supabase()
  if (!sb) return { ok: false, raison: 'indisponible' }
  const retour = Linking.createURL('auth')
  const { data, error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: retour, skipBrowserRedirect: true } })
  if (error || !data.url) return { ok: false, raison: 'erreur' }
  const r = await WebBrowser.openAuthSessionAsync(data.url, retour)
  if (r.type !== 'success') return { ok: false, raison: 'annule' }
  const code = /[?&]code=([^&#]+)/.exec(r.url)?.[1]
  if (!code) return { ok: false, raison: 'erreur' }
  const { error: e } = await sb.auth.exchangeCodeForSession(decodeURIComponent(code))
  return e ? { ok: false, raison: 'erreur' } : { ok: true }
}

export async function connecterApple(): Promise<Resultat> {
  const sb = supabase()
  if (!sb) return { ok: false, raison: 'indisponible' }
  if (Platform.OS === 'web') return parRedirection('apple')
  if (Platform.OS !== 'ios') return { ok: false, raison: 'indisponible' }
  const AppleAuthentication = await import('expo-apple-authentication')
  // Le nonce : Apple signe sa version hachée, Supabase vérifie avec la brute.
  // Un jeton intercepté ne se rejoue donc pas.
  const brut = Crypto.randomUUID()
  const hache = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, brut)
  try {
    const cred = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hache,
    })
    if (!cred.identityToken) return { ok: false, raison: 'erreur' }
    const { error } = await sb.auth.signInWithIdToken({ provider: 'apple', token: cred.identityToken, nonce: brut })
    return error ? { ok: false, raison: 'erreur' } : { ok: true }
  } catch (e) {
    return (e as { code?: string }).code === 'ERR_REQUEST_CANCELED' ? { ok: false, raison: 'annule' } : { ok: false, raison: 'erreur' }
  }
}

export async function connecterGoogle(): Promise<Resultat> {
  const sb = supabase()
  const c = config()
  if (!sb || !c.googleWeb) return { ok: false, raison: 'indisponible' }
  if (Platform.OS === 'web') return parRedirection('google')
  if (dansExpoGo()) return parNavigateur('google')
  try {
    // Chargé à la demande : le module natif n'existe que dans une vraie build.
    const { GoogleSignin, isSuccessResponse } = await import('@react-native-google-signin/google-signin')
    GoogleSignin.configure({ webClientId: c.googleWeb, ...(c.googleIos ? { iosClientId: c.googleIos } : {}) })
    await GoogleSignin.hasPlayServices()
    const r = await GoogleSignin.signIn()
    if (!isSuccessResponse(r)) return { ok: false, raison: 'annule' }
    if (!r.data.idToken) return { ok: false, raison: 'erreur' }
    const { error } = await sb.auth.signInWithIdToken({ provider: 'google', token: r.data.idToken })
    return error ? { ok: false, raison: 'erreur' } : { ok: true }
  } catch {
    return { ok: false, raison: 'erreur' }
  }
}

export async function deconnecter(): Promise<void> {
  await supabase()?.auth.signOut()
}

/**
 * Supprime le compte pour de bon, côté serveur (fonction `compte`) : la clé
 * qui a ce pouvoir ne vit que là-bas. Puis la session locale s'efface.
 */
export async function supprimerCompte(): Promise<Resultat> {
  const sb = supabase()
  const { url } = config()
  if (!sb || !url) return { ok: false, raison: 'indisponible' }
  const { data } = await sb.auth.getSession()
  const jeton = data.session?.access_token
  if (!jeton) return { ok: false, raison: 'erreur' }
  try {
    const r = await fetch(`${url}/functions/v1/compte`, { method: 'DELETE', headers: { Authorization: `Bearer ${jeton}` } })
    if (!r.ok) return { ok: false, raison: 'erreur' }
  } catch {
    return { ok: false, raison: 'erreur' }
  }
  await sb.auth.signOut({ scope: 'local' })
  return { ok: true }
}

/**
 * La session en cours, tenue à jour (connexion, déconnexion, rafraîchissement).
 * `undefined` tant qu'elle n'est pas encore relue du téléphone.
 */
export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(supabase() ? undefined : null)
  useEffect(() => {
    const sb = supabase()
    if (!sb) return
    void sb.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  return session
}
