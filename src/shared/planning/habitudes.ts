// ═══ HABITUDES — discipline, autonomie, phases, rampe ══════════════════════
//
// Spec moteur 2026-09-25 : « Durée des blocs et suivi de la discipline »,
// « Rampe de départ », « Retrait progressif », « Motivation » (difficulté).
// Tout se lit dans le journal des séances ; rien n'est déclaré.

import type { SessionEvent } from '@shared/schemas'
import { addDays } from './dates'
import { betaMean, dureeCible, inheritedPosterior, probabiliteRupture, type Survie } from './bayes'
import { MIN_OBSERVATIONS } from './learning'

const trie = (events: SessionEvent[]) =>
  [...events].sort((a, b) => a.date.localeCompare(b.date) || a.plannedStartMinute - b.plannedStartMinute)

export const eventsDe = (events: SessionEvent[], refId: string) => trie(events.filter((e) => e.refId === refId))

const dansFenetre = (e: SessionEvent, today: string, jours: number) =>
  e.date > addDays(today, -jours) && e.date <= today

const mediane = (xs: number[]) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

// ─── Les quatre mesures de discipline ─────────────────────────────────────

export type Discipline = {
  /** P(démarrer dans les 5 min), loi Beta avec oubli. */
  fiabiliteDepart: number
  /** Durée tenue avec 80 % de survie (minutes). */
  endurance: number
  /** Tentatives d'apps bloquées par heure de séance. */
  pressionDistraction: number
  /** Écart-type de l'heure de démarrage, en minutes. */
  regularite: number
  observations: number
}

export function discipline(events: SessionEvent[], refId: string): Discipline {
  const ev = eventsDe(events, refId)
  const departs = ev.map((e) => e.started && (e.delayMinutes ?? 0) <= 5)
  const tenues = ev.filter((e) => e.started && e.heldMinutes !== null)
  const survie: Survie[] = tenues.map((e) => ({ minutes: e.heldMinutes!, arret: e.stoppedEarly }))
  const heures = tenues.reduce((t, e) => t + e.heldMinutes!, 0) / 60
  const tentatives = tenues.reduce((t, e) => t + e.blockedAttempts, 0)
  const debuts = ev.filter((e) => e.started).map((e) => e.plannedStartMinute + (e.delayMinutes ?? 0))
  const m = debuts.reduce((a, b) => a + b, 0) / (debuts.length || 1)
  return {
    fiabiliteDepart: betaMean(inheritedPosterior([departs])),
    endurance: dureeCible(survie),
    pressionDistraction: heures > 0 ? tentatives / heures : 0,
    regularite: debuts.length ? Math.sqrt(debuts.reduce((t, d) => t + (d - m) ** 2, 0) / debuts.length) : 0,
    observations: ev.length,
  }
}

// ─── Autonomie et phases de retrait ───────────────────────────────────────

export type Phase = 1 | 2 | 3 | 4

export const PHASES = {
  /** 1 → 2 : au moins 10 démarrages. */
  demarragesAncrage: 10,
  /** 2 → 3 : au moins 20 démarrages ET retard médian ≤ 5 min. */
  demarragesAutonomie: 20,
  retardMedianMax: 5,
  /** 3 → 4 : autonomie ≥ 0,8 sur 14 jours glissants. */
  autonomieMin: 0.8,
  fenetreJours: 14,
  /** Recul : 3 ratés sur 7 jours → phase précédente, sans punition. */
  ratesRecul: 3,
  fenetreRecul: 7,
} as const

/** Démarrages spontanés / démarrages totaux, sur 14 jours glissants. */
export function autonomie(events: SessionEvent[], refId: string, today: string): number {
  const recents = eventsDe(events, refId).filter((e) => e.started && dansFenetre(e, today, PHASES.fenetreJours))
  if (!recents.length) return 0
  return recents.filter((e) => e.spontaneous).length / recents.length
}

/**
 * La phase d'une habitude. La mesure décide du passage, jamais le calendrier.
 * Rejouée depuis le début du journal : un recul (3 ratés sur 7 jours) fait
 * redescendre d'une phase, puis les compteurs repartent de là.
 */
export function phaseHabitude(events: SessionEvent[], refId: string): Phase {
  const ev = eventsDe(events, refId)
  let phase: Phase = 1
  let depuis = 0 // index du premier événement compté dans la phase courante
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i]!
    const vus = ev.slice(depuis, i + 1)
    const semaine = vus.filter((x) => x.date > addDays(e.date, -PHASES.fenetreRecul))
    if (semaine.filter((x) => !x.started).length >= PHASES.ratesRecul && phase > 1) {
      phase = (phase - 1) as Phase
      depuis = i + 1
      continue
    }
    const demarres = ev.slice(0, i + 1).filter((x) => x.started)
    if (phase === 1 && demarres.length >= PHASES.demarragesAncrage) {
      phase = 2
      depuis = i + 1
    } else if (
      phase === 2 &&
      demarres.length >= PHASES.demarragesAutonomie &&
      mediane(demarres.slice(-PHASES.demarragesAutonomie).map((x) => x.delayMinutes ?? 0)) <= PHASES.retardMedianMax
    ) {
      phase = 3
      depuis = i + 1
    } else if (phase === 3) {
      const fen = ev.slice(0, i + 1).filter((x) => x.started && x.date > addDays(e.date, -PHASES.fenetreJours))
      const auto = fen.length ? fen.filter((x) => x.spontaneous).length / fen.length : 0
      if (fen.length >= MIN_OBSERVATIONS && auto >= PHASES.autonomieMin) {
        phase = 4
        depuis = i + 1
      }
    }
  }
  return phase
}

