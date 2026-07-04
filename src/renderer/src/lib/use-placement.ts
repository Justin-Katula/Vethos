import { useEffect, useMemo } from 'react'
import { useScheduleStore } from '@/store/schedule.store'
import { useLevelsStore } from '@/store/levels.store'
import { useTasksStore } from '@/store/tasks.store'
import { useSettingsStore } from '@/store/settings.store'
import { parseClockTimeToMinute } from './free-time-calculator'
import { computeFatigueRecoveryPlan } from './circadian-planning'
import {
  computePlacementPlan,
  clampPlanningRangeEnd,
  enumerateDates,
  summarizeDailyLoad,
  type DailyLoad,
  type PlacementDiagnostics,
  type PlacedBlock,
} from './placement-engine'
import { getEngineFlags, withV1FallbackSync } from './engine-activation'
import { buildPlanningContextV2 } from './planning-context-snapshot'
import { buildPlacementPlanV2 } from './placement-plan-builder'
import { mapProposedPlacementBlocksToPlacedBlocks, buildV1DiagnosticsFromV2 } from './placement-v2-adapter'
import { DEFAULT_PLACEMENT_PLAN_V2_FLAGS } from '@shared/placement-flags'
import { buildPlacementResult } from './placement-explanation'
import type { PlacementResult } from '@shared/engine-results'
import { useDecisionLogStore } from '@/store/decision-log.store'

export function localDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Dérive le plan (`PlacedBlock[]`) et la charge quotidienne (`DailyLoad[]`)
 * sur la plage [today, rangeEndStr], à partir des stores Vethos. Recalculé via
 * `useMemo` dès qu'une entrée change (tâches, objectifs, planning, date du
 * jour, plage demandée). Réf. spec §9, §10.
 *
 * Le composant appelant passe `now` (typiquement un `useState(new Date())` avec
 * `setInterval` 60s) pour faire glisser la fenêtre au passage d'un jour.
 */
