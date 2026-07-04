import { useAppUsageStore } from './app-usage.store'
import { useBlockingStore } from './blocking.store'
import { useDeclaredAppsStore } from './declared-apps.store'
import { useLevelsStore } from './levels.store'
import { useOnboardingStore } from './onboarding.store'
import { useRestModeStore } from './rest-mode.store'
import { useScheduleStore } from './schedule.store'
import { useSettingsStore } from './settings.store'
import { useTasksStore } from './tasks.store'
import { useToastStore } from './toast.store'
import { useRegistryStore } from './registry.store'
import { useUserModelStore } from './user-model.store'
import { useDecisionLogStore } from './decision-log.store'

export function setUserIdForAllStores(userId: string): void {
  useSettingsStore.getState().setUserId(userId)
  useScheduleStore.getState().setUserId(userId)
  useLevelsStore.getState().setUserId(userId)
  useDeclaredAppsStore.getState().setUserId(userId)
  useTasksStore.getState().setUserId(userId)
  useBlockingStore.getState().setUserId(userId)
  useAppUsageStore.getState().setUserId(userId)
  useRegistryStore.getState().setUserId(userId)
  useUserModelStore.getState().setUserId(userId)
  useDecisionLogStore.getState().setUserId(userId)
}

export function resetAllStores(): void {
  useSettingsStore.getState().reset()
  useScheduleStore.getState().reset()
  useLevelsStore.getState().reset()
  useDeclaredAppsStore.getState().reset()
  useTasksStore.getState().reset()
  useBlockingStore.getState().reset()
  useAppUsageStore.getState().reset()
  useRestModeStore.getState().reset()
  useOnboardingStore.getState().reset()
  useToastStore.getState().reset()
  useRegistryStore.getState().reset()
  useUserModelStore.getState().reset()
  useDecisionLogStore.getState().reset()
}
