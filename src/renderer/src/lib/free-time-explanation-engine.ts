import type { DayAvailabilitySnapshot, FreeTimeExplanation, FreeTimeWindow, PlanningContextV2 } from '@shared/planning-time-model'

export function explainFreeTimeWindow(window: FreeTimeWindow): FreeTimeExplanation {
  const title =
    window.windowType === 'tiny'
      ? 'Créneau trop court.'
      : window.windowType === 'preparation_only'
        ? 'Créneau protégé comme préparation.'
        : window.windowType === 'recovery_only'
          ? 'Créneau protégé comme récupération.'
          : window.windowType === 'deep_work'
            ? 'Créneau adapté au travail profond.'
            : 'Créneau utilisable avec prudence.'

  const warnings: string[] = []
  if (!window.canHostTask) warnings.push('Vethos ne devrait pas placer une tâche sérieuse ici.')
  if (window.rawDurationMinutes > 0 && window.usableDurationMinutes === 0) warnings.push('Le temps existe, mais il n’est pas exploitable.')

  return {
    title,
    summary:
      window.usableDurationMinutes > 0
        ? `${window.usableDurationMinutes} min utilisables sur ${window.rawDurationMinutes} min brutes.`
        : `${window.rawDurationMinutes} min brutes, mais 0 min réellement utilisables.`,
    reasons: window.reasons.slice(0, 5),
    warnings,
    confidence: window.confidence,
    debug: { windowType: window.windowType },
  }
}

export function explainDayAvailability(daySnapshot: DayAvailabilitySnapshot): FreeTimeExplanation {
  const warnings: string[] = []
  if (daySnapshot.status === 'fragmented') warnings.push('Journée fragmentée : peu de vrais blocs longs.')
  if (daySnapshot.status === 'no_usable_time') warnings.push('Aucun temps réellement utilisable.')
  if (daySnapshot.rawFreeMinutes > daySnapshot.usableFreeMinutes * 1.5) {
    warnings.push('Le temps libre brut est nettement plus élevé que le temps exploitable.')
  }

  return {
    title:
      daySnapshot.status === 'healthy'
        ? 'Journée exploitable.'
        : daySnapshot.status === 'tight'
          ? 'Journée serrée.'
          : daySnapshot.status === 'fragmented'
            ? 'Journée fragmentée.'
            : daySnapshot.status === 'overloaded'
              ? 'Journée surchargée.'
              : 'Journée à surveiller.',
    summary: `${daySnapshot.usableFreeMinutes} min réellement utilisables sur ${daySnapshot.rawFreeMinutes} min libres brutes.`,
    reasons: daySnapshot.reasons.slice(0, 5),
    warnings,
    confidence: daySnapshot.timeline.length > 0 ? 78 : 35,
    debug: { status: daySnapshot.status },
  }
}

export function explainPlanningContext(planningContext: PlanningContextV2): FreeTimeExplanation {
  const warnings: string[] = []
  if (planningContext.weeklySummary.noUsableTimeDays > 0) {
    warnings.push(`${planningContext.weeklySummary.noUsableTimeDays} jour(s) sans vrai temps utilisable.`)
  }
  if (planningContext.weeklySummary.overloadedDays > 0) {
    warnings.push(`${planningContext.weeklySummary.overloadedDays} jour(s) surchargé(s).`)
  }

  return {
    title: 'Contexte de planning calculé.',
    summary: `${planningContext.weeklySummary.usableFreeMinutes} min utilisables sur ${planningContext.weeklySummary.rawFreeMinutes} min libres brutes.`,
    reasons: [
      'Vethos distingue temps vide, préparation, récupération, petits trous et deep work.',
      ...planningContext.rulesApplied.filter((rule) => rule.applied).slice(0, 4).map((rule) => rule.reason),
    ],
    warnings,
    confidence: planningContext.confidence,
    debug: { days: planningContext.days.length },
  }
}
