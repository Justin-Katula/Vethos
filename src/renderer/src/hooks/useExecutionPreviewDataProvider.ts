import { useState, useCallback } from 'react'
import type { ExecutionPreviewProviderState } from '@shared/execution-preview-data-connector-model'
import { ExecutionPreviewDataConnectorFlags } from '@shared/execution-preview-data-connector-flags'
import { buildExecutionPreviewFromReadOnlyData } from '../lib/execution-preview-data-provider'

// Imports des stores existants - Lecture seule EXCLUSIVEMENT
import { useTasksStore } from '../store/tasks.store'
import { useLevelsStore } from '../store/levels.store'
import { useScheduleStore } from '../store/schedule.store'
import { useBlockingStore } from '../store/blocking.store'
import { useRegistryStore } from '../store/registry.store'
import { useSettingsStore } from '../store/settings.store'

export type UseExecutionPreviewDataProviderResult = {
  state: ExecutionPreviewProviderState
  generatePreview: () => void
  clearPreview: () => void
  canGeneratePreview: boolean
  canApplyPreview: boolean
}

export function useExecutionPreviewDataProvider(): UseExecutionPreviewDataProviderResult {
  const [state, setState] = useState<ExecutionPreviewProviderState>({
    status: 'idle',
    warnings: [],
    errors: [],
    canGeneratePreview: ExecutionPreviewDataConnectorFlags.executionPreviewManualGenerateEnabled,
    canApplyPreview: false,
    confidence: 100,
  })

  const generatePreview = useCallback(() => {
    if (!ExecutionPreviewDataConnectorFlags.executionPreviewManualGenerateEnabled) return

    setState((prev) => ({ ...prev, status: 'building' }))

    try {
      // 1. Extraction en LECTURE SEULE.
      // Règle stricte: destructure uniquement les données, AUCUNE action (ex: saveTask, etc.)
      const { tasks } = useTasksStore.getState()
      const { objectives } = useLevelsStore.getState()
      const { rules, entries } = useScheduleStore.getState()
      const { state: blockingState, active } = useBlockingStore.getState()
      const { items } = useRegistryStore.getState()
      
      // Settings et UserId
      const settingsStore = useSettingsStore.getState()
      const userId = settingsStore.userId || useTasksStore.getState().userId || undefined
      
      // Extraction sécurisée des settings sans fonctions
      const settings = {
        sessionRulesEnabled: settingsStore.sessionRulesEnabled,
        userProfile: settingsStore.userProfile,
        sleepStart: settingsStore.sleepStart,
        sleepEnd: settingsStore.sleepEnd,
        chronotype: settingsStore.chronotype,
        detectedChronotype: settingsStore.detectedChronotype,
        staticTomorrowPlanningEnabled: settingsStore.staticTomorrowPlanningEnabled,
        engineV2Execution: settingsStore.engineV2Execution,
      }

      const dNow = new Date()
      const dTomorrow = new Date()
      dTomorrow.setDate(dTomorrow.getDate() + 1)
      
      // 2. Génération pur via Provider
      const result = buildExecutionPreviewFromReadOnlyData({
        userId,
        tasks,
        objectives,
        schedules: [...rules, ...entries],
        sessions: [blockingState.profiles, active], // Extraits purement informatifs
        apps: items.filter(i => i.kind === 'app'),
        sites: items.filter(i => i.kind === 'site'),
        settings,
        dateRange: {
          startDate: dNow.toISOString().slice(0, 10),
          endDate: dTomorrow.toISOString().slice(0, 10)
        },
        now: dNow.toISOString()
      })

      setState(result)
    } catch (err) {
      setState({
        status: 'failed',
        warnings: [],
        errors: [`Échec de génération de la preview: ${err instanceof Error ? err.message : String(err)}`],
        canGeneratePreview: true,
        canApplyPreview: false,
        confidence: 0,
      })
    }
  }, [])

  const clearPreview = useCallback(() => {
    setState({
      status: 'idle',
      previewPlan: undefined,
      warnings: [],
      errors: [],
      canGeneratePreview: ExecutionPreviewDataConnectorFlags.executionPreviewManualGenerateEnabled,
      canApplyPreview: false,
      confidence: 100,
    })
  }, [])

  return {
    state,
    generatePreview,
    clearPreview,
    canGeneratePreview: state.canGeneratePreview,
    canApplyPreview: (useSettingsStore.getState().engineV2Execution && state.canApplyPreview) ? (state.canApplyPreview as any) : false,
  }
}
