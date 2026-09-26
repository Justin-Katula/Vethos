// ═══ EXPLICATIONS D'ARRÊT ════════════════════════════════════════════════
//
// Spec moteur 2026-09-25. L'explication est un signal faible ; le
// comportement autour d'elle est un signal fort. Elle se donne en un seul tap
// — sinon l'utilisateur choisit la réponse la plus rapide et les données
// deviennent fausses. Le diagnostic rend des probabilités, jamais une
// étiquette certaine, et rien sous 5 arrêts (règle G).

import type { SessionEvent, StopReason } from '@shared/schemas'
import { STOP_REASONS } from '@shared/schemas'
import { apprenable, betaMean, inheritedPosterior } from './bayes'
import { MIN_OBSERVATIONS } from './learning'
import { addDays } from './dates'

/** Ce que l'utilisateur lit, et la cause selon Steel (2007). */
export const RAISONS: Record<StopReason, { libelle: string; cause: string }> = {
  'too-hard': { libelle: 'Too hard, I’m stuck', cause: 'Confiance en soi' },
  boring: { libelle: 'Boring', cause: 'Aversion pour la tâche' },
  'no-rush': { libelle: 'No rush', cause: 'Échéance lointaine' },
  distracted: { libelle: 'Distracted', cause: 'Impulsivité' },
  tired: { libelle: 'Tired', cause: 'Fatigue' },
  'real-event': { libelle: 'Something real came up', cause: 'Contexte externe' },
}
export { STOP_REASONS }

export type Cause = 'fatigue' | 'evitement' | 'creneau' | 'tropLong'

const arretsDe = (events: SessionEvent[]) => events.filter((e) => apprenable(e) && e.started && e.stoppedEarly && e.heldMinutes !== null)

function correlation(xs: number[], ys: number[]): number {
  const n = xs.length
  if (n < 2) return 0
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - mx) * (ys[i]! - my)
    dx += (xs[i]! - mx) ** 2
    dy += (ys[i]! - my) ** 2
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0
}

/** Part du groupe le plus fréquent : 1 = tout au même endroit. */
function concentration<T>(xs: T[]): number {
  if (!xs.length) return 0
  const n = new Map<T, number>()
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1)
  return Math.max(...n.values()) / xs.length
}

function dispersion(xs: number[]): number {
  if (xs.length < 2) return 1
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  return Math.min(1, Math.sqrt(xs.reduce((t, x) => t + (x - m) ** 2, 0) / xs.length) / 0.5)
}

function softmax(s: Record<Cause, number>): Record<Cause, number> {
  const ks = Object.keys(s) as Cause[]
  const ex = ks.map((k) => Math.exp(s[k] * 2))
  const z = ex.reduce((a, b) => a + b, 0)
  return Object.fromEntries(ks.map((k, i) => [k, ex[i]! / z])) as Record<Cause, number>
}

/**
 * Les causes probables des arrêts, par signature de comportement :
 * - fatigue : arrêt qui monte avec la charge des 48 h et l'heure, toutes
 *   catégories touchées ;
 * - évitement : arrêt tôt (< 10 min), concentré sur une tâche, avec des
 *   tentatives d'apps juste avant ;
 * - mauvais créneau : arrêts concentrés sur une heure ;
 * - bloc trop long : arrêt au même % du bloc, peu importe la raison.
 */
