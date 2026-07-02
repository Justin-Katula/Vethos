import { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Show, useAuth } from '@clerk/react'
import { AnimatePresence } from 'framer-motion'
import { Layout } from './components/Layout'
import { OnboardingOverlay } from './components/onboarding/OnboardingOverlay'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { ToastViewport } from './components/ui/Toast'
import { ProgressPulse } from './components/levels/ProgressPulse'
import { AutoSessionEnforcer } from './components/blocking/AutoSessionEnforcer'
import { VethosLogo } from './components/VethosLogo'
import { useSettingsStore } from './store/settings.store'
import { flushSettingsPersist } from './store/settings.store'
import { flushSchedulePersist, useScheduleStore } from './store/schedule.store'
import { useBlockingStore } from './store/blocking.store'
import { useLevelsStore } from './store/levels.store'
import { useDeclaredAppsStore } from './store/declared-apps.store'
import { useTasksStore } from './store/tasks.store'
import { resetAllStores, setUserIdForAllStores } from './store/reset'
import { useUserModelStore } from './store/user-model.store'
import { useRegistryStore } from './store/registry.store'
import { useDecisionLogStore } from './store/decision-log.store'
import { vethos } from './lib/ipc'
import { useToast } from './lib/use-toast'
import { computeFreeTimeSlots } from './lib/free-time-calculator'
import { jsDateToDayOfWeek } from './lib/schedule-selectors'
import HomePage from './pages/HomePage'
import AppsPage from './pages/AppsPage'
import StatisticsPage from './pages/StatisticsPage'
import PlanningPage from './pages/PlanningPage'
import BlockingPage from './pages/BlockingPage'
import SettingsPage from './pages/SettingsPage'
import AuthPage from './pages/AuthPage'
import BlockOverlay from './pages/BlockOverlay'
import TodoPage from './pages/TodoPage'

function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function App(): JSX.Element {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/block-overlay" element={<BlockOverlay />} />
        <Route path="/*" element={<VethosApp />} />
      </Routes>
    </ErrorBoundary>
  )
}