/**
 * Jours-test : en phase 3, un jour sur cinq l'overlay ne vient pas. Choisi de
 * façon déterministe (date + habitude), pour que le plan reste reproductible.
 */
export function estJourTest(refId: string, date: string): boolean {
  let h = 0
  for (const c of `${refId}|${date}`) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h % 5 === 0
}

// ─── Rampe de départ ──────────────────────────────────────────────────────

export const RAMPE = {
  /** On monte de 15 % quand plus de 90 % est tenu. Valeur de départ. */
  hausse: 1.15,
  seuilHausse: 0.9,
  /** On redescend de 10 % sous 75 %. */
  baisse: 0.9,
  seuilBaisse: 0.75,
  /** Première semaine : des blocs courts, tous les jours (7 × 25 min). */
  dosePlancher: 7 * 25,
} as const

/** Ce qui a été tenu, en minutes, sur les 7 derniers jours ; et la part tenue sur 14 jours. */
export function tenue(events: SessionEvent[], refId: string, today: string): { tenuRecent: number; tauxTenue: number; observations: number } {
  const ev = eventsDe(events, refId).filter((e) => e.date < today)
  const semaine = ev.filter((e) => e.date >= addDays(today, -7))
  const quinzaine = ev.filter((e) => e.date >= addDays(today, -14))
  const prevu = quinzaine.reduce((t, e) => t + e.plannedMinutes, 0)
  const tenu = quinzaine.reduce((t, e) => t + (e.started ? (e.heldMinutes ?? 0) : 0), 0)
  return {
    tenuRecent: semaine.reduce((t, e) => t + (e.started ? (e.heldMinutes ?? 0) : 0), 0),
    tauxTenue: prevu ? tenu / prevu : 0,
    observations: quinzaine.length,
  }
}

/**
 * La dose de la semaine : structure dure, dose légère. La régularité est
 * stricte dès le jour 1 ; le volume monte selon ce que la personne tient
 * vraiment. La cible reste dans le contrat : c'est la destination, pas la
 * charge de la semaine 1.
 */
export function doseSemaine(cible: number, tenuRecent: number, tauxTenue: number, observations: number): number {
  const plancher = Math.min(cible, RAMPE.dosePlancher)
  // Rien de mesuré encore : la première semaine, courte et quotidienne.
  if (observations === 0) return plancher
  if (tauxTenue > RAMPE.seuilHausse) return Math.round(Math.min(cible, Math.max(plancher, tenuRecent * RAMPE.hausse)))
  if (tauxTenue < RAMPE.seuilBaisse) return Math.round(Math.min(cible, Math.max(plancher, tenuRecent * RAMPE.baisse)))
  return Math.round(Math.min(cible, Math.max(plancher, tenuRecent)))
}

// ─── Difficulté visée : ~85 % de blocs tenus ─────────────────────────────

/**
 * Multiplicateur de longueur de bloc. Au-dessus de 92 % tenu : +10 % ; sous
 * 75 % : −10 %. Il ne touche JAMAIS la cible hebdomadaire, ni le sommeil, ni le
 * repos — seulement la longueur des blocs.
 */
export function facteurDifficulte(tauxTenue14j: number, observations: number): number {
  if (observations < MIN_OBSERVATIONS) return 1
  if (tauxTenue14j > 0.92) return 1.1
  if (tauxTenue14j < 0.75) return 0.9
  return 1
}

// ─── Rupture de régime ────────────────────────────────────────────────────

/**
 * Minutes tenues par semaine, les 8 dernières semaines, toutes habitudes
 * confondues : la série sur laquelle tourne la détection de rupture.
 */
export function rupturePossible(events: SessionEvent[], today: string): boolean {
  const serie: number[] = []
  for (let w = 8; w >= 1; w--) {
    const de = addDays(today, -7 * w)
    const a = addDays(today, -7 * (w - 1))
    serie.push(
      events
        .filter((e) => e.date >= de && e.date < a && e.started)
        .reduce((t, e) => t + (e.heldMinutes ?? 0), 0),
    )
  }
  if (serie.filter((x) => x > 0).length < 4) return false
  return probabiliteRupture(serie) > 0.5
}
