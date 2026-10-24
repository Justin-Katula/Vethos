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
  /**
   * Un report accepté suspend le blocage automatique jusqu'à cette minute :
   * rien d'automatique ne bloque avant (le bloc qui prend la place libérée non
   * plus) ; ce qui déborde au-delà commence à cette minute.
   */
  leveeJusqua?: number | null
}): Plage[] {
  const out: Plage[] = []
  const levee = a.leveeJusqua != null && a.leveeJusqua > a.nowMinute ? a.leveeJusqua : null
  for (const b of a.blocsDuJour) {
    // Une ancre bloque à son heure, toute sa durée, qu'elle ait démarré ou non —
    // et aucun report ne la suspend.
    const ancre = b.kind === 'ancre'
    if (a.confirmes.has(b.id) && !ancre) continue
    const fenetre = ancre ? { debut: b.startMinute, fin: b.endMinute } : fenetreSansConfirmation(b)
    const debut = levee !== null && !ancre ? Math.max(fenetre.debut, levee) : fenetre.debut
    const fin = fenetre.fin
    if (fin <= a.nowMinute || fin <= debut) continue
    // Déjà ouverte : le début reste celui du bloc (stable d'une minute à
    // l'autre, donc rien à reprogrammer) ; le pont lève tout de suite une
    // fenêtre en cours, iOS ne rappelant que les bornes à venir.
    out.push({ blocId: b.id, debutMinute: debut, finMinute: fin, selectionId: a.selectionId })
  }
  return out
}

/**
 * Les jours à venir : la même plage d'écart à l'heure de chaque bloc, datée.
 * iOS les applique même si Vethos n'est pas ouvert ce jour-là ; chaque
 * ouverture les recalcule.
 */
export function plagesAVenir(jours: readonly { date: string; blocs: readonly PlacedBlock[] }[], selectionId: string): Plage[] {
  return jours.flatMap((j) =>
    plagesAuto({ blocsDuJour: j.blocs, confirmes: new Set(), nowMinute: -1, selectionId }).map((p) => ({ ...p, date: j.date })),
  )
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
  // Une ancre est toujours automatique (elle n'a pas de séance à elle).
  const automatique = (p: Plage) =>
    // Un jour à venir n'a que des plages automatiques ; d'un calcul à l'autre
    // elles sont toutes remplacées (celles d'hier comprises).
    p.date !== undefined ||
    /^ancre-/.test(p.blocId) || (!a.confirmes.has(p.blocId) && (a.idsDuPlan.has(p.blocId) || /^(task|objective|ancre|promesse)-/.test(p.blocId)))
  return [...a.actives.filter((p) => !automatique(p)), ...a.auto]
}

/** Deux listes de plages équivalentes ? (évite de reprogrammer iOS chaque minute) */
export function memesPlages(a: readonly Plage[], b: readonly Plage[]): boolean {
  const cle = (p: Plage) => `${p.date ?? ''}|${p.blocId}|${p.debutMinute}|${p.finMinute}|${p.selectionId}|${p.profond ? 1 : 0}|${p.exceptionId ?? ''}`
  const x = a.map(cle).sort()
  const y = b.map(cle).sort()
  return x.length === y.length && x.every((v, i) => v === y[i])
}

/**
 * Le bloc en attente de « Je commence » ne glisse plus.
 *
 * Tant qu'il n'est pas confirmé, le moteur le replace à « maintenant » à chaque
 * minute (même tâche, nouvel id, nouveau début) : sa fenêtre d'une heure
 * glissait avec lui, et le blocage ne se levait jamais tant que Vethos restait
 * ouvert. On le ramène à sa PREMIÈRE observation (`observedPending`, la même
 * mémoire que l'horloge des séances) : même id, même début, même fin.
 *
 * Et une fois cette heure passée sans « Je commence » (la séance est ratée),
 * le reste de la même tâche que le moteur replace aussitôt à « maintenant »
 * ne rebloque pas : on lève, comme la règle le dit. Les blocs prévus plus
 * tard, eux, bloquent à leur heure.
 */
export function blocsPourLeBlocage(a: {
  blocs: readonly PlacedBlock[]
  nowMinute: number
  observe: { blockId: string; kind: string; refId: string; startMinute: number; endMinute: number } | null
  /** Les références dont une séance a déjà été ratée aujourd'hui. */
  rateesAujourdHui: ReadonlySet<string>
}): PlacedBlock[] {
  const o = a.observe
  const out: PlacedBlock[] = []
  for (const b of a.blocs) {
    const commence = b.startMinute <= a.nowMinute && a.nowMinute < b.endMinute
    if (commence && o && o.refId === b.refId && o.kind === b.kind && a.nowMinute < o.endMinute) {
      out.push({ ...b, id: o.blockId, startMinute: o.startMinute, endMinute: o.endMinute })
      continue
    }
    // Replacé à « maintenant » après une séance ratée : plus de blocage automatique.
    if (commence && b.kind !== 'ancre' && a.rateesAujourdHui.has(b.refId)) continue
    out.push(b)
  }
  return out
}

/** La dernière minute qu'iOS sait nommer : minuit n'existe que comme 00:00 du lendemain. */
export const DERNIERE_MINUTE = 1439

/**
 * Le sommeil bloque aussi : du coucher au lever, chaque nuit. Une nuit franchit
 * minuit, iOS ne surveille qu'un jour à la fois : elle devient deux plages
 * datées (le soir, puis le matin du lendemain).
 */
export function plagesDeSommeil(a: {
  jours: readonly string[]
  nuits: readonly { startMinute: number; endMinute: number }[]
  selectionId: string
  aujourdHui: string
  nowMinute: number
}): Plage[] {
  const out: Plage[] = []
  for (const date of a.jours) {
    for (const n of a.nuits) {
      const fin = Math.min(n.endMinute, DERNIERE_MINUTE)
      if (fin <= n.startMinute) continue
      if (date === a.aujourdHui && fin <= a.nowMinute) continue
      out.push({ blocId: `sommeil-${n.startMinute}`, date, debutMinute: n.startMinute, finMinute: fin, selectionId: a.selectionId })
    }
  }
  return out
}
