import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { noterEcriture, type Magasin } from './nuage'

/**
 * Un tiroir par compte. Les données de Vethos (engagements, réglages,
 * séances) sont rangées sous une clé propre au compte connecté :
 * `vethos:donnees:v1:u:<id>`. Deux comptes sur le même téléphone ne voient
 * jamais les affaires l'un de l'autre.
 *
 * Sans compte, il n'y a pas de tiroir : rien ne s'écrit nulle part. Un
 * téléchargement neuf joue l'introduction d'abord, en mémoire ; ses réponses
 * attendent la connexion (`useAppareil`). Après une déconnexion, c'est la porte
 * directement ; un compte neuf qui se connecte rejoue l'introduction.
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

/**
 * Un téléchargement neuf commence par l'introduction, AVANT tout compte. Ses
 * réponses attendent ici ; à la connexion, un compte neuf les reçoit, un compte
 * qui a déjà fait son introduction garde les siennes (celles-ci s'oublient).
 */
const CLE_INTRO_EN_ATTENTE = 'vethos:intro-en-attente:v1'

export type IntroEnAttente = {
  ajouts: unknown
  prenom: string
  age: unknown
  contrat: unknown
  ia: 'oui' | 'non'
}

export async function lireIntroEnAttente(): Promise<IntroEnAttente | null> {
  try {
    const brut = await AsyncStorage.getItem(CLE_INTRO_EN_ATTENTE)
    return brut ? (JSON.parse(brut) as IntroEnAttente) : null
  } catch {
    return null
  }
}

export async function oublierIntroEnAttente(): Promise<void> {
  await AsyncStorage.removeItem(CLE_INTRO_EN_ATTENTE)
}

/** Ce que l'appareil sait, avant tout compte : l'introduction déjà vue, une introduction en attente d'un compte. */
export const useAppareil = create<{
  introVue: boolean | undefined
  enAttente: boolean
  charger: () => Promise<void>
  /** L'introduction finie sans compte : ses réponses attendent la connexion. */
  finirSansCompte: (p: IntroEnAttente) => Promise<void>
  /** Les réponses en attente ont été données au compte (ou oubliées). */
  liberer: () => Promise<void>
}>((set) => ({
  introVue: undefined,
  enAttente: false,
  async charger() {
    const [vue, attente] = await Promise.all([introVueSurAppareil(), lireIntroEnAttente()])
    set({ introVue: vue, enAttente: attente !== null })
  },
  async finirSansCompte(p) {
    await AsyncStorage.setItem(CLE_INTRO_EN_ATTENTE, JSON.stringify(p))
    await marquerIntroVue()
    set({ introVue: true, enAttente: true })
  },
  async liberer() {
    await oublierIntroEnAttente()
    set({ enAttente: false })
  },
}))

/**
 * Ce que l'app montre au lancement :
 * - téléchargement neuf (rien vu ici, pas de compte) → l'introduction, puis la porte ;
 * - déjà vu ici, déconnecté → la porte, jamais l'introduction ;
 * - connecté → l'app (un compte neuf y verra son introduction, un compte connu non).
 */
export function ecranDeDepart(compte: string | null | undefined, introVue: boolean | undefined): 'chargement' | 'introduction' | 'porte' | 'app' {
  if (compte === undefined) return 'chargement'
  if (compte) return 'app'
  if (introVue === undefined) return 'chargement'
  return introVue ? 'porte' : 'introduction'
}
