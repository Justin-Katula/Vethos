// ═══ APPRENTISSAGE IMPLICITE — le noyau mathématique ════════════════════════
//
// Spec moteur 2026-09-25, « Apprentissage implicite » et « Durée des blocs ».
// L'app apprend en observant, jamais en demandant. Même logique qu'un fil de
// recommandation (score = probabilité × valeur, apprentissage continu, oubli
// du vieux), mais avec des maths bayésiennes faites pour UNE personne et
// quelques centaines d'événements.
//
// Tout est pur. Le hasard du Thompson sampling vient d'un générateur à graine :
// mêmes entrées, même plan — la règle du moteur ne bouge pas.

import type { SessionEvent } from '@shared/schemas'

// ─── Lois Beta avec oubli ─────────────────────────────────────────────────

export type Beta = { a: number; b: number }

/** gamma = 0,97 : mémoire effective ≈ 33 événements. Valeur de départ, choix technique. */
export const GAMMA = 0.97

/** Le prior uniforme, faute de mieux. */
export const PRIOR_NEUTRE: Beta = { a: 1, b: 1 }

export function updateBeta(p: Beta, success: boolean, gamma = GAMMA): Beta {
  return { a: gamma * p.a + (success ? 1 : 0), b: gamma * p.b + (success ? 0 : 1) }
}

export const betaMean = (p: Beta) => p.a / (p.a + p.b)
/** Nombre d'observations effectif (le prior compte pour ses propres pseudo-comptes). */
export const betaWeight = (p: Beta) => p.a + p.b

/**
 * Héritage des valeurs de départ : un contexte neuf hérite de son parent.
 * « Maths mardi 16h » hérite de « maths à 16h », qui hérite de « maths », qui
 * hérite des défauts de la spec. On construit la loi du plus général au plus
 * précis : le parent, ramené à `poids` pseudo-observations, sert de prior au
 * niveau suivant.
 *
 * `niveaux[0]` est le plus général. Chaque niveau liste les succès/échecs de
 * son contexte, dans l'ordre chronologique.
 */
export function inheritedPosterior(
  niveaux: boolean[][],
  prior: Beta = PRIOR_NEUTRE,
  poids = 4,
  gamma = GAMMA,
): Beta {
  let courant = prior
  for (const obs of niveaux) {
    const m = betaMean(courant)
    const base: Beta = { a: m * poids, b: (1 - m) * poids }
    courant = obs.reduce((p, ok) => updateBeta(p, ok, gamma), base)
  }
  return courant
}

// ─── Hasard à graine ──────────────────────────────────────────────────────

