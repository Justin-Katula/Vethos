import { durationLabel } from './format-time'
import type { ItemBudgetBreakdown, PlacedBlock, PlacementDiagnostics, PlacementStatus } from './placement-engine'

export type PlanningStatusTone = 'ok' | 'risk' | 'impossible'

export type PlanningStatusView = {
  label: string
  tone: PlanningStatusTone
  message: string
}

export function missingMinutesForDiagnostics(diagnostics: PlacementDiagnostics): number {
  return diagnostics.items.reduce((sum, item) => {
    if (item.requiredMinutes === null) return sum
    const usefulCapacity = Math.max(item.placedMinutes, item.placeableMinutes)
    return sum + Math.max(0, item.requiredMinutes - usefulCapacity)
  }, 0)
}

export function statusView(
  status: PlacementStatus,
  missingMinutes = 0,
): PlanningStatusView {
  if (status === 'impossible') {
    return {
      label: 'Impossible',
      tone: 'impossible',
      message:
        missingMinutes > 0
          ? `Ce planning est impossible avec le temps disponible actuel. Il manque environ ${durationLabel(missingMinutes)}.`
          : 'Ce planning est impossible avec le temps disponible actuel.',
    }
  }
  if (status === 'risk') {
    return {
      label: 'Risque',
      tone: 'risk',
      message: 'Le planning est serré ou certains blocs ne peuvent pas être placés entièrement.',
    }
  }
  return {
    label: 'Planifiable',
    tone: 'ok',
    message: 'Les blocs générés tiennent dans la fenêtre active.',
  }
}

export function itemDisplayedMinutes(item: ItemBudgetBreakdown): number {
  return item.placedMinutes
}

export function workBlockLabel(block: PlacedBlock): string {
  const minutes = block.endMinute - block.startMinute
  if (block.kind === 'task' && minutes < 30) return 'Mini-bloc'
  if (block.kind === 'task') return 'Tâche verrouillée'
  if (block.kind === 'objective') return 'Objectif verrouillé'
  if (block.kind === 'break') return 'Pause récupératrice'
  return 'Bloc verrouillé'
}

export function workBlockTitle(block: PlacedBlock): string {
  const minutes = block.endMinute - block.startMinute
  const label = workBlockLabel(block)
  const lockedLabel = label.includes('verrouill') ? label : `${label} verrouillé`
  return `${lockedLabel} · ${durationLabel(minutes)} · généré automatiquement`
}
