import type { PlacedBlock } from './types'

// ═══ PARTIE E — REPOS ═════════════════════════════════════════════════════
//
// Le repos est réservé AVANT la distribution. Il n'est jamais ce qui reste
// une fois le travail placé.

/**
 * E.1 : la pause qui SUIT un bloc — 20 min après 90 min de travail, 10 après
 * 50, 5 après 25. Elle n'existe que si quelque chose commence dans les 30 min
 * qui suivent le travail (`settleBreaks`) ; sinon le temps libre en tient lieu.
 */
export function computeBreakMinutes(workMinutes: number): number {
  if (workMinutes >= 90) return 20
  if (workMinutes >= 50) return 10
  if (workMinutes >= 25) return 5
  return 0
}

/**
 * Le travail que contient une empreinte réservée : le plus grand travail dont
 * la pause tient encore dedans. Le reste de l'empreinte est la pause.
 */
export function workOfFootprint(footprint: number): number {
  for (const brk of [20, 10, 5]) {
    const w = footprint - brk
    if (computeBreakMinutes(w) === brk) return w
  }
  // Entre deux paliers (ex. 105) : on descend au palier inférieur.
  if (footprint >= 60) return Math.min(footprint - 10, 89)
  if (footprint >= 30) return Math.min(footprint - 5, 49)
  return Math.min(footprint, 24)
}

/**
 * Le placement réserve la pause derrière chaque bloc, pour que rien ne vienne
 * s'y coller. Une fois la journée posée, on la garde seulement si l'engagement
 * suivant (bloc, ancre, obligation) commence moins de 30 min après la fin du
 * travail ; sinon elle disparaît et le bloc s'arrête avec le travail.
 */
export function settleBreaks(
  blocks: PlacedBlock[],
  date: string,
  entries: Array<{ startMinute: number; categoryType: string }>,
): void {
  const day = blocks.filter((b) => b.date === date)
  const starts = [
    ...entries.filter((e) => e.categoryType !== 'sleep').map((e) => e.startMinute),
    ...day.map((b) => b.startMinute),
  ]
  for (const b of day) {
    if (b.kind === 'ancre' || b.confirmed === true || b.breakMinutes <= 0) continue
    const workEnd = b.startMinute + b.workMinutes
    const next = starts.filter((m) => m >= workEnd && m !== b.startMinute).reduce((m, x) => Math.min(m, x), Infinity)
    if (next - workEnd < BREAK_HIDDEN_IF_FREE_MINUTES) continue
    b.breakMinutes = 0
    b.endMinute = workEnd
    b.durationMinutes = b.workMinutes
  }
}

/**
 * E.1 : la pause suit le travail — on travaille, puis on souffle avant de
 * passer à autre chose. Sans pause, la minute rendue est la fin du bloc.
 */
export function breakStartMinute(block: Pick<PlacedBlock, 'endMinute' | 'breakMinutes'>): number {
  return block.endMinute - block.breakMinutes
}

/** En dessous de ce seuil, du temps libre après le bloc ne joue plus le rôle de la pause. */
export const BREAK_HIDDEN_IF_FREE_MINUTES = 30

/**
 * E.1 : une pause ne se montre que si elle se heurte à quelque chose — un
 * engagement qui commence dans les 30 min. `settleBreaks` retire déjà les
 * autres du plan ; ce test reste pour les blocs venus d'ailleurs.
 */
export function isBreakVisible(
  block: Pick<PlacedBlock, 'endMinute' | 'breakMinutes'>,
  nextOccupiedMinute: number | null,
): boolean {
  if (block.breakMinutes <= 0 || nextOccupiedMinute === null) return false
  return nextOccupiedMinute - block.endMinute < BREAK_HIDDEN_IF_FREE_MINUTES
}

/**
 * Premier instant occupé (obligation fixe ou autre bloc) à partir de `after`,
 * ce jour-là. Sert à savoir si la pause d'un bloc se heurte vraiment à
 * quelque chose, ou si le temps libre qui suit joue déjà ce rôle.
 */
