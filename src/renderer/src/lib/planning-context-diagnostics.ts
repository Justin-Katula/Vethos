import type { PlanningContextDiagnostics, PlanningContextDiagnosticIssue, PlanningContextV2 } from '@shared/planning-time-model'
import { MINUTES_PER_DAY, segmentEndMinute, segmentStartMinute, sortSegments, totalDurationMinutes } from './planning-time-utils'

function issue(args: PlanningContextDiagnosticIssue): PlanningContextDiagnosticIssue {
  return args
}

export function runPlanningContextDiagnostics(planningContext: PlanningContextV2): PlanningContextDiagnostics {
  const issues: PlanningContextDiagnosticIssue[] = []

  if (planningContext.days.length === 0) {
    issues.push(issue({
      id: 'date_range_empty',
      severity: 'critical',
      message: 'Le contexte de planning ne contient aucune journée.',
    }))
  }

  for (const day of planningContext.days) {
    const total = totalDurationMinutes(day.timeline)
    if (Math.abs(total - MINUTES_PER_DAY) > 1) {
      issues.push(issue({
        id: 'timeline_duration_invalid',
        severity: 'critical',
        date: day.date,
        message: 'La timeline ne couvre pas correctement les 24h.',
        metadata: { total },
      }))
    }

    const sorted = sortSegments(day.timeline)
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1]
      const current = sorted[index]
      if (!previous || !current) continue
      if (segmentEndMinute(previous) > segmentStartMinute(current)) {
        issues.push(issue({
          id: 'timeline_overlap',
          severity: 'critical',
          date: day.date,
          message: 'Deux segments se chevauchent dans la timeline.',
          metadata: { previousId: previous.id, currentId: current.id },
        }))
      }
    }

    if (!day.timeline.some((segment) => segment.kind === 'sleep')) {
      issues.push(issue({
        id: 'missing_sleep',
        severity: 'warning',
        date: day.date,
        message: 'Aucun bloc de sommeil détecté pour cette journée.',
      }))
    }

    if (day.usableFreeMinutes <= 0) {
      issues.push(issue({
        id: 'no_usable_time',
        severity: day.rawFreeMinutes > 0 ? 'warning' : 'critical',
        date: day.date,
        message: 'Aucun temps réellement utilisable détecté.',
      }))
    }

    if (day.status === 'fragmented') {
      issues.push(issue({
        id: 'fragmented_day',
        severity: 'warning',
        date: day.date,
        message: 'La journée est fragmentée : plusieurs petits trous mais peu de blocs solides.',
      }))
    }

    if (day.rawFreeMinutes >= 180 && day.usableFreeMinutes < day.rawFreeMinutes * 0.45) {
      issues.push(issue({
        id: 'raw_high_usable_low',
        severity: 'warning',
        date: day.date,
        message: 'Le temps libre brut est élevé, mais le temps réellement utilisable est bas.',
      }))
    }

    const lockedMinutes = day.timeline
      .filter((segment) => segment.locked)
      .reduce((sum, segment) => sum + segment.durationMinutes, 0)
    if (lockedMinutes > 1200) {
      issues.push(issue({
        id: 'too_many_locked_blocks',
        severity: 'warning',
        date: day.date,
        message: 'La journée contient énormément de blocs verrouillés.',
        metadata: { lockedMinutes },
      }))
    }

    const busyMinutes = day.timeline
      .filter((segment) => !['free', 'preparation', 'transition', 'recovery'].includes(segment.kind))
      .reduce((sum, segment) => sum + segment.durationMinutes, 0)
    if (busyMinutes >= 480 && day.recoveryMinutes < 20) {
      issues.push(issue({
        id: 'too_little_recovery',
        severity: 'warning',
        date: day.date,
        message: 'Journée chargée avec trop peu de récupération protégée.',
      }))
    }

    if (day.deepWorkMinutes <= 0 && day.usableFreeMinutes >= 120) {
      issues.push(issue({
        id: 'deep_work_impossible',
        severity: 'warning',
        date: day.date,
        message: 'Du temps utilisable existe, mais aucun vrai bloc de deep work.',
      }))
    }
  }

  const status: PlanningContextDiagnostics['status'] = issues.some((item) => item.severity === 'critical')
    ? 'critical'
    : issues.some((item) => item.severity === 'warning')
      ? 'warning'
      : 'healthy'

  return {
    status,
    issues,
    summary:
      issues.length === 0
        ? ['Aucun problème majeur détecté dans le contexte de planning shadow.']
        : issues.slice(0, 5).map((item) => item.message),
  }
}
