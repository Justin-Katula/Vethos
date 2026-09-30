import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * Un tiroir par compte. Les données de Vethos (engagements, réglages,
 * séances) sont rangées sous une clé propre au compte connecté :
 * `vethos:donnees:v1:u:<id>`. Deux comptes sur le même téléphone ne voient
 * jamais les affaires l'un de l'autre.
 *
 * Sans compte (avant la toute première connexion), le tiroir commun sert :
 * l'introduction y range ce que l'utilisateur vient de déclarer, et le premier
 * compte connecté le reprend (`reclamer`).
 *
 * Le blocage, lui, reste au téléphone : il décrit ce que le Temps d'écran de
 * CET appareil applique vraiment, quel que soit le compte.
 */

let compte: string | null = null

export const compteCourant = () => compte
export const definirCompte = (id: string | null) => {
  compte = id
}

/** La clé d'un magasin pour le compte connecté. */
export const cleCompte = (base: string, id: string | null = compte) => (id ? `${base}:u:${id}` : base)

/** Les magasins rangés par compte. */
export const MAGASINS_PAR_COMPTE = ['vethos:donnees:v1', 'vethos:seances:v1'] as const

/**
 * Le tiroir commun devient celui du compte, s'il n'en a pas encore : ce que
 * l'utilisateur a déclaré pendant l'introduction, juste avant de se connecter,
 * lui appartient. Un compte qui a déjà son tiroir ne récupère rien.
 */
export async function reclamer(id: string): Promise<void> {
  for (const base of MAGASINS_PAR_COMPTE) {
    const sien = await AsyncStorage.getItem(cleCompte(base, id))
    if (sien) continue
    const commun = await AsyncStorage.getItem(base)
    if (!commun) continue
    await AsyncStorage.setItem(cleCompte(base, id), commun)
    await AsyncStorage.removeItem(base)
  }
}

/** Ce téléphone a déjà vu l'introduction : déconnecté, on montre la porte, pas l'introduction. */
const CLE_APPAREIL = 'vethos:appareil:v1'
export async function introVueSurAppareil(): Promise<boolean> {
  try {
    return JSON.parse((await AsyncStorage.getItem(CLE_APPAREIL)) ?? '{}').introVue === true
  } catch {
    return false
  }
}
export async function marquerIntroVue(): Promise<void> {
  await AsyncStorage.setItem(CLE_APPAREIL, JSON.stringify({ introVue: true }))
}
