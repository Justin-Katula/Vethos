import { computePlan } from '@shared/planning/engine'
import type {
  ActiveSession,
  PlanningInput,
  PlanningResult,
  SessionConfirmationSource,
  TaskItem,
} from '@shared/planning/types'
import type { LearningState } from '@shared/schemas'
import { sleepIntervals } from '@shared/sleep'
import type { Ancre, Objectif, Obligation, Reglages, Tache } from '@/donnees/magasin'

/**
 * Le VRAI moteur, celui du bureau, nourri par les données du téléphone.
 *
 * Plus de placeur maison : `computePlan` fait la capacité effective, la cascade
 * de placement, le test de faisabilité par densité, la protection du repos et
 * le plafond de travail en cours. C'est 6 900 lignes et 271 tests, et il est
 * déclaré **intouchable** par le contrat produit.
 *
 * Ce fichier ne fait donc qu'une chose : traduire. Les entités du téléphone
 * portent des noms français et n'ont pas tous les champs du bureau ; on les
 * complète avec les valeurs par défaut que le moteur attend, sans jamais
 * inventer une règle de placement ici.
 *
 * `apprentissage` est optionnel, et son absence a un sens précis : sans lui, le
 * moteur ne reçoit ni observations, ni retard mesuré, ni temps réellement fait.
 * Il retombe alors sur ses valeurs par défaut — ce qui est le comportement
 * voulu, et jamais un historique inventé. La pendule de séance le fournit dès
 * qu'un « Je commence » a été pressé.
 *
 * Ce qui reste vide, et pourquoi :
 *
 * - `appsToBlock`, partout : le blocage d'applications n'existe pas sur iOS
 *   sous la forme du bureau — un `ApplicationToken` y est opaque, et ce qui
 *   remplace cette liste vit dans `src/blocage/`.
 * - `category`, toujours « général » : le téléphone ne demande pas de
 *   catégorie à la création. Le facteur de correction s'apprend donc sur un
 *   seul groupe au lieu d'un par domaine — moins fin que le bureau, mais
 *   jamais faux.
 */
