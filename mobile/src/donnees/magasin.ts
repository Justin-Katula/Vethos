import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { z } from 'zod'
import { findAncreConflict } from '@shared/planning/placement'
import {
  allouerCouleurAncre,
  allouerCouleurObjectif,
  allouerCouleurTache,
  assainirCouleur,
  estCouleurDansFamille,
} from '@shared/palettes'
import { preparerTache, type BrouillonTache } from './creation'
import type { AjoutsIntroduction } from '@/accueil/modele-introduction'

/**
 * Tout ce que l'utilisateur écrit, gardé sur le téléphone.
 *
 * Rien ne part sur un serveur. C'est une promesse de Vethos, et c'est aussi ce
 * qui permet à l'application de fonctionner dans le métro.
 *
 * Les entités reprennent la forme du bureau — `src/shared/schemas.ts` — mais
 * allégées de ce qui n'a de sens que sur un ordinateur : pas d'applications à
 * bloquer, pas de chemins de fichiers.
 */

const CLE = 'vethos:donnees:v1'

export const TacheSchema = z.object({
  id: z.string(),
  titre: z.string().min(1).max(100),
  /** Ce que la tâche veut dire, dans les mots de l'utilisateur. */
  intention: z.string().max(2000).default(''),
  couleur: z.string().optional(),
  echeance: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  importance: z.number().int().min(1).max(10).default(5),
  /** Ce que l'utilisateur a annoncé. Gardé tel quel, pour mémoire. */
  minutesEstimees: z.number().int().min(5).max(10000).default(60),
  /**
   * B.1/B.4 : ce qu'il reste à faire, déjà CORRIGÉ à la création. Le plafond
   * dépasse celui de l'estimation parce que la correction peut multiplier par
   * 1,7 — un maximum identique rejetterait à la relecture une tâche que
   * l'application vient elle-même d'écrire.
   */
  minutesRestantes: z.number().int().min(0).max(20000).default(60),
  /** Le facteur retenu à la création. Conservé pour que le plan reste explicable. */
  facteurCorrection: z.number().min(1).max(3).default(1.4),
  /** B.5.2 : le temps accordé par « il m'en faut plus ». S'ajoute APRÈS le facteur. */
  minutesSupplementaires: z.number().int().min(0).max(20000).default(0),
  /** B.5 : la tâche d'origine quand celle-ci n'est qu'une de ses parties. */
  parentId: z.string().nullable().default(null),
  /** B.5.1 : le rang de la partie. C'est lui qui la verrouille tant qu'une sœur traîne. */
  rangPartie: z.number().int().nullable().default(null),
  /** `nouveau` déclenche la marge de sécurité du moteur : on estime toujours trop bas. */
  nature: z.enum(['routine', 'nouveau']).default('routine'),
  terminee: z.boolean().default(false),
  creeeLe: z.string(),
})
export type Tache = z.infer<typeof TacheSchema>

export const ObjectifSchema = z.object({
  id: z.string(),
  nom: z.string().min(1).max(60),
  intention: z.string().max(2000).default(''),
  couleur: z.string(),
  /** Minutes visées par semaine. Le moteur répartit, l'utilisateur ne place rien. */
  cibleHebdoMinutes: z.number().int().min(0).max(6000).default(300),
  creeLe: z.string(),
})
export type Objectif = z.infer<typeof ObjectifSchema>

export const AncreSchema = z.object({
  id: z.string(),
  nom: z.string().min(1).max(60),
  /**
   * Le plan : en quoi ca consiste concretement. Obligatoire a la creation,
   * comme sur le bureau et pour la meme raison qu'une tache — « faire du
   * sport » ne dit ni ou, ni quoi, ni comment commencer.
   */
  intention: z.string().max(2000).default(''),
  /** Ce qui la déclenche : « après le déjeuner », « en rentrant ». */
  declencheur: z.string().max(80).default(''),
  couleur: z.string(),
  /** Minute depuis minuit. Une ancre ne se déplace pas : c'est tout son intérêt. */
  minuteAncrage: z.number().int().min(0).max(1439),
  jours: z.array(z.number().int().min(0).max(6)).min(1),
  dureeMinutes: z.number().int().min(15).max(480).default(60),
  creeeLe: z.string(),
})
export type Ancre = z.infer<typeof AncreSchema>


