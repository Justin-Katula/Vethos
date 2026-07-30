import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { Layout } from './components/Layout'
import { OnboardingOverlay } from './components/onboarding/OnboardingOverlay'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { ToastViewport } from './components/ui/Toast'
import { NexusLogo } from './components/NexusLogo'
import { useAuthStore } from './store/auth.store'
import { useSettingsStore } from './store/settings.store'
import { flushSettingsPersist } from './store/settings.store'
import { flushSchedulePersist, useScheduleStore } from './store/schedule.store'
import { useDeclaredAppsStore } from './store/declared-apps.store'
import { useTasksStore } from './store/tasks.store'
import { useAncresStore } from './store/ancres.store'
import { useLearningStore } from './store/learning.store'
import { nexus } from './lib/ipc'
import { useToast } from './lib/use-toast'
import HomePage from './pages/HomePage'
import ObjectivesPage from './pages/ObjectivesPage'
import PlanningPage from './pages/PlanningPage'
import SettingsPage from './pages/SettingsPage'
import TasksPage from './pages/TasksPage'
import BlockingPage from './pages/BlockingPage'
import BlockOverlay from './pages/BlockOverlay'
import AuthPage from './pages/AuthPage'

export default function App(): JSX.Element {
  const authLoaded = useAuthStore((s) => s.loaded)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const loadAuth = useAuthStore((s) => s.load)
  const loaded = useSettingsStore((s) => s.loaded)
  const onboardingCompleted = useSettingsStore((s) => s.onboardingCompleted)
  const loadSettings = useSettingsStore((s) => s.load)

  const loadSchedule = useScheduleStore((s) => s.load)
  const loadDeclaredApps = useDeclaredAppsStore((s) => s.load)
  const loadTasks = useTasksStore((s) => s.load)
  const loadAncres = useAncresStore((s) => s.load)
  const loadLearning = useLearningStore((s) => s.load)
  const toast = useToast()

  // Boot — charge tous les stores au montage
  useEffect(() => {
    void loadAuth()
    void loadSettings()
    void loadSchedule()
    void loadDeclaredApps()
    void loadTasks()
    void loadAncres()
    void loadLearning()
  }, [loadAuth, loadSettings, loadSchedule, loadDeclaredApps, loadTasks, loadAncres, loadLearning])

  useEffect(() => {
    const offFlush = nexus.app.onFlushDebounces(() => {
      void Promise.all([flushSchedulePersist(), flushSettingsPersist()])
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
          <Route path="/blocage" element={<BlockingPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        {/* Hors Layout : l'overlay est une fenetre nue, sans barre laterale. */}
        <Route path="/block-overlay" element={<BlockOverlay />} />
      </Routes>
      <AnimatePresence>{showOnboarding && <OnboardingOverlay key="onboarding" />}</AnimatePresence>
      <ToastViewport />
    </ErrorBoundary>
  )
}
