import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { cleCompte, compteCourant, ecrireTiroir } from '@/compte/espace'
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
  /** Le compte dont ces séances sont le tiroir (null : le tiroir commun). */
  proprietaire: string | null
  charger: (aujourdHui: string) => Promise<void>
  /** Range un état déjà calculé par la pendule. Aucune règle ici. */
  poser: (suivant: EtatSeances) => Promise<void>
}

export const useSeances = create<EtatMagasin>((set, get) => ({
  apprentissage: VIDE_APPRENTISSAGE,
  confirmations: videPour('1970-01-01'),
  chargees: false,
  proprietaire: null,

  async charger(aujourdHui) {
    const proprietaire = compteCourant()
    try {
      const brut = await AsyncStorage.getItem(cleCompte(CLE, proprietaire))
      if (!brut) {
        set({ apprentissage: VIDE_APPRENTISSAGE, confirmations: videPour(aujourdHui), proprietaire, chargees: true })
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
        proprietaire,
        chargees: true,
      })
    } catch {
      set({ apprentissage: VIDE_APPRENTISSAGE, confirmations: videPour(aujourdHui), proprietaire, chargees: true })
    }
  },

  async poser(suivant) {
    set(suivant)
    const e = get()
    try {
      await ecrireTiroir(
        CLE,
        e.proprietaire,
        JSON.stringify({ apprentissage: e.apprentissage, confirmations: e.confirmations }),
      )
    } catch {
      // Une écriture ratée ne doit pas faire tomber l'interface. Le tic
      // suivant réécrira le même état — il est cumulatif, jamais différentiel.
    }
  },
}))
