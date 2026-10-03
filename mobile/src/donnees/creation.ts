import { autoSplit, computePlannedDuration, planningFactor } from '@shared/planning/estimation'
import type { Tache } from './magasin'

/**
 * Ce qui arrive à une tâche entre le formulaire et le magasin.
 *
 * Deux lois s'appliquent là, et nulle part ailleurs :
 *
 * - **L'estimation est prise telle quelle.** Quand l'utilisateur demande 100 h,
 *   l'application lui fait travailler 100 h : plus de multiplicateur (×1,4 /
 *   ×1,7), qui transformait 100 h en 140 ou 170 sans que rien ne le dise. Le
 *   facteur reste mesuré pour le Coach, il ne gonfle plus le plan.
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
  | 'minutesBonus'
  | 'bonusLibere'
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
    minutesBonus: 0,
    bonusLibere: [],
    parentId: null,
    rangPartie: null,
    creeeLe,
  }

  // Sans plafond connu, on ne découpe pas : mieux vaut une tâche entière qu'un
  // découpage calculé sur une capacité inventée.
  const parties = options.maxParJourMinutes
    ? autoSplit({
        totalMinutes: prevu,
        maxPerDayMinutes: options.maxParJourMinutes,
        // L'app iPhone est en anglais : le moteur partagé nomme « Partie » par défaut.
        labeller: (n) => Array.from({ length: n }, (_, i) => `Part ${i + 1}`),
      })
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
