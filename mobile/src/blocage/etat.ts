import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import {
  PlageSchema,
  SelectionSchema,
  fusionnerPlages,
  limiterAuxCapacitesIOS,
  type EtatAutorisation,
  type ModeBlocage,
  type Plage,
  type Selection,
} from './contrat'
import { avecPlage, plagesDuJour } from './pont-seance'
import { pontEcran } from './ecran-natif'
import { habillageBouclier, titrePourBouclier } from './bouclier'
import type { NomTheme } from '@/theme/jetons'

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
  /** La liste que le mode profond laisse passer. Sans objet en mode normal. */
  gardee: Selection | null
  mode: ModeBlocage
  filtrerLeWeb: boolean
  /** Ce qui est réellement programmé sur l'appareil, après les limites d'iOS. */
  plagesActives: Plage[]
  /**
   * Le titre du bloc que porte le bouclier en ce moment.
   *
   * Gardé ici et pas seulement passé en argument : le bouclier se repose à
   * chaque bascule d'apparence, et un repose qui ne connaît pas le titre le
   * remplace par une phrase générique. Le défaut serait invisible depuis
   * l'application — on ne voit le bouclier qu'en ouvrant ce qu'on a écarté.
   */
  titreSeance: string | null
  /** Plages que le plan voulait mais qu'iOS ne peut pas tenir. */
  ecartees: { courtes: number; plafond: number }
  occupe: boolean
  /** Vrai quand on regarde une simulation et non un vrai iPhone. */
  simule: boolean
  /**
   * Ce qu'iOS répond quand on lui demande si un bouclier est levé, et l'heure
   * à laquelle il l'a dit. `null` tant qu'on n'a pas demandé — jamais `false`
   * par défaut : « pas encore vérifié » et « vérifié, rien n'est levé » sont
   * deux choses différentes, et les confondre ferait mentir l'écran.
   */
  verifie: { leve: boolean; aMs: number } | null

  initialiser: () => Promise<void>
  demanderAutorisation: () => Promise<void>
  choisirApplications: () => Promise<void>
  /** Enregistre une selection venue du selecteur natif, qui est une VUE. */
  poserSelection: (s: Selection) => Promise<void>
  poserGardee: (s: Selection) => Promise<void>
  choisirMode: (m: ModeBlocage) => Promise<void>
  basculerFiltreWeb: () => Promise<void>
  /** Repose l'habillage du bouclier. A chaque seance, et a chaque bascule. */
  habiller: (args: { theme: NomTheme; finMinute: number; titreBloc?: string | null }) => void
  /** Demande a iOS ce qu'il fait vraiment, au lieu de le supposer. */
  verifier: () => boolean
  appliquerPlan: (plages: readonly Plage[]) => Promise<void>
  /**
   * D.8 : ouvre le bouclier pour une seance qu'on vient de confirmer.
   *
   * C'est la SEULE porte d'entree du blocage. Il n'existe aucune session
   * autonome : sans « Je commence », rien ne se leve jamais.
   */
  ouvrirSeance: (plage: Plage, contexte?: { theme: NomTheme; titreBloc: string }) => Promise<void>
  toutLever: () => Promise<void>
}