export function diagnostiquer(events: SessionEvent[]): Record<Cause, number> | 'pas assez de données' {
  const tous = arretsDe(events)
  // « Imprévu réel » : ignoré pour l'apprentissage — sauf s'il devient
  // fréquent (plus d'un arrêt sur trois), où il se lit comme un évitement probable.
  const reels = tous.filter((e) => e.stop?.reason === 'real-event')
  const a = reels.length / (tous.length || 1) > 1 / 3 ? tous : tous.filter((e) => e.stop?.reason !== 'real-event')
  if (a.length < MIN_OBSERVATIONS) return 'pas assez de données'
  const charge = a.map((e) => e.load48hMinutes)
  const eveil = a.map((e) => e.hoursAwake ?? e.plannedStartMinute / 60)
  const tardif = a.map((e) => e.heldMinutes! / e.plannedMinutes)
  const s: Record<Cause, number> = {
    fatigue:
      Math.max(0, correlation(charge, tardif)) +
      Math.max(0, correlation(eveil, tardif)) +
      (1 - concentration(a.map((e) => e.category))),
    evitement:
      concentration(a.map((e) => e.refId)) +
      a.filter((e) => e.heldMinutes! < 10).length / a.length +
      a.filter((e) => (e.stop?.attemptsBefore ?? 0) > 0).length / a.length,
    creneau: concentration(a.map((e) => Math.floor(e.plannedStartMinute / 60))),
    tropLong: 1 - dispersion(a.map((e) => e.heldMinutes! / e.plannedMinutes)),
  }
  // Le comportement des AUTRES engagements dans le même état départage
  // fatigue et évitement.
  const autres = a.map((e) => autresTiennent(events, e)).filter((x): x is number => x !== null)
  if (autres.length) {
    const m = autres.reduce((t, x) => t + x, 0) / autres.length
    s.evitement += m
    s.fatigue += 1 - m
  }
  // La raison dite, pondérée par sa fiabilité chez CETTE personne — un signal
  // faible, qui ne pèse que s'il est fiable.
  const part = (r: StopReason) => a.filter((e) => e.stop?.reason === r).length / a.length
  s.fatigue += 0.5 * part('tired') * fiabiliteRaison(events, 'tired')
  s.evitement += 0.5 * (part('boring') * fiabiliteRaison(events, 'boring') + part('too-hard') * fiabiliteRaison(events, 'too-hard') + part('distracted') * fiabiliteRaison(events, 'distracted'))
  // Une raison anormalement fréquente ces 14 jours renforce sa cause.
  const dernier = a.reduce((m, e) => (e.date > m ? e.date : m), a[0]!.date)
  const anormales = raisonsAnormales(events, dernier)
  if (anormales.includes('tired')) s.fatigue += 0.3
  if (anormales.some((r) => r === 'boring' || r === 'too-hard' || r === 'distracted')) s.evitement += 0.3
  return softmax(s)
}

/**
 * La raison dite colle-t-elle au comportement ? « Fatigué » après plus de la
 * moitié du bloc et sans tentative d'app ; « distrait » avec des tentatives ;
 * « ennuyeux » ou « trop dur » tôt dans le bloc ; « rien ne presse » sur une
 * tâche. Un fait comparé à un autre, jamais une accusation.
 */
export function raisonConcorde(
  s: { heldMinutes: number; plannedMinutes: number; attemptsBefore: number; kind: SessionEvent['kind'] },
  raison: StopReason,
): boolean {
  const frac = s.heldMinutes / Math.max(1, s.plannedMinutes)
  switch (raison) {
    case 'tired':
      return frac > 0.5 && s.attemptsBefore === 0
    case 'distracted':
      return s.attemptsBefore > 0
    case 'boring':
    case 'too-hard':
      return s.heldMinutes < 15
    case 'no-rush':
      return s.kind === 'task'
    case 'real-event':
      return true
  }
}

/**
 * Fiabilité d'une raison, par utilisateur : quand il dit « fatigué », la
 * signature de la fatigue est-elle là ? Une raison fiable pèse plus. On ne
 * punit jamais, on pondère. Une réponse donnée en moins d'une seconde, ou la
 * même raison répétée mécaniquement, compte comme un demi-signal.
 */
export function fiabiliteRaison(events: SessionEvent[], raison: StopReason): number {
  const a = arretsDe(events).filter((e) => e.stop?.reason === raison)
  const concorde = (e: SessionEvent) =>
    raisonConcorde({ heldMinutes: e.heldMinutes!, plannedMinutes: e.plannedMinutes, attemptsBefore: e.stop?.attemptsBefore ?? 0, kind: e.kind }, raison)
  // Une réponse mécanique (moins d'une seconde, ou la même raison que les
  // deux arrêts d'avant) ne compte que pour moitié : on pondère, on ne punit pas.
  // « Les deux arrêts d'avant » : par date et heure, jamais par l'ordre du tableau.
  const tous = [...arretsDe(events)].sort((x, y) => x.date.localeCompare(y.date) || x.plannedStartMinute - y.plannedStartMinute)
  const rang = new Map(tous.map((e, i) => [e, i] as const))
  let succes = 0
  let poids = 0
  for (const e of a) {
    const i = rang.get(e) ?? 0
    const avant = tous.slice(Math.max(0, i - 2), i)
    const mecanique = (e.stop?.answerMs ?? 5000) < 1000 || (avant.length === 2 && avant.every((x) => x.stop?.reason === raison))
    const w = mecanique ? 0.5 : 1
    poids += w
    if (concorde(e)) succes += w
  }
  return (1 + succes) / (2 + poids)
}