export function calculerPlan({
  taches,
  objectifs,
  ancres,
  obligations,
  reglages,
  apprentissage,
  seanceActive = null,
  jours = 7,
  maintenant = new Date(),
}: {
  taches: readonly Tache[]
  objectifs: readonly Objectif[]
  ancres: readonly Ancre[]
  obligations: readonly Obligation[]
  reglages: Reglages
  /** Ce qui a ete MESURE : temps fait, retards, ratees, observations. */
  apprentissage?: LearningState
  /** D.7 : la seance confirmee en cours. Elle se produit deja, donc on ne la replace pas. */
  seanceActive?: ActiveSession | null
  /** Horizon, en jours. Sept couvre la semaine que le moteur raisonne. */
  jours?: number
  maintenant?: Date
}): PlanningResult {
  const aujourdhui = cleDate(maintenant)
  const fin = new Date(maintenant)
  fin.setDate(fin.getDate() + Math.max(0, jours - 1))

  const entree: PlanningInput = {
    today: aujourdhui,
    rangeEnd: cleDate(fin),

    tasks: versTachesMoteur(taches),

    objectives: objectifs.map((o) => ({
      id: o.id,
      name: o.nom,
      plan: o.intention || o.nom,
      color: o.couleur,
      weeklyTargetMinutes: o.cibleHebdoMinutes,
      appsToBlock: [],
      createdAt: o.creeLe,
    })),

    ancres: ancres.map((a) => ({
      id: a.id,
      name: a.nom,
      plan: a.intention || a.nom,
      color: a.couleur,
      trigger: a.declencheur || a.nom,
      anchorMinute: a.minuteAncrage,
      daysOfWeek: a.jours.map(versJourMoteur),
      normalMaxMinutes: a.dureeMinutes,
      // D.3 : la version minimale, celle à laquelle une ancre peut être réduite
      // un jour de crise prouvée. Jamais en dessous — une ancre réduite à rien
      // n'est plus une ancre.
      minimumMinutes: Math.max(20, Math.round(a.dureeMinutes * 0.4)),
      appsToBlock: [],
      createdAt: a.creeeLe,
    })),

    // Le sommeil est une obligation comme les autres pour le moteur, et c'est
    // ce qui garantit que rien ne se place dessus.
    schedule: [
      ...obligations.map((o) => ({ ...o, dayOfWeek: versJourMoteur(o.dayOfWeek) })),
      ...sommeilEnObligations(reglages),
    ],

    observations: apprentissage?.observations ?? [],
    anchorMissCounts: apprentissage?.anchorMissCounts ?? {},
    consecutiveDelays: apprentissage?.consecutiveDelays ?? {},
    dailyUtilization: apprentissage?.dailyUtilization ?? {},
    weeklyObjectiveServed: apprentissage?.weeklyObjectiveServed ?? {},
    objectiveLastServed: apprentissage?.objectiveLastServed ?? {},
    lastSignalAt: apprentissage?.lastSignalAt ?? {},
    // D.6 : alimente le plafond de travail en cours. Vide tant que rien
    // n'est mesuré — le moteur retombe alors sur sa valeur par défaut.
    tasksCreatedPerWeek: apprentissage?.tasksCreatedPerWeek ?? {},

    // D.7 : le retard est MESURE par « Je commence », jamais deduit ici.
    // `wasNeverConfirmed` reste faux comme sur le bureau : le fait de
    // non-demarrage se lit dans les compteurs, pas dans une supposition.
    ...(apprentissage ? { confirmationSource: sourceConfirmation(apprentissage) } : {}),
    // B.5.2 : le temps REELLEMENT fait. Sans lui, le travail restant ne
    // diminue jamais tout seul et la boucle d'apprentissage tourne a vide.
    ...(apprentissage
      ? {
          durationSource: {
            getActualMinutes: (id: string) => apprentissage.workedMinutesByRef[id] ?? null,
          },
        }
      : {}),
    ...(seanceActive ? { activeSession: seanceActive } : {}),
  }

  return computePlan(entree, maintenant)
}

function sourceConfirmation(apprentissage: LearningState): SessionConfirmationSource {
  return {
    getDelayMinutes: (date) => apprentissage.dailyDelayMinutes[date] ?? 0,
    wasNeverConfirmed: () => false,
  }
}

/**
 * Les taches du telephone, dans la forme que le moteur ET la pendule lisent.
 *
 * Une seule traduction pour les deux : `tasksToAutoComplete` vise exactement
 * la meme ligne d'arrivee que le placement (`plannedTotalFor`), et une seconde
 * traduction qui deriverait d'un champ ferait viser deux cibles differentes —
 * une tache qui ne se terminerait jamais toute seule.
 */
export function versTachesMoteur(taches: readonly Tache[]): TaskItem[] {
  return taches
    .filter((t) => !t.terminee)
    .map((t) => ({
      id: t.id,
      title: t.titre,
      plan: t.intention || t.titre,
      deadline: t.echeance,
      importance: t.importance,
      category: 'général',
      workKind: t.nature === 'nouveau' ? ('novel' as const) : ('routine' as const),
      estimatedMinutes: t.minutesEstimees,
      remainingMinutes: t.minutesRestantes,
      // B.1 : le facteur retenu a la CREATION, pas recalcule ici. Le moteur
      // lit `remainingMinutes`, deja corrige par le magasin ; ce champ ne sert
      // qu'a garder le plan explicable.
      correctionFactor: t.facteurCorrection,
      // B.5/B.5.1 : le decoupage et le rang des parties viennent du magasin.
      parentTaskId: t.parentId,
      partOrder: t.rangPartie,
      extraMinutes: t.minutesSupplementaires,
      appsToBlock: [],
      status: 'active' as const,
      createdAt: t.creeeLe,
    }))
}

