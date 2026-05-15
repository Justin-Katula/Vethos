import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { Layout } from './components/Layout'
import { OnboardingOverlay } from './components/onboarding/OnboardingOverlay'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { ToastViewport } from './components/ui/Toast'
import { FloatingCredit } from './components/levels/FloatingCredit'
import { useSettingsStore } from './store/settings.store'
import { flushSettingsPersist } from './store/settings.store'
import { flushSchedulePersist, useScheduleStore } from './store/schedule.store'
import { useBlockingStore } from './store/blocking.store'
import { useLevelsStore } from './store/levels.store'
import { useDeclaredAppsStore } from './store/declared-apps.store'
import { useTasksStore } from './store/tasks.store'
import { nexus } from './lib/ipc'
import { useToast } from './lib/use-toast'
import HomePage from './pages/HomePage'
import ObjectivesPage from './pages/ObjectivesPage'
import PlanningPage from './pages/PlanningPage'
import BlockingPage from './pages/BlockingPage'
import SettingsPage from './pages/SettingsPage'
import TasksPage from './pages/TasksPage'

export default function App(): JSX.Element {
  const loaded = useSettingsStore((s) => s.loaded)
  const onboardingCompleted = useSettingsStore((s) => s.onboardingCompleted)
  const loadSettings = useSettingsStore((s) => s.load)

  const loadSchedule = useScheduleStore((s) => s.load)
  const loadBlocking = useBlockingStore((s) => s.load)
  const loadLevels = useLevelsStore((s) => s.load)
  const loadDeclaredApps = useDeclaredAppsStore((s) => s.load)
  const loadTasks = useTasksStore((s) => s.load)
  const reconcileLevelZero = useTasksStore((s) => s.reconcileLevelZero)
  const tasksLoaded = useTasksStore((s) => s.loaded)
  const toast = useToast()

  // Boot — charge tous les stores au montage
  useEffect(() => {
    void loadSettings()
    void loadSchedule()
    void loadBlocking()
    void loadLevels()
    void loadDeclaredApps()
    void loadTasks()
  }, [loadSettings, loadSchedule, loadBlocking, loadLevels, loadDeclaredApps, loadTasks])

  // V2 P9 — Réconciliation niveau-0 au boot (une fois tasks chargées)
  useEffect(() => {
    if (!tasksLoaded) return
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const d = String(today.getDate()).padStart(2, '0')
    void reconcileLevelZero(`${y}-${m}-${d}`)
  }, [tasksLoaded, reconcileLevelZero])

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
    const offUpdateReady = nexus.app.onUpdateDownloaded((info) => {
      toast.info({
        title: 'Mise à jour prête',
        description: info.version
          ? `Nexus ${info.version} sera installé au prochain redémarrage.`
          : 'Elle sera installée au prochain redémarrage.',
      })
    })
    return () => {
      offFlush()
      offClock()
      offUpdateReady()
    }
  }, [toast])

  const showOnboarding = loaded && onboardingCompleted !== true

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
      <AnimatePresence>
        {showOnboarding && <OnboardingOverlay key="onboarding" />}
      </AnimatePresence>
      <FloatingCredit />
      <ToastViewport />
    </ErrorBoundary>
  )
}
