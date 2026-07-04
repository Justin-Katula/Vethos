import { describe, expect, it } from 'vitest'
import type { ItemBudgetBreakdown, PlacedBlock, PlacementDiagnostics } from './placement-engine'
import {
  itemDisplayedMinutes,
  statusView,
  workBlockLabel,
  workBlockTitle,
} from './planning-ui'

function item(over: Partial<ItemBudgetBreakdown> = {}): ItemBudgetBreakdown {
  return {
    key: over.key ?? 'task:t1',
    kind: over.kind ?? 'task',
    refId: over.refId ?? 't1',
    label: over.label ?? 'Tâche',
    score: over.score ?? 1,
    rawBudgetMinutes: over.rawBudgetMinutes ?? 210,
    cappedMinutes: over.cappedMinutes ?? 105,
    placeableMinutes: over.placeableMinutes ?? 15,
    placedMinutes: over.placedMinutes ?? 15,
    maxMeritedMinutes: over.maxMeritedMinutes ?? 105,
    dailyCapMinutes: over.dailyCapMinutes ?? 15,
    minBlockMinutes: over.minBlockMinutes ?? 15,
    requiredMinutes: over.requiredMinutes ?? null,
    availableBeforeDeadlineMinutes: over.availableBeforeDeadlineMinutes ?? null,
    unplannedMinutes: over.unplannedMinutes ?? 90,
    status: over.status ?? 'planifiable',
  }
}

function diagnostics(over: Partial<PlacementDiagnostics> = {}): PlacementDiagnostics {
  return {
    status: over.status ?? 'planifiable',
    totalFreeMinutes: over.totalFreeMinutes ?? 300,
    plannedMinutes: over.plannedMinutes ?? 15,
    unplannedMinutes: over.unplannedMinutes ?? 195,
    items: over.items ?? [item()],
  }
}

function block(over: Partial<PlacedBlock> = {}): PlacedBlock {
  return {
    id: over.id ?? 'b1',
    date: over.date ?? '2026-05-18',
    startMinute: over.startMinute ?? 0,
    endMinute: over.endMinute ?? 15,
    kind: over.kind ?? 'task',
    refKind: over.refKind ?? 'task',
    refId: over.refId ?? 't1',
    label: over.label ?? 'Tâche',
    locked: true,
    linkedTaskId: over.linkedTaskId ?? null,
    linkedTaskIds: over.linkedTaskIds ?? [],
  }
}

describe('planning-ui helpers', () => {
  it('utilise placedMinutes comme durée affichée fiable', () => {
    const breakdown = item({
      rawBudgetMinutes: 210,
      cappedMinutes: 105,
      placeableMinutes: 15,
      placedMinutes: 15,
    })
    expect(itemDisplayedMinutes(breakdown)).toBe(15)
  })

  it('conserve le diagnostic non planifié comme temps libre réel', () => {
    expect(diagnostics().unplannedMinutes).toBe(195)
  })

  it('affiche un diagnostic impossible avec temps manquant', () => {
    const view = statusView('impossible', 180)
    expect(view.label).toBe('Impossible')
    expect(view.message).toContain('3h')
  })

  it('présente les blocs courts comme mini-blocs verrouillés', () => {
    const mini = block({ startMinute: 0, endMinute: 15 })
    expect(workBlockLabel(mini)).toBe('Mini-bloc')
    expect(workBlockTitle(mini)).toContain('verrouillé')
  })
})