/**
 * Une obligation fixe : ce que la semaine impose déjà.
 *
 * La forme est celle du bureau — `ScheduleEntry` — au champ près, pour que le
 * moteur partagé la consomme sans traduction. Traduire ici serait s'inventer
 * une occasion de diverger.
 */
export const ObligationSchema = z.object({
  id: z.string(),
  dayOfWeek: z.number().int().min(0).max(6),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
  categoryType: z.enum(['sleep', 'school', 'work', 'commute', 'commitment', 'custom']),
  label: z.string().min(1).max(60),
  color: z.string(),
  /**
   * Occurrence UNIQUE (AAAA-MM-JJ). Absent = recurrente chaque semaine sur
   * `dayOfWeek`, le defaut. Presente = cette seule date, jamais repetee la
   * semaine suivante.
   *
   * Sans elle, un examen ou un rendez-vous ne pouvait se declarer que comme
   * une obligation hebdomadaire — et amputait la capacite de toutes les
   * semaines suivantes jusqu'a ce qu'on pense a la supprimer.
   */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})
export type Obligation = z.infer<typeof ObligationSchema>

export const ReglagesSchema = z.object({
  prenom: z.string().max(40).default(''),
  /**
   * Les quatre modes du bureau : suivre l'appareil, clair, sombre, à l'heure.
   * Le vocabulaire vient de `@shared/theme` — le partager évite que les deux
   * applications ne finissent par ne plus s'accorder sur ce que « à l'heure »
   * veut dire.
   */
  apparence: z.enum(['system', 'light', 'dark', 'schedule']).default('system'),
  /**
   * Les deux bascules du mode « a l'heure ». Sans elles, ce mode existait dans
   * le selecteur mais tournait sur des valeurs que personne ne pouvait changer
   * — un reglage qu'on choisit et qui ne se regle pas.
   */
  clairDes: z.string().default('07:00'),
  sombreDes: z.string().default('19:00'),
  /** Le premier lancement a-t-il ete fait ? Relançable depuis les reglages. */
  introductionFaite: z.boolean().default(false),
  /** Source unique du sommeil, comme sur le bureau. */
  coucher: z.string().default('23:30'),
  lever: z.string().default('07:00'),
  /**
   * La nuit déclarée à l'introduction. Ensuite, le sommeil ne se déplace que
   * de 2 h au total autour d'elle (coucher + lever), et reste entre 6 et 10 h.
   * Null tant qu'aucune introduction n'a fixé de référence.
   */
  sommeilReference: z.object({ coucher: z.string(), lever: z.string() }).nullish(),
  /** La tranche d'âge, demandée à l'introduction : elle fixe le plancher de sommeil. */
  trancheAge: z.enum(['ado', 'adulte']).nullish(),
})
export type Reglages = z.infer<typeof ReglagesSchema>

const ContenuSchema = z.object({
  taches: z.array(TacheSchema).default([]),
  objectifs: z.array(ObjectifSchema).default([]),
  ancres: z.array(AncreSchema).default([]),
  obligations: z.array(ObligationSchema).default([]),
  reglages: ReglagesSchema.default({}),
})
export type Contenu = z.infer<typeof ContenuSchema>

const VIDE: Contenu = {
  taches: [],
  objectifs: [],
  ancres: [],
  obligations: [],
  reglages: ReglagesSchema.parse({}),
}

