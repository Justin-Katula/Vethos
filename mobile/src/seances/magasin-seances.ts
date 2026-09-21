import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import {
  LearningStateSchema,
  SessionConfirmationsStateSchema,
  type LearningState,
  type SessionConfirmationsState,
} from '@shared/schemas'
import type { EtatSeances } from './pendule'

/**
 * Ce que Vethos a MESURÉ, gardé sur le téléphone.
 *
 * Séparé des engagements (`donnees/magasin`) pour une raison de fond : ce
 * fichier-ci n'est jamais écrit par l'utilisateur. Tout y entre par une
 * confirmation ou par l'écoulement d'une fenêtre. Les mélanger inviterait, un
 * jour, à « corriger » un temps de travail à la main — et le jour où un
 * chiffre mesuré devient modifiable, il cesse d'être une mesure.
 *
 * Les schémas viennent du bureau (`@shared/schemas`), pas d'une copie locale :
 * c'est le même état que la pendule partagée lit et réécrit.
 */

const CLE = 'vethos:seances:v1'

const VIDE_APPRENTISSAGE: LearningState = LearningStateSchema.parse({})

const videPour = (date: string): SessionConfirmationsState =>
  SessionConfirmationsStateSchema.parse({ date })

type EtatMagasin = EtatSeances & {
  chargees: boolean
  charger: (aujourdHui: string) => Promise<void>
  /** Range un état déjà calculé par la pendule. Aucune règle ici. */
  poser: (suivant: EtatSeances) => Promise<void>
}

export const useSeances = create<EtatMagasin>((set, get) => ({
  apprentissage: VIDE_APPRENTISSAGE,
  confirmations: videPour('1970-01-01'),
  chargees: false,

  async charger(aujourdHui) {
    try {
      const brut = await AsyncStorage.getItem(CLE)
      if (!brut) {
        set({ confirmations: videPour(aujourdHui), chargees: true })
        return
      }
      const lu = JSON.parse(brut) as Record<string, unknown>
      // `safeParse` par morceau : une mémoire de confirmation abîmée ne doit
      // pas emporter avec elle des heures de travail réellement mesurées.
      const appris = LearningStateSchema.safeParse(lu['apprentissage'])
      const confs = SessionConfirmationsStateSchema.safeParse(lu['confirmations'])
      set({
        apprentissage: appris.success ? appris.data : VIDE_APPRENTISSAGE,
        confirmations: confs.success ? confs.data : videPour(aujourdHui),
        chargees: true,
      })
    } catch {
      set({ apprentissage: VIDE_APPRENTISSAGE, confirmations: videPour(aujourdHui), chargees: true })
    }
  },

  async poser(suivant) {
    set(suivant)
    const e = get()
    try {
      await AsyncStorage.setItem(
        CLE,
        JSON.stringify({ apprentissage: e.apprentissage, confirmations: e.confirmations }),
      )
    } catch {
      // Une écriture ratée ne doit pas faire tomber l'interface. Le tic
      // suivant réécrira le même état — il est cumulatif, jamais différentiel.
    }
  },
}))
