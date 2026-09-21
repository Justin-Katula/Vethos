import { computePlan } from '@shared/planning/engine'
import type { PlanningInput, PlanningResult } from '@shared/planning/types'
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
 * Ce qui reste vide, et pourquoi :
 *
 * - `observations` : le moteur apprend de la durée RÉELLE des séances passées.
 *   Le téléphone ne la mesure pas encore — il faudrait le « Je commence » et sa
 *   confirmation de fin. Sans mesure, le moteur retombe sur ses valeurs par
 *   défaut, ce qui est le comportement voulu : il n'invente pas d'historique.
 * - `confirmationSource` : le retard est MESURÉ, jamais déduit. Sans le
 *   composant qui le mesure, il n'y a pas de retard — et surtout pas un retard
 *   supposé.
 */
export function calculerPlan({
  taches,
  objectifs,
  ancres,
  obligations,
  reglages,
  jours = 7,
  maintenant = new Date(),
}: {
  taches: readonly Tache[]
  objectifs: readonly Objectif[]
  ancres: readonly Ancre[]
  obligations: readonly Obligation[]
  reglages: Reglages
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

    tasks: taches
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
        // B.1 : le facteur retenu a la CREATION, pas recalcule ici. Le
        // moteur lit `remainingMinutes`, deja corrige par le magasin ; ce
        // champ ne sert qu'a garder le plan explicable.
        correctionFactor: t.facteurCorrection,
        // B.5/B.5.1 : le decoupage et le rang des parties viennent du magasin.
        // Les mettre a `null` ici, comme avant, annulait le verrouillage
        // sequentiel : les cinq parties d'une tache se placaient toutes dans
        // la meme journee, dans un ordre arbitraire.
        parentTaskId: t.parentId,
        partOrder: t.rangPartie,
        extraMinutes: t.minutesSupplementaires,
        appsToBlock: [],
        status: 'active' as const,
        createdAt: t.creeeLe,
      })),

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
      plan: a.declencheur || a.nom,
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

    observations: [],
    anchorMissCounts: {},
    consecutiveDelays: {},
    dailyUtilization: {},
    weeklyObjectiveServed: {},
    objectiveLastServed: {},
    lastSignalAt: {},
    // D.6 : alimente le plafond de travail en cours. Vide tant que rien
    // n'est mesuré — le moteur retombe alors sur sa valeur par défaut.
    tasksCreatedPerWeek: {},
  }

  return computePlan(entree, maintenant)
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

/**
 * Le sommeil, traduit en obligations quotidiennes.
 *
 * Une nuit qui franchit minuit — 23h30 → 07h00 — ne tient pas dans une seule
 * entrée : `endMinute` ne peut pas être plus petit que `startMinute`. On la
 * coupe donc en deux, le soir puis le matin suivant, ce que le bureau fait
 * aussi. Sans cette coupure, la nuit disparaîtrait du calcul et le moteur
 * croirait la journée deux fois plus longue.
 */
function sommeilEnObligations(reglages: Reglages): Obligation[] {
  const coucher = versMinute(reglages.coucher)
  const lever = versMinute(reglages.lever)
  const sortie: Obligation[] = []

  // Sept jours identiques : la convention de numérotation n'a ici aucune
  // importance, puisque toutes les valeurs de 0 à 6 sont couvertes.
  for (let jour = 0; jour < 7; jour++) {
    if (coucher < lever) {
      // Nuit entièrement dans la même journée : rare, mais légal.
      sortie.push(obligationSommeil(jour, coucher, lever))
      continue
    }
    if (coucher < 1440) sortie.push(obligationSommeil(jour, coucher, 1440))
    if (lever > 0) sortie.push(obligationSommeil(jour, 0, lever))
  }
  return sortie
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

export function versMinute(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return Math.min(1440, Math.max(0, (h ?? 0) * 60 + (m ?? 0)))
}

export function cleDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
