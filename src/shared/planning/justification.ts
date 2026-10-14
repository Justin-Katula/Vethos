import type { LearningState, SessionConfirmationsState, StopReason } from '@shared/schemas'
import { HISTORIQUE_JOURS, type DemandeArbitre } from '@shared/coach/arbitre'
import { daysBetween } from './dates'
import { mergeIntervals } from './capacity'
import { texteSuffisant } from './report'
import { ajusterConfiance, type Niveau } from './trust'

// ═══ LA JUSTIFICATION D'UN STOP OU D'UN LATER (2026-10-13) ═════════════════
//
// Stop et Later, c'est la même chose — seuls le nom et le moment changent :
// une raison, un texte obligatoire, puis le juge (`@shared/coach/arbitre`).
// Ce fichier garde la mémoire des demandes, en tire l'historique que le juge
// relit, applique les règles fixes quand le juge ne répond pas, et fait
// bouger la confiance — seulement sur les gros faits.

export type Justification = NonNullable<LearningState['justifications']>[number]

const justifs = (l: Pick<LearningState, 'justifications'>) => l.justifications ?? []

/**
 * Les excuses des 30 derniers jours, plus récentes d'abord, telles que le juge
 * les relit (le poids de l'ancienneté s'applique côté juge).
 */
export function historiquePourJuge(l: Pick<LearningState, 'justifications'>, today: string): DemandeArbitre['historique'] {
  return justifs(l)
    .map((j) => ({ j, jours: daysBetween(j.date, today) }))
    .filter(({ jours }) => jours >= 0 && jours < HISTORIQUE_JOURS)
    .sort((a, b) => a.jours - b.jours)
    .slice(0, 40)
    .map(({ j, jours }) => ({
      joursPasses: jours,
      sorte: j.sorte,
      raison: j.reason,
      texte: j.text,
      reponses: j.answers,
      verdict: j.verdict,
    }))
}

/**
 * Les règles fixes — sans internet, sans réponse du juge, ou sans accord pour
 * l'IA : quelques mots d'explication ET un niveau de confiance d'au moins 2.
 */
export function reglesFixes(a: { texte: string; niveau: Niveau }): 'accepte' | 'refuse' {
  return texteSuffisant(a.texte) && a.niveau >= 2 ? 'accepte' : 'refuse'
}

/**
 * Note une demande jugée. La confiance ne bouge que sur les gros faits :
 * une incohérence citée la fait baisser fort. (Un report accepté puis non
 * tenu la fait baisser par sa promesse ; un refus suivi du travail la fait
 * monter un peu — `recompenserRefus`.)
 */
export function noterJustification(l: LearningState, j: Omit<Justification, 'rewarded'> & { rewarded?: boolean }): LearningState {
  const avec = { ...l, justifications: [...justifs(l), { ...j, rewarded: j.rewarded ?? false }].slice(-300) }
  return j.verdict === 'refuse' && j.incoherence ? ajusterConfiance(avec, 'echecGrave') : avec
}

/**
 * Refusé, et la séance a été tenue quand même : la confiance monte un peu,
 * une fois. Un Later refusé est tenu dès qu'on le commence ; un Stop refusé,
 * quand la séance va jusqu'au bout.
 */
export function recompenserRefus(l: LearningState, confirmations: SessionConfirmationsState, today: string): LearningState {
  let out = l
  for (const j of justifs(l)) {
    if (j.verdict !== 'refuse' || j.rewarded || j.date !== today) continue
    const tenue =
      j.sorte === 'later'
        ? j.blockId in confirmations.confirmedAt
        : (l.sessionEvents ?? []).some((e) => e.blockId === j.blockId && e.date === today && e.heldMinutes !== null && !e.stoppedEarly)
    if (!tenue) continue
    out = ajusterConfiance(
      { ...out, justifications: justifs(out).map((x) => (x === j ? { ...x, rewarded: true } : x)) },
      'succes',
    )
  }
  return out
}

/**
 * Le temps passé à se justifier pendant une séance ne compte pas comme du
 * travail : la plage est marquée « déjà traitée », le crédit de fin de séance
 * la saute.
 */
export function exclureDuTravail(c: SessionConfirmationsState, debutMinute: number, finMinute: number): SessionConfirmationsState {
  const debut = Math.max(0, Math.min(1439, debutMinute))
  const fin = Math.max(debut + 1, Math.min(1440, finMinute))
  if (fin <= debut) return c
  return { ...c, workCreditedRanges: mergeIntervals([...c.workCreditedRanges.map((r) => ({ start: r.start, end: r.end })), { start: debut, end: fin }]) }
}

export type { StopReason }
