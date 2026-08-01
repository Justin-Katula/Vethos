// ═══ PARTIE E — REPOS ═══════════════════════════════════════════════════

/** E.1 : micro-repos inclus dans le bloc (pas après). */
export function computeBreakMinutes(dur: number): number {
  if (dur >= 90) return 20
  if (dur >= 50) return 10
  if (dur >= 25) return 5
  return 0
}

/** E.2 : 20% de la brute, min 60 min, intouchable. */
export function computeRestFloor(rawCapacity: number): number {
  return Math.max(60, Math.round(rawCapacity * 0.2))
}

/** E.3 : respiration hebdomadaire (bilan cumulatif). */
export function computeWeeklyRest(args: {
  restTakenMinutes: number
  totalWeeklyRawCapacity: number
  highUtilizationDays: number
}) {
  const target = Math.round(args.totalWeeklyRawCapacity * 0.2)
  const gap = args.restTakenMinutes - target
  if (gap >= 0) return { target, gap, adjustment: 'none' as const, reductionPercent: 0 }
  if (args.highUtilizationDays >= 5) return { target, gap, adjustment: 'major' as const, reductionPercent: 40 }
  return { target, gap, adjustment: 'reduced' as const, reductionPercent: 40 }
}

/** E.4 : fatigue accumulée. */
export function computeFatigue(args: {
  consecutiveHighDays: number
  effectiveCapacity: number
  isCrisis?: boolean
}) {
  let pct = 0
  if (args.consecutiveHighDays >= 3) pct = 60
  else if (args.consecutiveHighDays >= 2) pct = 25

  if (pct > 0 && args.isCrisis) {
    pct = Math.min(pct, 40) // plancher crise 60%
  }

  return {
    consecutiveHighDays: args.consecutiveHighDays,
    penaltyMinutes: Math.round(args.effectiveCapacity * (pct / 100)),
    reductionPercent: pct,
    crisisFloorPercent: 60,
  }
}

/** E.4 : <50% utilisation → reset. */
export function shouldResetFatigue(utilizationPercent: number): boolean {
  return utilizationPercent < 50
}
