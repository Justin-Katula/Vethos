import { create } from 'zustand'
import {
  fusionnerPlages,
  limiterAuxCapacitesIOS,
  type EtatAutorisation,
  type Plage,
  type Selection,
} from './contrat'
import { pontEcran } from './ecran-natif'

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
  appliquerPlan: (plages: readonly Plage[]) => Promise<void>
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
      if (choix) set({ selection: choix })
    } finally {
      set({ occupe: false })
    }
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
    } finally {
      set({ occupe: false })
    }
  },

  async toutLever() {
    set({ occupe: true })
    try {
      await pontEcran().toutLever()
      set({ plagesActives: [], ecartees: { courtes: 0, plafond: 0 } })
    } finally {
      set({ occupe: false })
    }
  },
}))
