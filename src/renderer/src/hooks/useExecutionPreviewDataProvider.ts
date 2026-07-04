import { useState, useCallback } from 'react'
import type { ExecutionPreviewProviderState } from '@shared/execution-preview-data-connector-model'
import { ExecutionPreviewDataConnectorFlags } from '@shared/execution-preview-data-connector-flags'
import { buildExecutionPreviewFromReadOnlyData } from '../lib/execution-preview-data-provider'
import { normalizeExecutionPreviewSessions } from '../lib/execution-preview-session-normalizer'

// Imports des stores existants - Lecture seule EXCLUSIVEMENT
import { useTasksStore } from '../store/tasks.store'
import { useLevelsStore } from '../store/levels.store'
import { useScheduleStore } from '../store/schedule.store'
import { useSessionV2Store } from '../store/session-v2.store'
import { useRegistryStore } from '../store/registry.store'
import { useSettingsStore } from '../store/settings.store'
import { useUserModelStore } from '../store/user-model.store'

export type UseExecutionPreviewDataProviderResult = {
  state: ExecutionPreviewProviderState
  generatePreview: () => void
  clearPreview: () => void
  canGeneratePreview: boolean
  canApplyPreview: false
}

const canManuallyGenerate =
  ExecutionPreviewDataConnectorFlags.executionPreviewDataConnectorEnabled &&
  ExecutionPreviewDataConnectorFlags.executionPreviewReadOnlySnapshotEnabled &&
  ExecutionPreviewDataConnectorFlags.executionPreviewSnapshotSanitizerEnabled &&
  ExecutionPreviewDataConnectorFlags.executionPreviewProposedPipelineRunnerEnabled &&
  ExecutionPreviewDataConnectorFlags.executionPreviewDataProviderEnabled &&
  ExecutionPreviewDataConnectorFlags.executionPreviewManualGenerateEnabled

export function useExecutionPreviewDataProvider(): UseExecutionPreviewDataProviderResult {
  const [state, setState] = useState<ExecutionPreviewProviderState>({
    status: 'idle',
    warnings: [],
    errors: [],
    canGeneratePreview: canManuallyGenerate,
    canApplyPreview: false,
    confidence: 100,
  })

  const generatePreview = useCallback(() => {
    if (!canManuallyGenerate) return

    setState((prev) => ({ ...prev, status: 'building' }))

    try {
      // 1. Extraction en LECTURE SEULE.
      // Règle stricte: destructure uniquement les données, AUCUNE action (ex: saveTask, etc.)
      const { tasks, loaded: tasksLoaded } = useTasksStore.getState()
      const { objectives, loaded: objectivesLoaded } = useLevelsStore.getState()
      const { rules, entries, loaded: scheduleLoaded } = useScheduleStore.getState()
      const { records, loaded: sessionsLoaded } = useSessionV2Store.getState()
      const { items, loaded: registryLoaded } = useRegistryStore.getState()
      const { model: userModel, loaded: userModelLoaded } = useUserModelStore.getState()
      
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
        sessions: normalizeExecutionPreviewSessions(records),
        apps: items.filter(i => i.kind === 'app'),
        sites: items.filter(i => i.kind === 'site'),
        settings,
        userModel,
        auth: { userIdPresent: Boolean(userId) },
        sourceReports: [
          sourceReport('task_store', 'TasksStore', tasksLoaded, ['tasks', 'userId'], ['addTask', 'saveTask', 'deleteTask', 'markTaskCompleted']),
          sourceReport('objective_store', 'LevelsStore', objectivesLoaded, ['objectives'], ['saveObjective', 'deleteObjective', 'changeObjectiveLevel']),
          sourceReport('planning_store', 'ScheduleStore', scheduleLoaded, ['rules', 'entries'], ['saveRule', 'deleteRule', 'saveEntry', 'deleteEntry', 'replaceAll']),
          sourceReport('session_store', 'SessionV2Store', sessionsLoaded, ['records'], ['upsertPlan', 'activate', 'endRuntime', 'recordOutcome']),
          sourceReport('app_site_store', 'RegistryStore', registryLoaded, ['items'], ['observeItem', 'syncDiscoveredApps', 'classifyItem', 'demoteItem']),
          sourceReport('settings_store', 'SettingsStore', settingsStore.loaded, Object.keys(settings), ['save', 'updateSettings']),
          sourceReport('auth_context', 'Clerk/synchronized userId', Boolean(userId), ['userIdPresent'], ['setUserId']),
          sourceReport('unknown', 'UserModelStore', userModelLoaded, ['model'], ['rebuild', 'recordEvent', 'applyCorrection']),
        ],
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
      canGeneratePreview: canManuallyGenerate,
      canApplyPreview: false,
      confidence: 100,
    })
  }, [])

  return {
    state,
    generatePreview,
    clearPreview,
    canGeneratePreview: state.canGeneratePreview,
    canApplyPreview: false,
  }
}

function sourceReport(
  kind: import('@shared/execution-preview-data-connector-model').ExecutionPreviewDataSourceKind,
  name: string,
  available: boolean,
  readableFields: string[],
  forbiddenActions: string[],
): import('@shared/execution-preview-data-connector-model').ExecutionPreviewDataSourceReport {
  return {
    kind,
    name,
    status: available ? 'read_only_confirmed' : 'missing',
    readableFields,
    forbiddenActions,
    warnings: available ? [] : [`${name} n’est pas chargé.`],
    confidence: available ? 100 : 20,
  }
}
