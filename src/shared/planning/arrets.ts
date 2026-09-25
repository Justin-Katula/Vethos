// ═══ EXPLICATIONS D'ARRÊT ════════════════════════════════════════════════
//
// Spec moteur 2026-09-25. L'explication est un signal faible ; le
// comportement autour d'elle est un signal fort. Elle se donne en un seul tap
// — sinon l'utilisateur choisit la réponse la plus rapide et les données
// deviennent fausses. Le diagnostic rend des probabilités, jamais une
// étiquette certaine, et rien sous 5 arrêts (règle G).

import type { SessionEvent, StopReason } from '@shared/schemas'
import { STOP_REASONS } from '@shared/schemas'
import { betaMean, inheritedPosterior } from './bayes'
import { MIN_OBSERVATIONS } from './learning'

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

const arretsDe = (events: SessionEvent[]) => events.filter((e) => e.started && e.stoppedEarly && e.heldMinutes !== null)

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
  const a = arretsDe(events)
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
  return softmax(s)
}

/**
 * Fiabilité d'une raison, par utilisateur : quand il dit « fatigué », la
 * signature de la fatigue est-elle là ? Une raison fiable pèse plus. On ne
 * punit jamais, on pondère. Une réponse donnée en moins d'une seconde, ou la
 * même raison répétée mécaniquement, compte comme un demi-signal.
 */
export function fiabiliteRaison(events: SessionEvent[], raison: StopReason): number {
  const a = arretsDe(events).filter((e) => e.stop?.reason === raison)
  const concorde = (e: SessionEvent) => {
    const frac = e.heldMinutes! / e.plannedMinutes
    switch (raison) {
      case 'tired':
        return frac > 0.5 && (e.stop?.attemptsBefore ?? 0) === 0
      case 'distracted':
        return (e.stop?.attemptsBefore ?? 0) > 0
      case 'boring':
      case 'too-hard':
        return e.heldMinutes! < 15
      case 'no-rush':
        return e.kind === 'task'
      case 'real-event':
        return true
    }
  }
  return betaMean(inheritedPosterior([a.map(concorde)]))
}

/**
 * Pause anticipée : si l'utilisateur décroche en général vers la minute 38, la
 * pause du bloc tombe à la minute 34. Un abandon devient une pause prévue.
 * Rend la minute (depuis le début du bloc) où placer la pause, ou null.
 */
export function pauseAnticipee(events: SessionEvent[], refId: string): number | null {
  const a = arretsDe(events).filter((e) => e.refId === refId && e.stop?.reason !== 'real-event')
  if (a.length < MIN_OBSERVATIONS) return null
  const s = a.map((e) => e.heldMinutes!).sort((x, y) => x - y)
  const mediane = s[Math.floor(s.length / 2)]!
  return mediane > 15 ? mediane - 4 : null
}

/** Ce que le diagnostic change au placement d'un engagement. */
export type Ajustement = {
  /** Longueur de bloc imposée (évitement : un bloc court dans le meilleur créneau). */
  blocMax?: number
  /** Fatigue : blocs raccourcis de ce facteur après 18 h. */
  soirFacteur?: number
}

export function ajustementPour(events: SessionEvent[], refId: string): Ajustement {
  const d = diagnostiquer(events.filter((e) => e.refId === refId))
  if (d === 'pas assez de données') return {}
  const top = (Object.keys(d) as Cause[]).reduce((m, k) => (d[k] > d[m] ? k : m))
  if (d[top] < 0.4) return {}
  if (top === 'evitement') return { blocMax: 25 }
  if (top === 'fatigue') return { soirFacteur: 0.75 }
  // Mauvais créneau : le bandit s'en charge. Bloc trop long : Kaplan-Meier aussi.
  return {}
}
