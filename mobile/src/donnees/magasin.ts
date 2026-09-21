import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { z } from 'zod'

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
  echeance: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  importance: z.number().int().min(1).max(10).default(5),
  /** Minutes estimées au départ, et ce qu'il en reste. */
  minutesEstimees: z.number().int().min(5).max(10000).default(60),
  minutesRestantes: z.number().int().min(0).max(10000).default(60),
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
  /** Source unique du sommeil, comme sur le bureau. */
  coucher: z.string().default('23:30'),
  lever: z.string().default('07:00'),
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

  ajouterTache: (t: Omit<Tache, 'id' | 'creeeLe' | 'terminee' | 'minutesRestantes'>) => Promise<void>
  basculerTache: (id: string) => Promise<void>
  supprimerTache: (id: string) => Promise<void>

  ajouterObjectif: (o: Omit<Objectif, 'id' | 'creeLe'>) => Promise<void>
  supprimerObjectif: (id: string) => Promise<void>

  ajouterAncre: (a: Omit<Ancre, 'id' | 'creeeLe'>) => Promise<void>
  supprimerAncre: (id: string) => Promise<void>

  ajouterObligation: (o: Omit<Obligation, 'id'>) => Promise<void>
  supprimerObligation: (id: string) => Promise<void>

  majReglages: (r: Partial<Reglages>) => Promise<void>
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
        set(lu.success ? { ...lu.data, chargees: true } : { ...VIDE, chargees: true })
      } catch {
        set({ ...VIDE, chargees: true })
      }
    },

    async ajouterTache(t) {
      const tache: Tache = {
        ...t,
        id: identifiant(),
        terminee: false,
        minutesRestantes: t.minutesEstimees,
        creeeLe: new Date().toISOString(),
      }
      await enregistrer({ taches: [tache, ...get().taches] })
    },

    async basculerTache(id) {
      await enregistrer({
        taches: get().taches.map((t) =>
          t.id === id
            ? { ...t, terminee: !t.terminee, minutesRestantes: t.terminee ? t.minutesEstimees : 0 }
            : t,
        ),
      })
    },

    async supprimerTache(id) {
      await enregistrer({ taches: get().taches.filter((t) => t.id !== id) })
    },

    async ajouterObjectif(o) {
      const objectif: Objectif = { ...o, id: identifiant(), creeLe: new Date().toISOString() }
      await enregistrer({ objectifs: [objectif, ...get().objectifs] })
    },

    async supprimerObjectif(id) {
      await enregistrer({ objectifs: get().objectifs.filter((o) => o.id !== id) })
    },

    async ajouterAncre(a) {
      const ancre: Ancre = { ...a, id: identifiant(), creeeLe: new Date().toISOString() }
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
  }
})
