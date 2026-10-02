import AsyncStorage from '@react-native-async-storage/async-storage'
import { noterEcriture, type Magasin } from './nuage'

/**
 * Un tiroir par compte. Les données de Vethos (engagements, réglages,
 * séances) sont rangées sous une clé propre au compte connecté :
 * `vethos:donnees:v1:u:<id>`. Deux comptes sur le même téléphone ne voient
 * jamais les affaires l'un de l'autre.
 *
 * Sans compte, il n'y a pas de tiroir : l'app est fermée derrière la porte,
 * rien ne s'écrit nulle part, et l'introduction ne se joue qu'une fois
 * connecté. Un compte neuf part donc toujours de zéro.
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

/**
 * Écrire dans le tiroir d'un compte : sur le téléphone, puis vers la
 * sauvegarde en ligne. Sans propriétaire, rien ne s'écrit : un état sans
 * compte ne doit jamais atterrir chez le prochain compte qui se connecte.
 */
export async function ecrireTiroir(base: Magasin, proprietaire: string | null, brut: string): Promise<void> {
  if (!proprietaire) return
  await AsyncStorage.setItem(cleCompte(base, proprietaire), brut)
  await noterEcriture(proprietaire, base, brut)
}

/** Les magasins rangés par compte. */
export const MAGASINS_PAR_COMPTE = ['vethos:donnees:v1', 'vethos:seances:v1'] as const

/**
 * L'ancien tiroir commun (versions précédentes) : il donnait son contenu au
 * prochain compte connecté — un compte neuf héritait de l'introduction d'un
 * autre. On l'efface ; plus rien ne l'écrit.
 */
export async function oublierTiroirCommun(): Promise<void> {
  for (const base of MAGASINS_PAR_COMPTE) await AsyncStorage.removeItem(base)
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