export function nextOccupiedMinute(
  after: number,
  excludeBlockId: string,
  entries: Array<{ startMinute?: number; debut?: number }>,
  blocks: Array<{ id: string; startMinute: number }>,
): number | null {
  const starts = [
    ...entries.map((e) => (e.startMinute !== undefined ? e.startMinute : (e.debut ?? 0))),
    ...blocks.filter((b) => b.id !== excludeBlockId).map((b) => b.startMinute),
  ].filter((m) => m >= after)
  return starts.length > 0 ? Math.min(...starts) : null
}

function formatClock(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}

/**
 * Pourquoi ce bloc est ici. Chaque phrase vient d'un fait que le moteur a
 * produit : rien n'est deviné, et rien n'est inventé pour meubler.
 */
export function explainBlock(block: PlacedBlock, showBreak: boolean): string[] {
  const lines: string[] = []
  if (block.kind === 'task') {
    lines.push('Placed by deadline: whatever is due first is served first.')
  } else if (block.kind === 'objective') {
    lines.push('The week’s quota, spread by what each day can actually carry.')
  } else {
    lines.push('A fixed hour, chosen once. It never moves from one day to the next.')
  }
  if (block.cognitiveWindow === 'PROFONDE') {
    lines.push('Put on a slot where you usually finish what you start.')
  } else if (block.cognitiveWindow === 'BASSE') {
    lines.push('An unreliable slot by your own measurements: nothing demanding goes here.')
  }
  if (block.breakMinutes > 0 && showBreak) {
    lines.push(
      `Work until ${formatClock(breakStartMinute(block))}, then a ${block.breakMinutes} min break: ` +
        'it is inside the block, not added after it.',
    )
  }
  if (block.preview) {
    lines.push(
      'Preview: this part is waiting for the previous one to finish. It only shows ' +
        'where it will land — it starts no session and blocks no app until its turn ' +
        'comes.',
    )
  }
  if (block.capOverride) {
    lines.push('Over the 40 % daily cap: a proven deadline crisis.')
  }
  if (block.reducedToMinimum) {
    lines.push('Cut back to its minimum because the day was saturated.')
  }
  return lines
}

/** E.2 : plancher quotidien = 20 % de la capacité brute, jamais moins d'une heure. */
export const REST_FLOOR_PERCENT = 0.2
export const REST_FLOOR_ABSOLUTE_MINUTES = 60

export function computeRestFloor(rawCapacity: number): number {
  return Math.max(REST_FLOOR_ABSOLUTE_MINUTES, Math.round(rawCapacity * REST_FLOOR_PERCENT))
}

// ─── E.3 — Respiration hebdomadaire ───────────────────────────────────────

export type WeeklyBreathing = {
  targetMinutes: number
  restTakenMinutes: number
  /** Négatif = il manque du repos. */
  gapMinutes: number
  adjustment: 'none' | 'reduced' | 'major'
  /** Jours à réduire, choisis parmi les jours restants les moins perturbés. */
  reducedDates: string[]
  /** Plafond d'utilisation imposé à ces jours. */
  capPercent: number
}

export const BREATHING_CAP_PERCENT = 40
export const HIGH_UTILIZATION_PERCENT = 85

/**
 * E.3 : sur chaque semaine glissante, compare le repos déjà pris à la cible de
 * 20 %. S'il en manque, l'application programme elle-même l'ajustement sur le
 * jour restant le moins perturbant — jamais un dimanche fixé d'avance.
 */
