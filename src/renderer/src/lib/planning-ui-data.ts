import type { DayAvailabilitySnapshot, PlanningUiDayData } from '@shared/planning-time-model'
import { explainDayAvailability } from './free-time-explanation-engine'

function formatMinutes(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes))
  if (safe < 60) return `${safe} min`
  const hours = Math.floor(safe / 60)
  const rest = safe % 60
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')}`
}

export function buildPlanningUiDayData(daySnapshot: DayAvailabilitySnapshot): PlanningUiDayData {
  const explanation = explainDayAvailability(daySnapshot)
  return {
    date: daySnapshot.date,
    rawFreeLabel: formatMinutes(daySnapshot.rawFreeMinutes),
    usableFreeLabel: formatMinutes(daySnapshot.usableFreeMinutes),
    deepWorkLabel: formatMinutes(daySnapshot.deepWorkMinutes),
    recoveryLabel: formatMinutes(daySnapshot.recoveryMinutes),
    preparationLabel: formatMinutes(daySnapshot.preparationMinutes),
    transitionLabel: formatMinutes(daySnapshot.transitionMinutes),
    tinyGapLabel: formatMinutes(daySnapshot.tinyGapMinutes),
    statusLabel: daySnapshot.status,
    mainExplanation: explanation.summary,
    reasons: explanation.reasons,
    warnings: explanation.warnings,
  }
}