export function usePlacement(
  now: Date,
  rangeEndStr: string,
  options: { maxPlanningDays?: number; todayStartMinute?: number } = {},
): {
  blocks: PlacedBlock[]
  dailyLoad: DailyLoad[]
  diagnostics: PlacementDiagnostics
  placementResults: Map<string, PlacementResult>
  todayStr: string
  dates: string[]
} {
  const tasks = useTasksStore((s) => s.tasks)
  const objectives = useLevelsStore((s) => s.objectives)
  const levelDetectedWakeMinute = useLevelsStore((s) => s.detectedWakeMinute)
  const levelDetectedPeakHour = useLevelsStore((s) => s.detectedPeakHour)
  const levelDetectedChronotype = useLevelsStore((s) => s.detectedChronotype)
  const passiveSleepSessions = useLevelsStore((s) => s.passiveSleepSessions)
  const rules = useScheduleStore((s) => s.rules)
  const entries = useScheduleStore((s) => s.entries)
  const sleepStart = useSettingsStore((s) => s.sleepStart)
  const sleepEnd = useSettingsStore((s) => s.sleepEnd)
  const chronotype = useSettingsStore((s) => s.chronotype)
  const detectedWakeMinute = useSettingsStore((s) => s.detectedWakeMinute)
  const detectedPeakHour = useSettingsStore((s) => s.detectedPeakHour)
  const detectedChronotype = useSettingsStore((s) => s.detectedChronotype)
  const userId = useTasksStore((s) => s.userId)
  const engineV2Placement = useSettingsStore((s) => s.engineV2Placement)
  const engineV2Blocking = useSettingsStore((s) => s.engineV2Blocking)
  const engineV2Priority = useSettingsStore((s) => s.engineV2Priority)
  const engineV2Completion = useSettingsStore((s) => s.engineV2Completion)
  const engineV2Execution = useSettingsStore((s) => s.engineV2Execution)

  const todayStr = localDateKey(now)
  const maxPlanningDays = options.maxPlanningDays
  const todayStartMinuteOverride = options.todayStartMinute

  const placement = useMemo(() => {
    const flags = getEngineFlags({
      engineV2Placement,
      engineV2Blocking,
      engineV2Priority,
      engineV2Completion,
      engineV2Execution,
    })

    const todayStartMinute =
      todayStartMinuteOverride ?? now.getHours() * 60 + now.getMinutes()
    const clampedRangeEnd = clampPlanningRangeEnd(todayStr, rangeEndStr, maxPlanningDays)
    const fatigueRecovery = computeFatigueRecoveryPlan({
      sessions: passiveSleepSessions,
      bedtimeMinute: parseClockTimeToMinute(sleepStart),
      now,
    })

    let planResult: { blocks: PlacedBlock[]; diagnostics: PlacementDiagnostics }

    // Point 7.16 — Étape E : le plan V2 (PlacementPlanV2) est toujours calculé
    // (diagnostic, explication, exposition future), mais il n'écrit ses blocs dans
    // le planning réel QUE si placementControlsPlanningStore est true. Tant que ce
    // flag est false (défaut), le moteur V1 reste la source des blocs appliqués.
    const canApplyV2ToPlanning = DEFAULT_PLACEMENT_PLAN_V2_FLAGS.placementControlsPlanningStore

    if (flags.newPriorityControlsPlacement && canApplyV2ToPlanning) {
      planResult = withV1FallbackSync({
        v2: () => {
          const v2Context = buildPlanningContextV2({
            userId: userId || 'guest',
            dateRange: { startDate: todayStr, endDate: clampedRangeEnd },
            schedule: { rules, entries, nextSessionPenaltyMinutes: 0 } as any,
            settings: {
              sleepStart,
              sleepEnd,
              chronotype,
              detectedWakeMinute: (levelDetectedWakeMinute ?? detectedWakeMinute) ?? undefined,
              detectedPeakHour: (levelDetectedPeakHour ?? detectedPeakHour) ?? undefined,
              detectedChronotype: (levelDetectedChronotype ?? detectedChronotype) ?? undefined,
              staticTomorrowPlanningEnabled: true,
            } as any,
            now,
          }) as any
          
          const usableFreeWindows = (v2Context.days || []).flatMap((day: any) =>
            (day.freeWindows || []).map((win: any) => ({
              ...win,
              windowType: win.windowType === 'deep_work' ? 'normal' : win.windowType,
            }))
          )
          const enrichedContext = {
            ...v2Context,
            usableFreeWindows,
          }

          const planV2 = buildPlacementPlanV2({
            userId: userId || 'guest',
            dateRange: { startDate: todayStr, endDate: clampedRangeEnd },
            taskModelsV2: tasks as any,
            objectiveModelsV2: objectives,
            planningContext: enrichedContext as any,
            settings: {
              sleepStart,
              sleepEnd,
              chronotype,
              detectedWakeMinute: (levelDetectedWakeMinute ?? detectedWakeMinute) ?? undefined,
              detectedPeakHour: (levelDetectedPeakHour ?? detectedPeakHour) ?? undefined,
              detectedChronotype: (levelDetectedChronotype ?? detectedChronotype) ?? undefined,
              staticTomorrowPlanningEnabled: true,
            } as any,
            now: now.toISOString(),
          } as any)
          const mappedBlocks = mapProposedPlacementBlocksToPlacedBlocks(planV2.proposedBlocks, planV2)
          const totalUsableFreeMinutes = v2Context.weeklySummary.usableFreeMinutes
          const mappedDiag = buildV1DiagnosticsFromV2(planV2, tasks, objectives, totalUsableFreeMinutes)
          return {
            blocks: mappedBlocks,
            diagnostics: mappedDiag,
          }
        },
        v1: () => {
          const planV1 = computePlacementPlan({
            tasks,
            objectives,
            rules,
            entries,
            todayStr,
            rangeEndStr,
            maxPlanningDays,
            todayStartMinute,
            wakeMinute: levelDetectedWakeMinute ?? detectedWakeMinute ?? parseClockTimeToMinute(sleepEnd),
            chronotype: levelDetectedChronotype ?? detectedChronotype ?? chronotype,
            peakAlertnessHour: levelDetectedPeakHour ?? detectedPeakHour,
            morningBufferMinutes: 30,
            includeRecoveryBlocks: true,
            fatigueRecoveryDate: fatigueRecovery?.recoveryDate,
            fatigueRecoveryMinutes: fatigueRecovery?.reductionMinutes,
          })
          return {
            blocks: planV1.blocks,
            diagnostics: planV1.diagnostics,
          }
        },
        label: 'use-placement-v2',
      })
    } else {
      const planV1 = computePlacementPlan({
        tasks,
        objectives,
        rules,
        entries,
        todayStr,
        rangeEndStr,
        maxPlanningDays,
        todayStartMinute,
        wakeMinute: levelDetectedWakeMinute ?? detectedWakeMinute ?? parseClockTimeToMinute(sleepEnd),
        chronotype: levelDetectedChronotype ?? detectedChronotype ?? chronotype,
        peakAlertnessHour: levelDetectedPeakHour ?? detectedPeakHour,
        morningBufferMinutes: 30,
        includeRecoveryBlocks: true,
        fatigueRecoveryDate: fatigueRecovery?.recoveryDate,
        fatigueRecoveryMinutes: fatigueRecovery?.reductionMinutes,
      })
      planResult = {
        blocks: planV1.blocks,
        diagnostics: planV1.diagnostics,
      }
    }

    const blocks = planResult.blocks
    const dates = enumerateDates(todayStr, clampedRangeEnd)
    const dailyLoad = summarizeDailyLoad(blocks, dates, entries, rules, {
      todayStr,
      todayStartMinute,
      wakeMinute: levelDetectedWakeMinute ?? detectedWakeMinute ?? parseClockTimeToMinute(sleepEnd),
      chronotype: levelDetectedChronotype ?? detectedChronotype ?? chronotype,
      peakAlertnessHour: levelDetectedPeakHour ?? detectedPeakHour,
      morningBufferMinutes: 30,
      includeRecoveryBlocks: true,
      fatigueRecoveryDate: fatigueRecovery?.recoveryDate,
      fatigueRecoveryMinutes: fatigueRecovery?.reductionMinutes,
    })
    const taskById = new Map(tasks.map((task) => [task.id, task]))
    const objectiveById = new Map(objectives.map((objective) => [objective.id, objective]))
    const placementResults = new Map(blocks.map((block) => {
      const task = block.kind === 'task' && block.refId
        ? taskById.get(block.refId) ?? null
        : block.linkedTaskId ? taskById.get(block.linkedTaskId) ?? null : null
      const objective = block.kind === 'objective' && block.refId
        ? objectiveById.get(block.refId) ?? null
        : task?.linkedObjectiveId ? objectiveById.get(task.linkedObjectiveId) ?? null : null
      return [block.id, buildPlacementResult(block, task, objective)] as const
    }))
    return { blocks, dailyLoad, diagnostics: planResult.diagnostics, placementResults, todayStr, dates }
  }, [
    tasks,
    objectives,
    rules,
    entries,
    todayStr,
    rangeEndStr,
    now,
    sleepStart,
    sleepEnd,
    passiveSleepSessions,
    chronotype,
    detectedWakeMinute,
    detectedPeakHour,
    detectedChronotype,
    levelDetectedWakeMinute,
    levelDetectedPeakHour,
    levelDetectedChronotype,
    maxPlanningDays,
    todayStartMinuteOverride,
    userId,
    engineV2Placement,
    engineV2Blocking,
    engineV2Priority,
    engineV2Completion,
    engineV2Execution,
  ])

  const recordDecision = useDecisionLogStore((state) => state.record)
  useEffect(() => {
    if (!userId) return
    for (const [blockId, placementResult] of placement.placementResults) {
      void recordDecision({ type: 'placement', targetType: 'planning_block', targetId: blockId, placementResult })
    }
  }, [placement.placementResults, recordDecision, userId])

  return placement
}