/** Identifiant court, lisible dans les journaux, sans dépendance. */
export function identifiant(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

type EtatDonnees = Contenu & {
  chargees: boolean
  charger: () => Promise<void>

  ajouterTache: (
    t: BrouillonTache,
    /**
     * Le plafond de travail qu'une journee peut absorber, lu dans le plan
     * courant. Absent, le decoupage de B.5 ne se declenche pas : mieux vaut une
     * tache entiere qu'un decoupage calcule sur une capacite inventee.
     */
    options?: { maxParJourMinutes?: number },
  ) => Promise<void>
  ajouterDuTemps: (id: string, minutes: number) => Promise<void>
  /**
   * B.5.2 : la seule voie par laquelle une tache se termine — la pendule, sur
   * du temps REELLEMENT mesure. Il n'existe deliberement aucune fonction pour
   * qu'un geste de l'utilisateur la termine : la completion se constate, elle
   * ne se declare pas.
   */
  terminerTaches: (ids: readonly string[]) => Promise<void>
  supprimerTache: (id: string) => Promise<void>

  ajouterObjectif: (o: Omit<Objectif, 'id' | 'creeLe'>) => Promise<void>
  supprimerObjectif: (id: string) => Promise<void>

  ajouterAncre: (a: Omit<Ancre, 'id' | 'creeeLe'>) => Promise<void>
  supprimerAncre: (id: string) => Promise<void>

  ajouterObligation: (o: Omit<Obligation, 'id'>) => Promise<void>
  supprimerObligation: (id: string) => Promise<void>

  majReglages: (r: Partial<Reglages>) => Promise<void>
  finaliserIntroduction: (ajouts: AjoutsIntroduction, prenom: string, trancheAge?: 'ado' | 'adulte' | null) => Promise<void>
}

async function ecrire(contenu: Contenu): Promise<void> {
  try {
    await AsyncStorage.setItem(CLE, JSON.stringify(contenu))
  } catch {
    // Un échec d'écriture ne doit pas faire tomber l'interface : l'utilisateur
    // garde ce qu'il vient de saisir à l'écran, et la prochaine écriture
    // réussira probablement.
  }
}

export const useDonnees = create<EtatDonnees>((set, get) => {
  /** Range l'état en mémoire ET sur le disque, toujours dans cet ordre. */
  const enregistrer = async (partiel: Partial<Contenu>) => {
    set(partiel)
    const e = get()
    await ecrire({
      taches: e.taches,
      objectifs: e.objectifs,
      ancres: e.ancres,
      obligations: e.obligations,
      reglages: e.reglages,
    })
  }

  return {
    ...VIDE,
    chargees: false,

    async charger() {
      try {
        const brut = await AsyncStorage.getItem(CLE)
        if (!brut) {
          set({ chargees: true })
          return
        }
        // `safeParse` : un fichier d'une version précédente ne doit jamais
        // empêcher l'application de s'ouvrir. On repart de vide plutôt que de
        // planter — et l'utilisateur voit une application neuve, pas un écran noir.
        const lu = ContenuSchema.safeParse(JSON.parse(brut))
        if (!lu.success) {
          set({ ...VIDE, chargees: true })
          return
        }

        // Assainissement immédiat des couleurs des engagements :
        // 1. Les objectifs DOIVENT être dans PALETTE_OBJECTIFS (rouge).
        // 2. Les tâches DOIVENT être dans PALETTE_TACHES (gris).
        // 3. Les ancres DOIVENT être dans PALETTE_ANCRES (bleu froid).
        let modifie = false
        const objectifs = lu.data.objectifs.map((o, i) => {
          const propre = assainirCouleur('objective', o.couleur, i)
          if (propre !== o.couleur) modifie = true
          return { ...o, couleur: propre }
        })
        const ancres = lu.data.ancres.map((a, i) => {
          const propre = assainirCouleur('ancre', a.couleur, i)
          if (propre !== a.couleur) modifie = true
          return { ...a, couleur: propre }
        })
        const taches = lu.data.taches.map((t, i) => {
          const propre = assainirCouleur('task', t.couleur, i)
          if (propre !== t.couleur) modifie = true
          return { ...t, couleur: propre }
        })

        set({
          ...lu.data,
          objectifs,
          ancres,
          taches,
          chargees: true,
        })

        if (modifie) {
          void ecrire({
            taches,
            objectifs,
            ancres,
            obligations: lu.data.obligations,
            reglages: lu.data.reglages,
          })
        }
      } catch {
        set({ ...VIDE, chargees: true })
      }
    },

    async ajouterTache(t, options) {
      // Les deux lois de creation — correction de l'estimation (B.1/B.4) et
      // decoupage automatique (B.5) — vivent dans `creation.ts`, ou elles se
      // verifient sans magasin ni AsyncStorage.
      const couleur =
        t.couleur && estCouleurDansFamille('task', t.couleur)
          ? t.couleur
          : allouerCouleurTache(get().taches.filter((x) => !x.terminee))

      const creees = preparerTache(
        { ...t, couleur },
        {
          identifiant,
          ...(options?.maxParJourMinutes !== undefined
            ? { maxParJourMinutes: options.maxParJourMinutes }
            : {}),
        },
      )
      await enregistrer({ taches: [...creees, ...get().taches] })
    },

    /**
     * B.5.2 : « il m'en faut plus ».
     *
     * Le temps accordé s'ajoute APRÈS le facteur, jamais avant : il est donné
     * en minutes réelles par quelqu'un qui vient de constater que le temps
     * prévu ne suffisait pas. Le corriger une seconde fois gonflerait un
     * chiffre déjà vrai.
     */
    async ajouterDuTemps(id, minutes) {
      const ajout = Math.max(0, Math.round(minutes))
      if (ajout === 0) return
      await enregistrer({
        taches: get().taches.map((t) =>
          t.id === id
            ? {
                ...t,
                minutesSupplementaires: t.minutesSupplementaires + ajout,
                // La tâche redevient active si l'horloge venait de la terminer.
                // C'est précisément le cas que ce geste existe pour rattraper :
                // le temps prévu était fait, le travail ne l'était pas.
                terminee: false,
              }
            : t,
        ),
      })
    },

    async terminerTaches(ids) {
      const finies = new Set(ids)
      const taches = get().taches
      // Rien de neuf : on evite une ecriture disque a chaque minute.
      if (!taches.some((t) => finies.has(t.id) && !t.terminee)) return

      // `minutesRestantes` n'est PAS remis a zero : il porte le total
      // PLANIFIE, et c'est lui qui fixe la ligne d'arrivee. L'ecraser
      // casserait « il m'en faut plus » — la cible retomberait aux seules
      // minutes ajoutees, deja depassees par le travail fait, et la tache se
      // reterminerait dans la seconde.
      await enregistrer({
        taches: taches.map((t) => (finies.has(t.id) ? { ...t, terminee: true } : t)),
      })
    },

    async supprimerTache(id) {
      await enregistrer({ taches: get().taches.filter((t) => t.id !== id) })
    },

    async ajouterObjectif(o) {
      const couleur =
        o.couleur && estCouleurDansFamille('objective', o.couleur)
          ? o.couleur
          : allouerCouleurObjectif(get().objectifs)
      const objectif: Objectif = {
        ...o,
        couleur,
        id: identifiant(),
        creeLe: new Date().toISOString(),
      }
      await enregistrer({ objectifs: [objectif, ...get().objectifs] })
    },

    async supprimerObjectif(id) {
      await enregistrer({ objectifs: get().objectifs.filter((o) => o.id !== id) })
    },

    async ajouterAncre(a) {
      // D.3 : conflit d'heure ou de declencheur -> creation REFUSEE, sans
      // exception. Pas de fusion, pas de decalage automatique. Decaler tout
      // seul reviendrait a deplacer la seule chose de l'application qui a le
      // droit de ne jamais bouger ; c'est a l'utilisateur de choisir une autre
      // heure. La regle est celle du bureau, pas une copie.
      //
      // Les jours ne sont PAS convertis vers la convention du moteur ici, et
      // c'est volontaire : la detection n'est qu'un test de recouvrement entre
      // deux ensembles, et les deux cotes viennent du meme magasin, donc de la
      // meme convention. Convertir ne changerait aucun resultat et ferait
      // croire a une subtilite qui n'existe pas.
      const conflit = findAncreConflict(
        {
          anchorMinute: a.minuteAncrage,
          normalMaxMinutes: a.dureeMinutes,
          daysOfWeek: a.jours,
          trigger: a.declencheur || a.nom,
        },
        get().ancres.map((x) => ({
          id: x.id,
          name: x.nom,
          plan: x.declencheur || x.nom,
          color: x.couleur,
          trigger: x.declencheur || x.nom,
          anchorMinute: x.minuteAncrage,
          daysOfWeek: x.jours,
          normalMaxMinutes: x.dureeMinutes,
          minimumMinutes: Math.max(20, Math.round(x.dureeMinutes * 0.4)),
          appsToBlock: [],
          createdAt: x.creeeLe,
        })),
      )
      if (conflit) {
        const memeDeclencheur =
          conflit.trigger.trim().toLowerCase() === (a.declencheur || a.nom).trim().toLowerCase()
        throw new Error(
          memeDeclencheur
            ? `« ${conflit.name} » utilise déjà le déclencheur « ${conflit.trigger} ».`
            : `Conflit d’horaire avec « ${conflit.name} ». Choisis une autre heure.`,
        )
      }

      const couleur =
        a.couleur && estCouleurDansFamille('ancre', a.couleur)
          ? a.couleur
          : allouerCouleurAncre(get().ancres)
      const ancre: Ancre = { ...a, couleur, id: identifiant(), creeeLe: new Date().toISOString() }
      await enregistrer({ ancres: [ancre, ...get().ancres] })
    },

    async supprimerAncre(id) {
      await enregistrer({ ancres: get().ancres.filter((a) => a.id !== id) })
    },

    async ajouterObligation(o) {
      await enregistrer({ obligations: [...get().obligations, { ...o, id: identifiant() }] })
    },

    async supprimerObligation(id) {
      await enregistrer({ obligations: get().obligations.filter((o) => o.id !== id) })
    },

    async majReglages(r) {
      await enregistrer({ reglages: { ...get().reglages, ...r } })
    },

    async finaliserIntroduction(ajouts, prenom, trancheAge) {
      const actuel = get()
      const fusionner = <T extends { id: string }>(existants: T[], nouveaux: T[]) => {
        const ids = new Set(existants.map((x) => x.id))
        return [...existants, ...nouveaux.filter((x) => !ids.has(x.id))]
      }
      const contenu = ContenuSchema.parse({
        taches: fusionner(actuel.taches, ajouts.taches),
        objectifs: fusionner(actuel.objectifs, ajouts.objectifs),
        ancres: fusionner(actuel.ancres, ajouts.ancres),
        obligations: fusionner(actuel.obligations, ajouts.obligations),
        reglages: {
          ...actuel.reglages,
          prenom,
          coucher: ajouts.coucher,
          lever: ajouts.lever,
          sommeilReference: { coucher: ajouts.coucher, lever: ajouts.lever },
          trancheAge: trancheAge ?? actuel.reglages.trancheAge ?? null,
          introductionFaite: true,
        },
      })
      // Le parcours ne disparaît qu'après une vraie sauvegarde. Un échec laisse
      // le brouillon intact et réessayable, sans créer de doublons.
      await AsyncStorage.setItem(CLE, JSON.stringify(contenu))
      set(contenu)
    },
  }
})
