import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { Layout } from './components/Layout'
import { OnboardingOverlay } from './components/onboarding/OnboardingOverlay'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { ToastViewport } from './components/ui/Toast'
import { FloatingCredit } from './components/levels/FloatingCredit'
import { useSettingsStore } from './store/settings.store'
import { useScheduleStore } from './store/schedule.store'
import { useBlockingStore } from './store/blocking.store'
import { useLevelsStore } from './store/levels.store'
import { useDeclaredAppsStore } from './store/declared-apps.store'
import { useAppUsageStore } from './store/app-usage.store'
import HomePage from './pages/HomePage'
import ObjectivesPage from './pages/ObjectivesPage'
import PlanningPage from './pages/PlanningPage'
import BlockingPage from './pages/BlockingPage'
import SettingsPage from './pages/SettingsPage'

export default function App(): JSX.Element {
  const loaded = useSettingsStore((s) => s.loaded)
  const onboardingCompleted = useSettingsStore((s) => s.onboardingCompleted)
  const loadSettings = useSettingsStore((s) => s.load)

  const loadSchedule = useScheduleStore((s) => s.load)
  const scheduleLoaded = useScheduleStore((s) => s.loaded)
  const rules = useScheduleStore((s) => s.rules)

  const loadBlocking = useBlockingStore((s) => s.load)
  const blockingLoaded = useBlockingStore((s) => s.loaded)
  const blockingState = useBlockingStore((s) => s.state)

  const loadLevels = useLevelsStore((s) => s.load)
  const levelsLoaded = useLevelsStore((s) => s.loaded)
  const reconcileFully = useLevelsStore((s) => s.reconcileFully)

  const loadDeclaredApps = useDeclaredAppsStore((s) => s.load)
  const declaredAppsLoaded = useDeclaredAppsStore((s) => s.loaded)
  const declaredApps = useDeclaredAppsStore((s) => s.apps)

  const loadAppUsage = useAppUsageStore((s) => s.load)
  const appUsageLoaded = useAppUsageStore((s) => s.loaded)
  const subscribeAppUsage = useAppUsageStore((s) => s.subscribe)
  const usageEntries = useAppUsageStore((s) => s.entries)

  // Boot — charge tous les stores au montage
  useEffect(() => {
    void loadSettings()
    void loadSchedule()
    void loadBlocking()
    void loadLevels()
    void loadDeclaredApps()
    void loadAppUsage()
  }, [
    loadSettings,
    loadSchedule,
    loadBlocking,
    loadLevels,
    loadDeclaredApps,
    loadAppUsage,
  ])

  // Subscribe au tick app-usage en continu
  useEffect(() => {
    if (!appUsageLoaded) return
    return subscribeAppUsage()
  }, [appUsageLoaded, subscribeAppUsage])

  // Réconciliation globale dès que toutes les sources sont prêtes,
  // puis à chaque évolution de l'historique de blocage ou des entrées d'usage
  useEffect(() => {
    if (!levelsLoaded || !blockingLoaded || !scheduleLoaded || !declaredAppsLoaded) return
    void reconcileFully({
      history: blockingState.history,
      rules,
      apps: declaredApps,
      usageEntries,
    })
  }, [
    levelsLoaded,
    blockingLoaded,
    scheduleLoaded,
    declaredAppsLoaded,
    blockingState.history,
    rules,
    declaredApps,
    usageEntries,
    reconcileFully,
  ])

  const showOnboarding = loaded && onboardingCompleted !== true

  return (
    <ErrorBoundary>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="/objectives" element={<ObjectivesPage />} />
          <Route path="/planning" element={<PlanningPage />} />
          <Route path="/blocking" element={<BlockingPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
      <AnimatePresence>
        {showOnboarding && <OnboardingOverlay key="onboarding" />}
      </AnimatePresence>
      <ToastViewport />
      <FloatingCredit />
    </ErrorBoundary>
  )
}
