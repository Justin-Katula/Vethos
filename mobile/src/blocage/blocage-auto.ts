import { fenetreSansConfirmation } from '@shared/planning/report'
import type { PlacedBlock } from '@shared/planning/types'
import type { Plage } from './contrat'

/**
 * Le blocage qui commence à l'heure, sans attendre « Je commence ».
 *
 * Chaque bloc du jour pas encore confirmé reçoit sa plage d'écart : de son
 * début à une heure au plus (`fenetreSansConfirmation`). iOS l'applique lui-même,
 * Vethos fermé. « Je commence » remplace ensuite cette plage par celle de la
 * séance (même `blocId`), jusqu'à la vraie fin du bloc.
 *
 * Ce fichier ne touche qu'aux blocs du plan pas encore confirmés : une séance
 * en cours, une pause ou une urgence gardent leurs plages telles quelles.
 */

/** Les plages automatiques voulues pour le reste de la journée. */
export function plagesAuto(a: {
  blocsDuJour: readonly PlacedBlock[]
  confirmes: ReadonlySet<string>
  nowMinute: number
  selectionId: string
}): Plage[] {
  const out: Plage[] = []
  for (const b of a.blocsDuJour) {
    if (a.confirmes.has(b.id)) continue
    const { debut, fin } = fenetreSansConfirmation(b)
    if (fin <= a.nowMinute) continue
    // Déjà ouverte : le début reste celui du bloc (stable d'une minute à
    // l'autre, donc rien à reprogrammer) ; le pont lève tout de suite une
    // fenêtre en cours, iOS ne rappelant que les bornes à venir.
    out.push({ blocId: b.id, debutMinute: debut, finMinute: fin, selectionId: a.selectionId })
  }
  return out
}

/**
 * Les plages à programmer : celles qui ne viennent pas d'un bloc non confirmé
 * du plan restent (séance en cours, urgence…) ; celles des blocs non confirmés
 * sont remplacées par `auto` — les blocs disparus du plan (reportés, replacés)
 * perdent la leur.
 */
export function fusionnerAuto(a: {
  actives: readonly Plage[]
  auto: readonly Plage[]
  idsDuPlan: ReadonlySet<string>
  confirmes: ReadonlySet<string>
}): Plage[] {
  const automatique = (p: Plage) => !a.confirmes.has(p.blocId) && (a.idsDuPlan.has(p.blocId) || /^(task|objective|ancre|promesse)-/.test(p.blocId))
  return [...a.actives.filter((p) => !automatique(p)), ...a.auto]
}

/** Deux listes de plages équivalentes ? (évite de reprogrammer iOS chaque minute) */
export function memesPlages(a: readonly Plage[], b: readonly Plage[]): boolean {
  const cle = (p: Plage) => `${p.blocId}|${p.debutMinute}|${p.finMinute}|${p.selectionId}|${p.profond ? 1 : 0}|${p.exceptionId ?? ''}`
  const x = a.map(cle).sort()
  const y = b.map(cle).sort()
  return x.length === y.length && x.every((v, i) => v === y[i])
}
