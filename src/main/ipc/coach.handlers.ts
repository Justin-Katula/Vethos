import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import {
  analyzeTaskClarity,
  generateSubTasks,
  categorizeApplications,
  classifyRegistryForTask,
  classifyRegistryForObjective,
  mergeCoachAppReferences,
} from '../services/coach.service'
import { getInstalledApps } from './apps'
import type { CoachResult } from '@shared/coach-result'

export function registerCoachHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.COACH_ANALYZE_TASK,
    async (
      _event,
      args: { taskTitle: string },
    ): Promise<CoachResult<{ clear: boolean; suggestedQuestion?: string }>> => {
      return analyzeTaskClarity(args.taskTitle)
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.COACH_GENERATE_SUBTASKS,
    async (
      _event,
      args: { taskTitle: string; contextNotes: string; totalMinutes: number },
    ): Promise<CoachResult<Array<{ title: string; durationMinutes: number }>>> => {
      return generateSubTasks(args.taskTitle, args.contextNotes, args.totalMinutes)
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.COACH_CATEGORIZE_APPS,
    async (
      _event,
      args: { apps: Array<{ name: string; exeName: string }> },
    ): Promise<CoachResult<Record<string, string>>> => {
      const apps =
        args.apps.length > 0
          ? args.apps
          : (await getInstalledApps())
              .filter((app) => app.exeName && app.exeName.toLowerCase() !== 'unknown.exe')
              .map((app) => ({
                name: app.name,
                exeName: app.exeName,
              }))
      return categorizeApplications(apps)
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.COACH_CLASSIFY_APPS_FOR_TASK,
    async (
      _event,
      args: {
        taskTitle: string
        contextNotes: string
        apps: Array<{ identifier: string; displayName: string }>
        currentUsefulApps: string[]
      },
    ): Promise<CoachResult<Record<string, 'useful' | 'distraction' | 'neutral'>>> => {
      const installedApps = await getInstalledApps()
      return classifyRegistryForTask(
        args.taskTitle,
        args.contextNotes,
        mergeCoachAppReferences(args.apps, installedApps),
        args.currentUsefulApps,
      )
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.COACH_CLASSIFY_APPS_FOR_OBJECTIVE,
    async (
      _event,
      args: {
        objectiveName: string
        objectiveDescription: string
        apps: Array<{ identifier: string; displayName: string }>
        currentUsefulApps: string[]
      },
    ): Promise<CoachResult<Record<string, 'useful' | 'distraction' | 'neutral'>>> => {
      const installedApps = await getInstalledApps()
      return classifyRegistryForObjective(
        args.objectiveName,
        args.objectiveDescription,
        mergeCoachAppReferences(args.apps, installedApps),
        args.currentUsefulApps,
      )
    },
  )
}
