import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import {
  PlageSchema,
  SelectionSchema,
  fusionnerPlages,
  limiterAuxCapacitesIOS,
  type EtatAutorisation,
  type Plage,
  type Selection,
} from './contrat'
import { avecPlage, plagesDuJour } from './pont-seance'
import { pontEcran } from './ecran-natif'

const CLE = 'vethos:blocage:v1'

/** La cle du jour, dans la meme convention que le moteur : local, jamais UTC. */
function cleDuJour(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * L'état du blocage, et la seule route par laquelle il change.
 *
 * Règle tenue partout : l'interface ne parle JAMAIS au pont natif directement.
 * Elle appelle une action d'ici, qui applique dans l'ordre — fusionner, plafonner,
 * programmer — et range le résultat. Sans cela, deux écrans finiraient par
 * programmer des plages contradictoires sans que rien ne le signale.
 */
type EtatBlocage = {
  autorisation: EtatAutorisation
  selection: Selection | null
  /** Ce qui est réellement programmé sur l'appareil, après les limites d'iOS. */
  plagesActives: Plage[]
  /** Plages que le plan voulait mais qu'iOS ne peut pas tenir. */
  ecartees: { courtes: number; plafond: number }
  occupe: boolean
  /** Vrai quand on regarde une simulation et non un vrai iPhone. */
  simule: boolean

  initialiser: () => Promise<void>
  demanderAutorisation: () => Promise<void>
  choisirApplications: () => Promise<void>
  /** Enregistre une selection venue du selecteur natif, qui est une VUE. */
  poserSelection: (s: Selection) => Promise<void>
  appliquerPlan: (plages: readonly Plage[]) => Promise<void>
  /**
   * D.8 : ouvre le bouclier pour une seance qu'on vient de confirmer.
   *
   * C'est la SEULE porte d'entree du blocage. Il n'existe aucune session
   * autonome : sans « Je commence », rien ne se leve jamais.
   */
  ouvrirSeance: (plage: Plage) => Promise<void>
  toutLever: () => Promise<void>
}

export const useBlocage = create<EtatBlocage>((set, get) => ({
  autorisation: 'inconnue',
  selection: null,
  plagesActives: [],
  ecartees: { courtes: 0, plafond: 0 },
  occupe: false,
  simule: !pontEcran().estReel,

  async initialiser() {
    const autorisation = await pontEcran().lireAutorisation()
    set({ autorisation, simule: !pontEcran().estReel })

    // La selection et les plages du jour survivent a une fermeture. Sans ca,
    // rouvrir l'application demandait de re-designer ses applications — et
    // faisait oublier les seances deja ouvertes, donc les laissait programmees
    // sur l'appareil sans que plus rien ne les montre.
    try {
      const brut = await AsyncStorage.getItem(CLE)
      if (!brut) return
      const lu = JSON.parse(brut) as Record<string, unknown>
      const selection = SelectionSchema.safeParse(lu['selection'])
      const plages = PlageSchema.array().safeParse(lu['plages'])
      const date = typeof lu['date'] === 'string' ? lu['date'] : ''
      set({
        ...(selection.success ? { selection: selection.data } : {}),
        plagesActives: plages.success ? plagesDuJour(plages.data, date, cleDuJour()) : [],
      })
    } catch {
      // Une memoire abimee ne doit pas empecher l'ecran de s'ouvrir : sans
      // elle, l'utilisateur redesigne sa selection, et c'est tout.
    }
  },

  async demanderAutorisation() {
    set({ occupe: true })
    try {
      set({ autorisation: await pontEcran().demanderAutorisation() })
    } finally {
      set({ occupe: false })
    }
  },

  async choisirApplications() {
    set({ occupe: true })
    try {
      const choix = await pontEcran().choisirApplications(get().selection?.identifiant)
      // `null` veut dire « refermé sans choisir ». On ne touche à rien : effacer
      // la sélection précédente parce que l'utilisateur a hésité serait une
      // punition, pas un comportement.
      if (choix) await get().poserSelection(choix)
    } finally {
      set({ occupe: false })
    }
  },

  async poserSelection(selection) {
    set({ selection })
    await ranger(get())
  },

  async ouvrirSeance(plage) {
    // Sans selection, il n'y a rien a ecarter. On ne leve pas un bouclier vide
    // « au cas ou » : ce serait un ecran noir sans raison.
    if (!get().selection) return
    await get().appliquerPlan(avecPlage(get().plagesActives, plage))
  },

  async appliquerPlan(plages) {
    const selection = get().selection
    if (!selection) return

    set({ occupe: true })
    try {
      // L'ordre compte. On fusionne AVANT de plafonner : deux blocs collés
      // deviennent une seule plage, et comptent donc pour une seule des vingt
      // surveillances qu'Apple accorde.
      const fusionnees = fusionnerPlages(plages)
      const { retenues, ecarteesCourtes, ecarteesPlafond } = limiterAuxCapacitesIOS(fusionnees)
      await pontEcran().programmer(retenues)
      set({
        plagesActives: retenues,
        ecartees: { courtes: ecarteesCourtes, plafond: ecarteesPlafond },
      })
      await ranger(get())
    } finally {
      set({ occupe: false })
    }
  },

  async toutLever() {
    set({ occupe: true })
    try {
      await pontEcran().toutLever()
      set({ plagesActives: [], ecartees: { courtes: 0, plafond: 0 } })
      await ranger(get())
    } finally {
      set({ occupe: false })
    }
  },
}))

/** Ecrit l'etat durable. La selection et les plages, jamais l'autorisation. */
async function ranger(e: { selection: Selection | null; plagesActives: Plage[] }): Promise<void> {
  try {
    await AsyncStorage.setItem(
      CLE,
      // L'autorisation n'est PAS rangee : elle appartient a iOS, qui peut la
      // retirer pendant que l'application dort. La relire au demarrage est la
      // seule reponse honnete.
      JSON.stringify({ date: cleDuJour(), selection: e.selection, plages: e.plagesActives }),
    )
  } catch {
    // Une ecriture ratee ne doit pas faire tomber l'interface.
  }
}
