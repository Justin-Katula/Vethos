import type { Deficit, PlanningResult, TensionWarning } from '@shared/planning/types'
import { blockNote, signalSentences, signalSentence } from '@shared/phrases'
import { dateLocale, duree } from './format'

// Les phrases vivent dans `@shared/phrases` : le bureau les affiche aussi, et
// deux copies du meme constat finissent par ne plus dire la meme chose.
export { signalSentence as texteSignal } from '@shared/phrases'

/**
 * Ce que le moteur a remarqué, mis en phrases.
 *
 * Le moteur produit des FAITS chiffrés. Ce fichier ne fait que les rendre
 * lisibles — il ne décide de rien, ne pondère rien, n'ajoute aucun seuil. La
 * règle du contrat (F) tient en une ligne : **jamais un jugement, jamais une
 * question**. « Ratée 3 fois de suite » est un fait ; « tu devrais t'y
 * remettre » n'en est pas un, et n'apparaîtra nulle part.
 *
 * Les phrases sont reprises mot pour mot du bureau. Deux applications qui
 * disent la même chose autrement, c'est deux applications.
 */

/** Un fait de la semaine, prêt à être posé à l'écran. */
export type Remarque = { cle: string; texte: string }

export function remarques(
  resultat: PlanningResult,
  nomDe: (id: string) => string | undefined,
): Remarque[] {
  return signalSentences(resultat.signals, nomDe).map((s) => ({ cle: s.key, texte: s.text }))
}

/**
 * C.3.3 : le pire déficit, et lui seul.
 *
 * Le moteur trie déjà ; en montrer cinq transformerait une décision à prendre
 * en une liste à parcourir. Celui qui serre le plus d'abord — les autres se
 * desserrent souvent tout seuls une fois celui-là résolu.
 */
export function pireDeficit(resultat: PlanningResult): Deficit | undefined {
  return resultat.feasibility.deficits[0]
}

/**
 * D.2 : l'avertissement passif — 85 à 100 % de tension, encore faisable.
 *
 * Mutuellement exclusif avec un déficit POUR UNE MÊME échéance (l'une est
 * faisable, l'autre non), mais les deux coexistent si deux échéances
 * différentes sont concernées. On garde la plus tendue.
 */
export function pireTension(resultat: PlanningResult): TensionWarning | undefined {
  return [...resultat.feasibility.tensionWarnings].sort(
    (a, b) => b.tensionRatio - a.tensionRatio,
  )[0]
}

/** « 2026-09-25 » → « 25 sept. ». Une échéance se lit, elle ne se déchiffre pas. */
export function echeanceCourte(cle: string): string {
  return dateLocale(cle).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/**
 * La même durée, coupée en nombre et en unité.
 *
 * Les mesures mettent l'unité plus petite et plus sourde que le nombre, pour
 * que l'œil attrape le chiffre en premier. Au-delà de l'heure pleine, « 2 h 30 »
 * reste d'un seul tenant : séparer les minutes de l'heure donnerait deux
 * nombres à lire au lieu d'un.
 */
export function partsDuree(minutes: number): { valeur: string; unite?: string } {
  const total = Math.max(0, Math.round(minutes))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return { valeur: String(m), unite: 'min' }
  if (m === 0) return { valeur: String(h), unite: 'h' }
  return { valeur: `${h} h ${String(m).padStart(2, '0')}` }
}

/**
 * Ce qu'il reste à faire aujourd'hui, à la minute près.
 *
 * Les ancres sont exclues : ce sont des rendez-vous avec soi-même, pas du
 * travail qu'on aurait à abattre. Un bloc déjà commencé ne compte que pour sa
 * part restante — sinon le chiffre resterait figé pendant qu'on travaille, ce
 * qui est exactement le moment où on le regarde.
 */
export function travailDevantToi(
  blocs: readonly PlanningResult['blocks'][number][],
  minute: number,
): number {
  return blocs
    .filter((b) => b.endMinute > minute && b.kind !== 'ancre')
    .reduce((somme, b) => {
      const ecoule = b.startMinute <= minute ? Math.max(0, minute - b.startMinute) : 0
      return somme + Math.max(0, b.workMinutes - ecoule)
    }, 0)
}

/** La note d'un bloc, dans les mots partages avec le bureau. */
export function noteDuBloc(bloc: PlanningResult['blocks'][number]): string | undefined {
  return blockNote(bloc, duree)
}