function VethosApp(): JSX.Element {
  const { isLoaded: authLoaded, isSignedIn, userId } = useAuth()
  const loaded = useSettingsStore((s) => s.loaded)
  const onboardingCompleted = useSettingsStore((s) => s.onboardingCompleted)
  const loadSettings = useSettingsStore((s) => s.load)
  const [ipcUserReady, setIpcUserReady] = useState(false)

  const loadSchedule = useScheduleStore((s) => s.load)
  const scheduleLoaded = useScheduleStore((s) => s.loaded)
  const scheduleRules = useScheduleStore((s) => s.rules)
  const scheduleEntries = useScheduleStore((s) => s.entries)
  const loadBlocking = useBlockingStore((s) => s.load)
  const blockingLoaded = useBlockingStore((s) => s.loaded)
  const blockingHistory = useBlockingStore((s) => s.state.history)
  const loadLevels = useLevelsStore((s) => s.load)
  const levelsLoaded = useLevelsStore((s) => s.loaded)
  const lastCalculatedDate = useLevelsStore((s) => s.lastCalculatedDate)
  const setCalculatedFreeTime = useLevelsStore((s) => s.setCalculatedFreeTime)
  const reconcileWithHistory = useLevelsStore((s) => s.reconcileWithHistory)
  const loadDeclaredApps = useDeclaredAppsStore((s) => s.load)
  const loadTasks = useTasksStore((s) => s.load)
  const loadUserModel = useUserModelStore((s) => s.load)
  const rebuildUserModel = useUserModelStore((s) => s.rebuild)
  const userModelLoaded = useUserModelStore((s) => s.loaded)
  const registryItems = useRegistryStore((s) => s.items)
  const registryLoaded = useRegistryStore((s) => s.loaded)
  const loadRegistry = useRegistryStore((s) => s.load)
  const loadDecisionLog = useDecisionLogStore((s) => s.load)
  const objectives = useLevelsStore((s) => s.objectives)
  const tasks = useTasksStore((s) => s.tasks)
  const cognitiveStats = useLevelsStore((s) => s.cognitiveEfficiencySamples)
  const reconcileLevelZero = useTasksStore((s) => s.reconcileLevelZero)
  const tasksLoaded = useTasksStore((s) => s.loaded)
  const toast = useToast()

  useEffect(() => {
    if (!authLoaded) return
    let cancelled = false
    setIpcUserReady(false)
    if (!isSignedIn || !userId) {
      resetAllStores()
      void vethos.auth.setUserId(undefined).finally(() => { if (!cancelled) setIpcUserReady(true) })
      return () => { cancelled = true }
    }
    setUserIdForAllStores(userId)
    void vethos.auth.setUserId(userId).then(() => { if (!cancelled) setIpcUserReady(true) })
    return () => { cancelled = true }
  }, [authLoaded, isSignedIn, userId])

  // Boot — charge tous les stores au montage
  useEffect(() => {
    if (!authLoaded || !isSignedIn || !userId || !ipcUserReady) return
    void loadSettings(userId)
    void loadSchedule(userId)
    void loadBlocking(userId)
    void loadLevels(userId)
    void loadDeclaredApps(userId)
    void loadTasks(userId)
    void loadUserModel(userId)
    void loadRegistry(userId)
    void loadDecisionLog(userId)
  }, [
    authLoaded,
    isSignedIn,
    userId,
    ipcUserReady,
    loadSettings,
    loadSchedule,
    loadBlocking,
    loadLevels,
    loadDeclaredApps,
    loadTasks,
    loadUserModel,
    loadRegistry,
    loadDecisionLog,
  ])

  useEffect(() => {
    if (!userModelLoaded || !tasksLoaded || !levelsLoaded || !blockingLoaded || !registryLoaded) return
    void rebuildUserModel({
      tasks: tasks as unknown as Record<string, unknown>[],
      objectives,
      sessions: blockingHistory as unknown as Record<string, unknown>[],
      blockingHistory: blockingHistory as unknown as Record<string, unknown>[],
      appRegistry: registryItems.filter((item) => item.kind === 'app'),
      siteRegistry: registryItems.filter((item) => item.kind === 'site'),
      cognitiveStats: cognitiveStats as unknown as Record<string, unknown>[],
    })
  }, [userModelLoaded, tasksLoaded, levelsLoaded, blockingLoaded, registryLoaded, rebuildUserModel, tasks, objectives, blockingHistory, registryItems, cognitiveStats])

  // V2 P9 — Réconciliation niveau-0 au boot (une fois tasks chargées)
  useEffect(() => {
    if (!tasksLoaded) return
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const d = String(today.getDate()).padStart(2, '0')
    void reconcileLevelZero(`${y}-${m}-${d}`)
  }, [tasksLoaded, reconcileLevelZero])

  // V2 P1 — Le temps libre est recalculé au boot si la date locale a changé,
  // sans dépendre d'une visite de la page d'accueil.
  useEffect(() => {
    if (!scheduleLoaded || !levelsLoaded || !tasksLoaded) return
    const today = new Date()
    const todayStr = localDateKey(today)
    if (lastCalculatedDate === todayStr) return
    const todayDow = jsDateToDayOfWeek(today)
    const slots = computeFreeTimeSlots(todayDow, scheduleEntries, scheduleRules)
    const freeMinutes = slots
      .filter((s) => !s.isPreparation)
      .reduce((sum, s) => sum + s.durationMinutes, 0)
    void setCalculatedFreeTime(freeMinutes, todayStr)
  }, [
    scheduleLoaded,
    levelsLoaded,
    tasksLoaded,
    lastCalculatedDate,
    scheduleEntries,
    scheduleRules,
    setCalculatedFreeTime,
  ])

  // Progression des objectifs : traitée au niveau app, pas seulement
  // quand l'utilisateur visite la page Objectifs.
  useEffect(() => {
    if (!scheduleLoaded || !levelsLoaded || !blockingLoaded) return
    void reconcileWithHistory(blockingHistory, scheduleRules)
  }, [
    scheduleLoaded,
    levelsLoaded,
    blockingLoaded,
    blockingHistory,
    scheduleRules,
    reconcileWithHistory,
  ])

  useEffect(() => {
    const offFlush = vethos.app.onFlushDebounces(() => {
      void Promise.all([flushSchedulePersist(), flushSettingsPersist()])
    })
    const offClock = vethos.blocking.onClockTamper((event) => {
      toast.error({
        title: 'Horloge modifiée',
        description: `Saut détecté : ${Math.round(event.driftMs / 1000)} secondes.`,
      })
    })
    const offBreakRequired = vethos.blocking.onBreakRequired((event) => {
      toast.error({
        title: 'Pause obligatoire',
        description: `${event.reason} Repos requis : ${event.restMinutes} min.`,
      })
    })
    const offUpdateReady = vethos.app.onUpdateDownloaded((info) => {
      toast.info({
        title: 'Mise à jour prête',
        description: info.version
          ? `Vethos ${info.version} sera installé au prochain redémarrage.`
          : 'Elle sera installée au prochain redémarrage.',
      })
    })
    return () => {
      offFlush()
      offClock()
      offBreakRequired()
      offUpdateReady()
    }
  }, [toast])

  const showOnboarding = loaded && onboardingCompleted !== true

  if (!authLoaded) {
    return (
      <>
        <div className="flex h-screen w-screen items-center justify-center bg-bg-base text-text-primary">
          <div className="flex flex-col items-center gap-4">
            <VethosLogo size={32} />
            <div className="h-1 w-28 overflow-hidden rounded-full bg-border-subtle">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-accent" />
            </div>
          </div>
        </div>
        <ToastViewport />
      </>
    )
  }

  return (
    <>
      <Show when="signed-out" treatPendingAsSignedOut>
        <AuthPage />
      </Show>
      <Show when="signed-in">
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="/todo" element={<TodoPage />} />
            <Route path="/planning" element={<PlanningPage />} />
            <Route path="/blocking" element={<BlockingPage />} />
            <Route path="/apps" element={<AppsPage />} />
            <Route path="/statistics" element={<StatisticsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
        <AnimatePresence>
          {showOnboarding && <OnboardingOverlay key="onboarding" />}
        </AnimatePresence>
        <ProgressPulse />
        <AutoSessionEnforcer />
      </Show>
      <ToastViewport />
    </>
  )
}