/**
 * Le taux d'une raison sur 14 jours, comparé à sa normale (tout le journal) :
 * au-dessus de 1,5 fois, elle est « anormale » cette quinzaine.
 */
export function raisonsAnormales(events: SessionEvent[], today: string): StopReason[] {
  const a = arretsDe(events)
  const dans = (e: SessionEvent) => e.date > addDays(today, -14) && e.date <= today
  const recents = a.filter(dans)
  // La normale se mesure HORS de la quinzaine : sinon elle se tire vers elle.
  const avant = a.filter((e) => !dans(e))
  if (recents.length < MIN_OBSERVATIONS || avant.length < MIN_OBSERVATIONS) return []
  return STOP_REASONS.filter((r) => {
    const normale = avant.filter((e) => e.stop?.reason === r).length / avant.length
    const quinzaine = recents.filter((e) => e.stop?.reason === r).length / recents.length
    return quinzaine > 0.2 && quinzaine > 1.5 * normale
  })
}

/**
 * Les autres engagements tiennent-ils dans le même état (même jour, même
 * tranche horaire) ? Oui → l'arrêt vise CETTE tâche (évitement) ; non → c'est
 * l'état qui lâche (fatigue).
 */
function autresTiennent(tous: SessionEvent[], e: SessionEvent): number | null {
  const pareil = tous.filter(
    (x) =>
      x !== e &&
      x.refId !== e.refId &&
      x.date === e.date &&
      x.started &&
      x.heldMinutes !== null &&
      x.stop?.reason !== 'real-event' &&
      // Le même état, c'est AVANT l'arrêt : ce qui vient après ne le décrit pas.
      x.plannedStartMinute <= e.plannedStartMinute &&
      e.plannedStartMinute - x.plannedStartMinute <= 180,
  )
  if (!pareil.length) return null
  return pareil.filter((x) => !x.stoppedEarly).length / pareil.length
}

/**
 * Pause anticipée : si l'utilisateur décroche en général vers la minute 38, la
 * pause du bloc tombe à la minute 34. Un abandon devient une pause prévue.
 * Rend la minute (depuis le début du bloc) où placer la pause, ou null.
 */
export function pauseAnticipee(events: SessionEvent[], refId: string, dureeBloc?: number): number | null {
  // Comparé à l'intérieur d'une même tranche de durée : décrocher à 40 min
  // sur un bloc de 50 n'est pas le même signal que sur un bloc de 90.
  const a = arretsDe(events).filter(
    (e) =>
      e.refId === refId &&
      e.stop?.reason !== 'real-event' &&
      (dureeBloc === undefined || Math.abs(e.plannedMinutes - dureeBloc) <= 20),
  )
  if (a.length < MIN_OBSERVATIONS) return null
  const s = a.map((e) => e.heldMinutes!).sort((x, y) => x - y)
  const mediane = s[Math.floor(s.length / 2)]!
  return mediane > 15 ? mediane - 4 : null
}

/** Ce que le diagnostic change au placement d'un engagement. */
export type Ajustement = {
  /** Évitement : un bloc court (le minimum utile), que le score pose dans le meilleur créneau. */
  blocMax?: number
  /** Fatigue : l'exigeant quitte le soir — une pénalité sur les départs après 18 h. */
  soirPenalite?: number
}

/**
 * Le diagnostic se fait sur TOUS les arrêts (sinon « concentré sur une
 * tâche » vaudrait toujours 1). L'évitement ne raccourcit que l'engagement
 * où les arrêts se concentrent vraiment.
 */
export function ajustementPour(
  events: SessionEvent[],
  refId: string,
  dejaCalcule?: ReturnType<typeof diagnostiquer>,
): Ajustement {
  const d = dejaCalcule ?? diagnostiquer(events)
  if (d === 'pas assez de données') return {}
  const top = (Object.keys(d) as Cause[]).reduce((m, k) => (d[k] > d[m] ? k : m))
  if (d[top] < 0.4) return {}
  if (top === 'evitement') {
    const a = arretsDe(events)
    const part = a.filter((e) => e.refId === refId).length / (a.length || 1)
    return part >= 0.5 ? { blocMax: 25 } : {}
  }
  if (top === 'fatigue') return { soirPenalite: 20 }
  // Mauvais créneau : le bandit s'en charge. Bloc trop long : Kaplan-Meier aussi.
  return {}
}
