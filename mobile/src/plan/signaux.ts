import type { Deficit, PlanningResult, PlanningSignal, TensionWarning } from '@shared/planning/types'
import { dateLocale, duree } from './format'

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

/**
 * C.3.4 : la liste est FERMÉE — quatre signaux, pas un de plus.
 *
 * `density_deficit` ne produit volontairement aucune phrase ici : la carte de
 * déficit le montre déjà, avec ses options chiffrées. Le répéter en dessous
 * donnerait deux fois le même fait, dont une fois sans rien à en faire.
 */
export function texteSignal(
  signal: PlanningSignal,
  nomDe: (id: string) => string | undefined,
): string | null {
  const d = signal.data
  const nombre = (cle: string): number => (typeof d[cle] === 'number' ? (d[cle] as number) : 0)
  const chaine = (cle: string): string => (typeof d[cle] === 'string' ? (d[cle] as string) : '')

  switch (signal.type) {
    case 'anchor_missed_3x': {
      const nom = nomDe(chaine('ancreId')) ?? 'This anchor'
      return `${nom} — missed ${nombre('missedCount')} times in a row, never started.`
    }
    case 'objective_stalled': {
      const nom = chaine('name') || 'This goal'
      return `${nom} — no progress for ${nombre('daysSinceLastService')} days.`
    }
    case 'delay_repeated': {
      const nom = nomDe(chaine('refId')) ?? 'This block'
      return `${nom} — late again, ${nombre('consecutiveDelays')} times in a row.`
    }
    default:
      return null
  }
}

export function remarques(
  resultat: PlanningResult,
  nomDe: (id: string) => string | undefined,
): Remarque[] {
  return resultat.signals
    .map((s) => ({ cle: s.subject, texte: texteSignal(s, nomDe) }))
    .filter((r): r is Remarque => r.texte !== null)
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

/**
 * La note d'un bloc : ce que le moteur a dû faire pour le poser là.
 *
 * Un bloc normal n'en a pas. Une note n'apparaît que lorsqu'il s'est passé
 * quelque chose — un plafond dépassé, une ancre réduite, une pause incluse.
 * L'ordre compte : `capOverride` et `reducedToMinimum` sont des décisions du
 * moteur sous contrainte, et priment sur le simple rappel d'une pause.
 *
 * L'heure n'entre pas ici. « En cours » est un fait d'horloge que l'agenda
 * établit déjà tout seul ; le redire dans la note ferait dépendre du temps une
 * valeur qui n'en dépend pas, et obligerait à recalculer toute la semaine à
 * chaque minute.
 */
export function noteDuBloc(bloc: PlanningResult['blocks'][number]): string | undefined {
  if (bloc.preview) return 'preview — locked by the previous part'
  if (bloc.capOverride) return 'over the daily cap'
  if (bloc.reducedToMinimum) return 'reduced to its minimum'
  if (bloc.breakMinutes > 0) return `includes a ${duree(bloc.breakMinutes)} break`
  return undefined
}
