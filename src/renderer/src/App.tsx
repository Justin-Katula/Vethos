import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { Layout } from './components/Layout'
import { OnboardingOverlay } from './components/onboarding/OnboardingOverlay'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { ToastViewport } from './components/ui/Toast'
import { ProgressPulse } from './components/levels/ProgressPulse'
import { NexusLogo } from './components/NexusLogo'
import { useAuthStore } from './store/auth.store'
import { useSettingsStore } from './store/settings.store'
import { flushSettingsPersist } from './store/settings.store'
import { flushSchedulePersist, useScheduleStore } from './store/schedule.store'
import { useBlockingStore } from './store/blocking.store'
import { useLevelsStore } from './store/levels.store'
import { useDeclaredAppsStore } from './store/declared-apps.store'
import { useTasksStore } from './store/tasks.store'
import { nexus } from './lib/ipc'
import { useToast } from './lib/use-toast'
import { computeFreeTimeSlots } from './lib/free-time-calculator'
import { jsDateToDayOfWeek } from './lib/schedule-selectors'
import HomePage from './pages/HomePage'
import ObjectivesPage from './pages/ObjectivesPage'
import PlanningPage from './pages/PlanningPage'
import BlockingPage from './pages/BlockingPage'
import SettingsPage from './pages/SettingsPage'
import TasksPage from './pages/TasksPage'
import AuthPage from './pages/AuthPage'

function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function App(): JSX.Element {
  const authLoaded = useAuthStore((s) => s.loaded)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const loadAuth = useAuthStore((s) => s.load)
  const loaded = useSettingsStore((s) => s.loaded)
  const onboardingCompleted = useSettingsStore((s) => s.onboardingCompleted)
  const loadSettings = useSettingsStore((s) => s.load)

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
  const reconcileLevelZero = useTasksStore((s) => s.reconcileLevelZero)
  const tasksLoaded = useTasksStore((s) => s.loaded)
  const toast = useToast()

  // Boot — charge tous les stores au montage
  useEffect(() => {
    void loadAuth()
    void loadSettings()
    void loadSchedule()
    void loadBlocking()
    void loadLevels()
    void loadDeclaredApps()
    void loadTasks()
  }, [loadAuth, loadSettings, loadSchedule, loadBlocking, loadLevels, loadDeclaredApps, loadTasks])

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
    const freeMinutes = slots.filter((s) => !s.isPreparation).reduce((sum, s) => sum + s.durationMinutes, 0)
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
    const offFlush = nexus.app.onFlushDebounces(() => {
      void Promise.all([flushSchedulePersist(), flushSettingsPersist()])
    })
    const offClock = nexus.blocking.onClockTamper((event) => {
      toast.error({
        title: 'Horloge modifiée',
        description: `Saut détecté : ${Math.round(event.driftMs / 1000)} secondes.`,
      })
    })
    const offBreakRequired = nexus.blocking.onBreakRequired((event) => {
      toast.error({
        title: 'Pause obligatoire',
        description: `${event.reason} Repos requis : ${event.restMinutes} min.`,
      })
    })
    const offUpdateReady = nexus.app.onUpdateDownloaded((info) => {
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
      <ErrorBoundary>
        <div className="flex h-screen w-screen items-center justify-center bg-bg-base text-text-primary">
          <div className="flex flex-col items-center gap-4">
            <NexusLogo size={32} />
            <div className="h-1 w-28 overflow-hidden rounded-full bg-border-subtle">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-accent" />
            </div>
          </div>
        </div>
        <ToastViewport />
      </ErrorBoundary>
    )
  }

  if (!isAuthenticated) {
    return (
      <ErrorBoundary>
        <AuthPage />
        <ToastViewport />
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/objectives" element={<ObjectivesPage />} />
          <Route path="/planning" element={<PlanningPage />} />
          <Route path="/blocking" element={<BlockingPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
      <AnimatePresence>{showOnboarding && <OnboardingOverlay key="onboarding" />}</AnimatePresence>
      <ProgressPulse />
      <ToastViewport />
    </ErrorBoundary>
  )
}