/** Hache une chaîne en graine 32 bits (FNV-1a). */
export function seedFrom(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32 : petit, rapide, reproductible. */
export function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function normal(r: () => number): number {
  const u = Math.max(r(), 1e-12)
  const v = r()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/** Gamma(k, 1) par Marsaglia-Tsang ; k < 1 par le boost standard. */
function sampleGamma(k: number, r: () => number): number {
  if (k < 1) return sampleGamma(k + 1, r) * Math.pow(Math.max(r(), 1e-12), 1 / k)
  const d = k - 1 / 3
  const c = 1 / Math.sqrt(9 * d)
  for (;;) {
    let x: number
    let v: number
    do {
      x = normal(r)
      v = 1 + c * x
    } while (v <= 0)
    v = v * v * v
    const u = r()
    if (u < 1 - 0.0331 * x * x * x * x) return d * v
    if (Math.log(Math.max(u, 1e-12)) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v
  }
}

export function sampleBeta(p: Beta, r: () => number): number {
  const x = sampleGamma(Math.max(p.a, 1e-3), r)
  const y = sampleGamma(Math.max(p.b, 1e-3), r)
  return x / (x + y)
}

// ─── Kaplan-Meier : combien de temps tient-on vraiment ? ─────────────────

export type Survie = { minutes: number; arret: boolean }

/**
 * S(t) = Π (1 − arrêts_à_t / encore_actifs_à_t). Un bloc tenu jusqu'au bout
 * est « censuré » : on sait seulement qu'il aurait tenu au moins jusque-là.
 * Rend les paliers (t, S) triés.
 */
export function kaplanMeier(obs: Survie[]): Array<{ t: number; s: number }> {
  const temps = [...new Set(obs.filter((o) => o.arret).map((o) => o.minutes))].sort((a, b) => a - b)
  let s = 1
  const out: Array<{ t: number; s: number }> = []
  for (const t of temps) {
    const actifs = obs.filter((o) => o.minutes >= t).length
    const arrets = obs.filter((o) => o.arret && o.minutes === t).length
    if (actifs === 0) continue
    s *= 1 - arrets / actifs
    out.push({ t, s })
  }
  return out
}

/** Bornes des blocs : les 90 / 25 min fixes deviennent des limites, plus des cibles. */
export const BLOC_MIN = 25
export const BLOC_MAX = 90

/**
 * La durée où l'on a encore `seuil` (80 %) de chances de tenir. Sous 5
 * observations, aucune conclusion (règle G) : on rend `defaut`.
 */
export function dureeCible(obs: Survie[], seuil = 0.8, defaut = BLOC_MAX): number {
  if (obs.length < 5) return defaut
  for (const { t, s } of kaplanMeier(obs)) {
    if (s < seuil) return Math.max(BLOC_MIN, Math.min(BLOC_MAX, t))
  }
  // La survie ne passe jamais sous 80 % : on sait seulement que tout a tenu
  // jusqu'ici. On ne devine pas au-delà — on monte de 10 % depuis le plus long
  // bloc tenu, pas d'un bond jusqu'au plafond.
  const plusLong = Math.max(...obs.map((o) => o.minutes))
  return Math.max(BLOC_MIN, Math.min(defaut, Math.round(plusLong * 1.1)))
}

/** Les observations de survie d'une catégorie, tirées du journal. */
export type Tranche = 'matin' | 'apres-midi' | 'soir'
export const trancheDe = (minute: number): Tranche => (minute < 12 * 60 ? 'matin' : minute < 18 * 60 ? 'apres-midi' : 'soir')

/**
 * Les observations de survie d'une catégorie, tirées du journal — par type de
 * fenêtre (matin, après-midi, soir) quand il y en a assez (5), sinon toutes.
 */
export function survieDe(events: SessionEvent[], category: string, tranche?: Tranche): Survie[] {
  const cat = events.filter((e) => e.category === category && e.started && e.heldMinutes !== null)
  const dans = tranche ? cat.filter((e) => trancheDe(e.plannedStartMinute) === tranche) : cat
  const retenus = dans.length >= 5 ? dans : cat
  // Une prolongation lâchée avant sa fin est un arrêt pour la courbe (elle
  // sait jusqu'où l'on tient), jamais pour la discipline.
  return retenus.map((e) => ({
    minutes: e.heldMinutes!,
    arret: e.stoppedEarly || (e.extensionMinutes !== undefined && e.heldMinutes! < e.plannedMinutes + e.extensionMinutes),
  }))
}

// ─── BOCPD (Adams & MacKay, 2007) ─────────────────────────────────────────

/**
 * Détection de rupture bayésienne en ligne, modèle gaussien à variance connue
 * et moyenne inconnue (prior normal). Rend, pour la DERNIÈRE observation, la
 * probabilité qu'une rupture ait eu lieu dans les `recent` derniers pas —
 * examens, vacances, nouveau travail. Au-dessus d'un seuil, l'app oublie plus
 * vite l'ancien régime.
 */
export function probabiliteRupture(
  serie: number[],
  opts: { hazard?: number; variance?: number; prior?: { mu: number; tau2: number }; recent?: number } = {},
): number {
  if (serie.length < 3) return 0
  const H = opts.hazard ?? 1 / 20
  // Variance robuste, tirée des écarts successifs : une rupture ne gonfle pas
  // sa propre variance au point de se rendre invisible.
  const s2 = opts.variance ?? Math.max(1, robustVariance(serie))
  const mu0 = opts.prior?.mu ?? serie[0]!
  const tau0 = opts.prior?.tau2 ?? s2 * 4
  const recent = opts.recent ?? 2

  // R[r] = P(longueur de régime = r), avec les stats suffisantes par r.
  let R = [1]
  let mus = [mu0]
  let taus = [tau0]
  for (const x of serie) {
    const pred = R.map((_, r) => {
      const v = taus[r]! + s2
      return Math.exp(-((x - mus[r]!) ** 2) / (2 * v)) / Math.sqrt(2 * Math.PI * v)
    })
    const croissance = R.map((p, r) => p * pred[r]! * (1 - H))
    const rupture = R.reduce((t, p, r) => t + p * pred[r]! * H, 0)
    const next = [rupture, ...croissance]
    const z = next.reduce((a, b) => a + b, 0) || 1
    R = next.map((p) => p / z)
    // Mise à jour normale-normale.
    const nMus = [mu0]
    const nTaus = [tau0]
    for (let r = 0; r < mus.length; r++) {
      const t = 1 / (1 / taus[r]! + 1 / s2)
      nMus.push(t * (mus[r]! / taus[r]! + x / s2))
      nTaus.push(t)
    }
    mus = nMus
    taus = nTaus
  }
  return R.slice(0, recent + 1).reduce((a, b) => a + b, 0)
}

function robustVariance(xs: number[]): number {
  const d = xs.slice(1).map((x, i) => Math.abs(x - xs[i]!)).sort((a, b) => a - b)
  const med = d[Math.floor(d.length / 2)] ?? 0
  // MAD des différences → écart-type (normal) : σ ≈ med / (0,6745 × √2).
  return (med / (0.6745 * Math.SQRT2)) ** 2
}