/**
 * Du jour JavaScript vers le jour du moteur.
 *
 * JavaScript compte dimanche = 0. Le moteur compte **lundi = 0** — c'est
 * `dayOfWeek()` dans `@shared/planning/dates` qui le décide, par
 * `(getDay() + 6) % 7`.
 *
 * Sans cette conversion tout se décale d'un cran, en silence : une ancre
 * déclarée « en semaine » tombe du mardi au samedi, un cours du lundi matin
 * laisse le lundi libre et bloque le mardi. Rien ne lève d'erreur — le plan est
 * simplement faux, et personne ne s'en aperçoit avant d'avoir raté un cours.
 */
function versJourMoteur(jourJavaScript: number): number {
  return (jourJavaScript + 6) % 7
}

/** Les heures de repli. Une nuit illisible ne doit jamais devenir une nuit absente. */
const SOMMEIL_DEFAUT = { coucher: '23:30', lever: '07:00' } as const

/**
 * LES plages de sommeil, source unique du telephone.
 *
 * Tout ce qui parle de la nuit passe par ici : ce que le moteur soustrait de
 * la capacite, ce que le cadran peint, ce que la semaine montre, la duree
 * d'eveil affichee dans les reglages. Chacun de ces endroits avait recalcule
 * la decoupe tout seul — trois versions de la meme nuit, dont deux pouvaient
 * se tromper en silence sur l'autre.
 *
 * La decoupe elle-meme vient de `@shared/sleep`. Le repli sur les heures par
 * defaut est propre au telephone : le champ des reglages est un TextInput
 * libre, et pendant qu'on tape « 2 » avant « 23:30 », `parseHHMM` rend `null`.
 * Sans repli, la nuit disparaitrait du calcul a cet instant-la et le moteur
 * poserait du travail a 3 h du matin. Une heure illisible est une heure qu'on
 * n'a pas encore fini d'ecrire, jamais l'absence de nuit.
 */
export function plagesSommeil(reglages: Reglages): ReturnType<typeof sleepIntervals> {
  const plages = sleepIntervals(reglages.coucher, reglages.lever)
  if (plages.length > 0) return plages
  return sleepIntervals(SOMMEIL_DEFAUT.coucher, SOMMEIL_DEFAUT.lever)
}

/** Minutes d'eveil dans une journee, deduites des memes plages. */
export function minutesEveil(reglages: Reglages): number {
  return 1440 - plagesSommeil(reglages).reduce((s, p) => s + (p.endMinute - p.startMinute), 0)
}

/**
 * Le sommeil, traduit en obligations quotidiennes.
 *
 * La découpe — une nuit qui franchit minuit ne tient pas dans une seule entrée,
 * `endMinute` ne pouvant pas être plus petit que `startMinute` — vient de
 * `@shared/sleep`, la source unique du bureau. La réécrire ici donnait deux
 * définitions du sommeil, et une de trop.
 *
 * Le repli sur les heures par défaut est en revanche propre au téléphone, et
 * il est nécessaire : le champ des réglages est un TextInput libre, et pendant
 * qu'on tape « 2 » avant « 23:30 », `parseHHMM` rend `null`. Sans repli, la
 * nuit disparaîtrait du calcul à cet instant-là et le moteur poserait du
 * travail à 3 h du matin. Une heure illisible est une heure qu'on n'a pas
 * encore finie d'écrire, jamais l'absence de nuit.
 */
function sommeilEnObligations(reglages: Reglages): Obligation[] {
  // Sept jours identiques : la convention de numérotation n'a ici aucune
  // importance, puisque toutes les valeurs de 0 à 6 sont couvertes.
  return Array.from({ length: 7 }, (_, jour) =>
    plagesSommeil(reglages).map((p) => obligationSommeil(jour, p.startMinute, p.endMinute)),
  ).flat()
}

function obligationSommeil(jour: number, debut: number, fin: number): Obligation {
  return {
    id: `sommeil-${jour}-${debut}`,
    dayOfWeek: jour,
    startMinute: debut,
    endMinute: fin,
    categoryType: 'sleep',
    label: 'Sommeil',
    color: '#2f2f2f',
  }
}

export function cleDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