export function computeWeeklyBreathing(args: {
  /** Jours déjà écoulés : brut disponible, effectif, et temps réellement travaillé. */
  elapsedDays: Array<{
    date: string
    rawCapacityMinutes: number
    /** Capacité effective du jour — c'est elle que mesure le seuil de 85 %. */
    effectiveCapacityMinutes: number
    workedMinutes: number
  }>
  /** Brut total de la semaine entière (écoulée + à venir). */
  weekRawCapacityMinutes: number
  /** Jours restants, avec la charge déjà demandée sur chacun. */
  remainingDays: Array<{ date: string; demandMinutes: number }>
}): WeeklyBreathing {
  const target = Math.round(args.weekRawCapacityMinutes * REST_FLOOR_PERCENT)
  const restTaken = args.elapsedDays.reduce(
    (sum, d) => sum + Math.max(0, d.rawCapacityMinutes - d.workedMinutes),
    0,
  )
  const gap = restTaken - target

  if (gap >= 0 || args.remainingDays.length === 0) {
    return {
      targetMinutes: target,
      restTakenMinutes: restTaken,
      gapMinutes: gap,
      adjustment: 'none',
      reducedDates: [],
      capPercent: 100,
    }
  }

  // Le seuil se lit sur la capacité EFFECTIVE, comme en E.4 : sur la brute, le
  // plancher de repos de 20 % rend un dépassement de 85 % presque impossible.
  const highDays = args.elapsedDays.filter(
    (d) =>
      d.effectiveCapacityMinutes > 0 &&
      (d.workedMinutes / d.effectiveCapacityMinutes) * 100 > HIGH_UTILIZATION_PERCENT,
  ).length

  // Le jour le moins perturbant = celui qui porte le moins de charge.
  const byDisruption = [...args.remainingDays].sort(
    (a, b) => a.demandMinutes - b.demandMinutes || a.date.localeCompare(b.date),
  )
  // Écart important (≥5 jours à >85 %) → l'ampleur augmente : deux jours réduits.
  const major = highDays >= 5
  const count = Math.min(byDisruption.length, major ? 2 : 1)

  return {
    targetMinutes: target,
    restTakenMinutes: restTaken,
    gapMinutes: gap,
    adjustment: major ? 'major' : 'reduced',
    reducedDates: byDisruption.slice(0, count).map((d) => d.date),
    capPercent: BREATHING_CAP_PERCENT,
  }
}

// ─── E.4 — Fatigue accumulée ──────────────────────────────────────────────
//
// Tous les calculs portent sur la capacité EFFECTIVE, jamais sur la brute.

export type FatigueState = {
  consecutiveHighDays: number
  reductionPercent: number
  penaltyMinutes: number
  /** Vrai quand une crise prouvée a rogné la protection sans l'annuler. */
  crisisReduced: boolean
}

export const FATIGUE_CRISIS_FLOOR_PERCENT = 60

/**
 * Compte les jours consécutifs au-dessus de 85 % d'utilisation, en remontant
 * depuis le plus récent. Un jour sous 50 % remet le compteur à zéro.
 */
export function countConsecutiveHighDays(utilizationDescending: number[]): number {
  let count = 0
  for (const u of utilizationDescending) {
    if (u < 50) break
    if (u > HIGH_UTILIZATION_PERCENT) count++
    else break
  }
  return count
}

/**
 * E.4 : 2 jours consécutifs >85 % → jour suivant réduit de 25 %.
 *       3 jours consécutifs → jour suivant plafonné à 40 % (réduction de 60 %).
 * Une crise prouvée peut rogner cette protection, jamais l'annuler : la
 * capacité ne descend jamais sous 60 % de la normale.
 */
export function computeFatigue(args: {
  consecutiveHighDays: number
  effectiveCapacityBeforePenalty: number
  isCrisis?: boolean
}): FatigueState {
  let reduction = 0
  if (args.consecutiveHighDays >= 3) reduction = 100 - 40
  else if (args.consecutiveHighDays >= 2) reduction = 25

  let crisisReduced = false
  if (reduction > 0 && args.isCrisis) {
    const maxReduction = 100 - FATIGUE_CRISIS_FLOOR_PERCENT
    if (reduction > maxReduction) {
      reduction = maxReduction
      crisisReduced = true
    }
  }

  return {
    consecutiveHighDays: args.consecutiveHighDays,
    reductionPercent: reduction,
    penaltyMinutes: Math.round(args.effectiveCapacityBeforePenalty * (reduction / 100)),
    crisisReduced,
  }
}

/** E.4 : un jour sous 50 % d'utilisation remet le compteur à zéro. */
export function shouldResetFatigue(utilizationPercent: number): boolean {
  return utilizationPercent < 50
}
