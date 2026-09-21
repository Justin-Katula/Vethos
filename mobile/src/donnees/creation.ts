import { autoSplit, computePlannedDuration, planningFactor } from '@shared/planning/estimation'
import type { Tache } from './magasin'

/**
 * Ce qui arrive à une tâche entre le formulaire et le magasin.
 *
 * Deux lois s'appliquent là, et nulle part ailleurs :
 *
 * - **B.1/B.4 — l'estimation est corrigée.** On estime tous trop bas, et plus
 *   bas encore sur ce qu'on n'a jamais fait. L'application ne prend donc jamais
 *   le chiffre au mot : elle le multiplie par un facteur (1,4 pour du connu,
 *   1,7 pour une première fois) avant de le ranger. Corriger après coup, en
 *   constatant le dépassement, arriverait toujours trop tard pour le plan.
 * - **B.5 — la tâche trop grosse est découpée.** Si la durée corrigée ne tient
 *   plus dans une journée sous le plafond de D.5, elle devient des parties
 *   numérotées. Automatiquement, jamais en posant la question : demander
 *   « veux-tu la couper ? » revient à faire décider quelqu'un avec exactement
 *   l'information qui lui manque.
 *
 * Isolé du magasin parce qu'une loi qui exige un AsyncStorage pour être
 * vérifiée finit par n'être vérifiée nulle part.
 */

export type BrouillonTache = Omit<
  Tache,
  | 'id'
  | 'creeeLe'
  | 'terminee'
  | 'minutesRestantes'
  | 'facteurCorrection'
  | 'minutesSupplementaires'
  | 'parentId'
  | 'rangPartie'
>

export function preparerTache(
  brouillon: BrouillonTache,
  options: {
    /** Plafond de travail qu'une journée absorbe, lu dans le plan courant. */
    maxParJourMinutes?: number
    identifiant: () => string
    maintenant?: Date
  },
): Tache[] {
  const facteur = planningFactor({
    observations: [],
    category: 'général',
    workKind: brouillon.nature === 'nouveau' ? 'novel' : 'routine',
    hasDeadline: true,
  })
  const prevu = computePlannedDuration(brouillon.minutesEstimees, facteur.factor)
  const creeeLe = (options.maintenant ?? new Date()).toISOString()
  const id = options.identifiant()

  const base: Tache = {
    ...brouillon,
    id,
    terminee: false,
    minutesRestantes: prevu,
    facteurCorrection: facteur.factor,
    minutesSupplementaires: 0,
    parentId: null,
    rangPartie: null,
    creeeLe,
  }

  // Sans plafond connu, on ne découpe pas : mieux vaut une tâche entière qu'un
  // découpage calculé sur une capacité inventée.
  const parties = options.maxParJourMinutes
    ? autoSplit({ totalMinutes: prevu, maxPerDayMinutes: options.maxParJourMinutes })
    : []

  if (parties.length === 0) return [base]

  return [
    // L'originale devient un regroupement : plus rien à faire sur elle
    // directement, tout le travail est passé aux parties.
    { ...base, minutesRestantes: 0 },
    ...parties.map((p) => ({
      ...base,
      id: options.identifiant(),
      parentId: id,
      rangPartie: p.order,
      titre: `${base.titre} — ${p.label}`,
      minutesEstimees: p.minutes,
      minutesRestantes: p.minutes,
    })),
  ]
}
