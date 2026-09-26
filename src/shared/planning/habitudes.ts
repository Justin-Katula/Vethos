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

/**
 * « À l'heure », pour un humain : démarré dans les 5 minutes après l'heure
 * prévue. Un retard de 2 min n'est jamais un raté ; la mesure de l'habitude
 * regarde la MÉDIANE des retards, pas chaque départ.
 */
export const TOLERANCE_DEPART_MINUTES = 5

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

/** Mémoire effective de l'oubli progressif (gamma 0,97 ≈ 33 événements). */
const MEMOIRE = 33

export function discipline(events: SessionEvent[], refId: string): Discipline {
  const tous = eventsDe(events, refId)
  // Les quatre mesures oublient le vieux : la fiabilité par sa loi Beta, les
  // trois autres sur la mémoire effective (les 33 derniers événements).
  const ev = tous.slice(-MEMOIRE)
  const departs = tous.map((e) => e.started && (e.delayMinutes ?? 0) <= TOLERANCE_DEPART_MINUTES)
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
    observations: tous.length,
  }
}

// ─── Autonomie et phases de retrait ───────────────────────────────────────

export type Phase = 1 | 2 | 3 | 4

export const PHASES = {
  /** 1 → 2 : au moins 10 démarrages. */
  demarragesAncrage: 10,
  /** 2 → 3 : au moins 20 démarrages ET retard médian ≤ 5 min. */
  demarragesAutonomie: 20,
  retardMedianMax: TOLERANCE_DEPART_MINUTES,
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
  let phase = 1 as Phase
  // Tout se compte DEPUIS l'entrée dans la phase courante : après un recul,
  // la phase se regagne sur des preuves neuves, pas sur l'historique d'avant.
  // Fenêtres glissantes (7 et 14 jours) tenues par des pointeurs : un seul
  // passage sur le journal, même avec des milliers d'événements.
  let depuis = 0
  let demarresAvant = 0 // démarrages accumulés avant la phase courante (1 → 2 → 3 cumule)
  let demarres = 0 // depuis l'entrée dans la phase
  let retardsCourts = 0 // démarrages depuis l'entrée avec un retard ≤ 5 min
  let g7 = 0 // début de la fenêtre de recul (7 jours)
  let rates7 = 0
  let g14 = 0 // début de la fenêtre d'autonomie (14 jours)
  let spont14 = 0
  const entrer = (p: Phase, i: number) => {
    phase = p
    depuis = i + 1
    demarres = 0
    retardsCourts = 0
    g7 = g14 = depuis
    rates7 = spont14 = 0
  }
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i]!
    if (e.started) {
      demarres++
      if ((e.delayMinutes ?? 0) <= PHASES.retardMedianMax) retardsCourts++
      if (e.spontaneous) spont14++
    } else rates7++
    const limite7 = addDays(e.date, -PHASES.fenetreRecul)
    while (g7 <= i && ev[g7]!.date <= limite7) {
      if (!ev[g7]!.started) rates7--
      g7++
    }
    const limite14 = addDays(e.date, -PHASES.fenetreJours)
    while (g14 <= i && ev[g14]!.date <= limite14) {
      if (ev[g14]!.started && ev[g14]!.spontaneous) spont14--
      g14++
    }

    if (rates7 >= PHASES.ratesRecul && phase > 1) {
      entrer((phase - 1) as Phase, i)
      demarresAvant = 0
      continue
    }
    const total = demarresAvant + demarres
    if (phase === 1 && total >= PHASES.demarragesAncrage) {
      demarresAvant = total
      entrer(2, i)
    } else if (
      phase === 2 &&
      total >= PHASES.demarragesAutonomie &&
      demarres > 0 &&
      // Médiane des retards ≤ 5 min : plus de la moitié des départs à ≤ 5 min (strict, pour un nombre pair aussi).
      retardsCourts * 2 > demarres
    ) {
      entrer(3, i)
    } else if (phase === 3) {
      // Un raté compte comme un démarrage NON spontané : sans ça, les ratés ne
      // baisseraient jamais l'autonomie.
      const fen = i - g14 + 1
      if (fen >= MIN_OBSERVATIONS && spont14 / fen >= PHASES.autonomieMin) entrer(4, i)
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
export function tenue(
  events: SessionEvent[],
  refId: string,
  today: string,
): { tenuRecent: number; tauxTenue: number; tauxBlocs: number; observations: number } {
  const ev = eventsDe(events, refId).filter((e) => e.date < today)
  const semaine = ev.filter((e) => e.date >= addDays(today, -7))
  const quinzaine = ev.filter((e) => e.date >= addDays(today, -14))
  const prevu = quinzaine.reduce((t, e) => t + e.plannedMinutes, 0)
  // Anti-cliquet : seul le PLANIFIÉ tenu compte. Une prolongation acceptée ne
  // fait jamais monter la dose des semaines suivantes.
  const tenuPlanifie = (e: SessionEvent) => (e.started ? Math.min(e.heldMinutes ?? 0, e.plannedMinutes) : 0)
  const tenu = quinzaine.reduce((t, e) => t + tenuPlanifie(e), 0)
  return {
    tenuRecent: semaine.reduce((t, e) => t + tenuPlanifie(e), 0),
    tauxTenue: prevu ? tenu / prevu : 0,
    // La part de BLOCS tenus (≥ 80 % de leur durée) : c'est elle que vise la
    // difficulté (~85 %), pas une part de minutes.
    tauxBlocs: quinzaine.length
      ? quinzaine.filter((e) => e.started && (e.heldMinutes ?? 0) >= 0.8 * e.plannedMinutes).length / quinzaine.length
      : 0,
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

/**
 * Le NIVEAU de difficulté, qui se construit semaine après semaine : chaque
 * semaine passée tenue à plus de 92 % le monte de 10 %, sous 75 % le baisse
 * de 10 %, entre les deux il se garde (zone d'étirement). Borné 0,6 – 1,4.
 */
export function niveauDifficulte(events: SessionEvent[], refId: string, today: string, semaines = 8): number {
  const ev = eventsDe(events, refId)
  let niveau = 1
  for (let w = semaines; w >= 1; w--) {
    const de = addDays(today, -7 * w)
    const a = addDays(today, -7 * (w - 1))
    const sem = ev.filter((e) => e.date >= de && e.date < a)
    if (sem.length < 3) continue
    const taux = sem.filter((e) => e.started && (e.heldMinutes ?? 0) >= 0.8 * e.plannedMinutes).length / sem.length
    if (taux > 0.92) niveau *= 1.1
    else if (taux < 0.75) niveau *= 0.9
    niveau = Math.max(0.6, Math.min(1.4, niveau))
  }
  return niveau
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