export const useBlocage = create<EtatBlocage>((set, get) => ({
  autorisation: 'inconnue',
  selection: null,
  gardee: null,
  mode: 'ecarter',
  filtrerLeWeb: false,
  plagesActives: [],
  titreSeance: null,
  ecartees: { courtes: 0, plafond: 0 },
  occupe: false,
  simule: !pontEcran().estReel,
  verifie: null,

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
      const gardee = SelectionSchema.safeParse(lu['gardee'])
      const plages = PlageSchema.array().safeParse(lu['plages'])
      const date = typeof lu['date'] === 'string' ? lu['date'] : ''
      set({
        ...(selection.success ? { selection: selection.data } : {}),
        ...(gardee.success ? { gardee: gardee.data } : {}),
        mode: lu['mode'] === 'profond' ? 'profond' : 'ecarter',
        filtrerLeWeb: lu['filtrerLeWeb'] === true,
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

  async poserGardee(gardee) {
    set({ gardee })
    await ranger(get())
    // La liste gardee ne vit pas seulement chez nous : `enableBlockAllMode` la
    // lit sur l'appareil. La reposer tout de suite evite qu'une seance en
    // cours continue avec l'ancienne, ce que rien a l'ecran ne montrerait.
    if (get().plagesActives.length > 0) await get().appliquerPlan(get().plagesActives)
  },

  async choisirMode(mode) {
    set({ mode })
    await ranger(get())
    if (get().plagesActives.length > 0) await get().appliquerPlan(get().plagesActives)
  },

  async basculerFiltreWeb() {
    set({ filtrerLeWeb: !get().filtrerLeWeb })
    await ranger(get())
    if (get().plagesActives.length > 0) await get().appliquerPlan(get().plagesActives)
  },

  habiller(args) {
    // Le titre passé l'emporte ; à défaut, celui de la séance en cours. Sans
    // ce repli, une bascule d'apparence pendant une séance remplaçait
    // « Chemistry — until 15:30 » par une phrase sans nom de bloc.
    const titreBloc = titrePourBouclier(args.titreBloc, get().titreSeance)
    if (args.titreBloc !== undefined) set({ titreSeance: args.titreBloc })
    pontEcran().habillerBouclier(
      habillageBouclier({
        theme: args.theme,
        finMinute: args.finMinute,
        titreBloc,
        profond: get().mode === 'profond',
      }),
    )
  },

  verifier() {
    const leve = pontEcran().bouclierActif()
    set({ verifie: { leve, aMs: Date.now() } })
    return leve
  },

  async ouvrirSeance(plage, contexte) {
    // Sans selection, il n'y a rien a ecarter. On ne leve pas un bouclier vide
    // « au cas ou » : ce serait un ecran noir sans raison.
    if (!get().selection) return
    // L'habillage AVANT la programmation : c'est ce que l'extension lira au
    // reveil. Depose apres, la premiere ouverture d'une application ecartee
    // montrerait le bouclier de la seance PRECEDENTE — le mauvais titre, la
    // mauvaise heure de fin, et rien pour s'en apercevoir depuis l'ecran.
    if (contexte) {
      get().habiller({
        theme: contexte.theme,
        titreBloc: contexte.titreBloc,
        finMinute: plage.finMinute,
      })
    }
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
      await pontEcran().programmer(retenues, {
        mode: get().mode,
        gardeeId: get().gardee?.identifiant ?? null,
        filtrerLeWeb: get().filtrerLeWeb,
      })
      set({
        plagesActives: retenues,
        ecartees: { courtes: ecarteesCourtes, plafond: ecarteesPlafond },
      })
      await ranger(get())
      // On demande a iOS ce qu'il fait, tout de suite apres le lui avoir
      // demande. C'est la seule ligne de ce fichier qui ne soit pas une
      // declaration d'intention — les deux ont deja diverge en silence.
      get().verifier()
    } finally {
      set({ occupe: false })
    }
  },

  async toutLever() {
    set({ occupe: true })
    try {
      await pontEcran().toutLever()
      set({ plagesActives: [], titreSeance: null, ecartees: { courtes: 0, plafond: 0 } })
      await ranger(get())
      get().verifier()
    } finally {
      set({ occupe: false })
    }
  },
}))

/** Ecrit l'etat durable. Les choix et les plages, jamais l'autorisation. */
async function ranger(e: {
  selection: Selection | null
  gardee: Selection | null
  mode: ModeBlocage
  filtrerLeWeb: boolean
  plagesActives: Plage[]
}): Promise<void> {
  try {
    await AsyncStorage.setItem(
      CLE,
      // L'autorisation n'est PAS rangee : elle appartient a iOS, qui peut la
      // retirer pendant que l'application dort. La relire au demarrage est la
      // seule reponse honnete. `verifie` non plus : une verification d'hier ne
      // dit rien d'aujourd'hui, et la ranger la ferait passer pour fraiche.
      JSON.stringify({
        date: cleDuJour(),
        selection: e.selection,
        gardee: e.gardee,
        mode: e.mode,
        filtrerLeWeb: e.filtrerLeWeb,
        plages: e.plagesActives,
      }),
    )
  } catch {
    // Une ecriture ratee ne doit pas faire tomber l'interface.
  }
}
