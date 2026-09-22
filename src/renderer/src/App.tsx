import { useEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { Layout } from './components/Layout'
import { OnboardingOverlay } from './components/onboarding/OnboardingOverlay'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { ToastViewport } from './components/ui/Toast'
import { NexusLogo } from './components/NexusLogo'
import { useAuthStore } from './store/auth.store'
import { useSettingsStore } from './store/settings.store'
import { flushSettingsPersist } from './store/settings.store'
import { usePlanningStore } from './store/planning.store'
import { nexus } from './lib/ipc'
import { useToast } from './lib/use-toast'
import { useTheme } from './lib/use-theme'
import SettingsPage from './pages/SettingsPage'
import AuthPage from './pages/AuthPage'
import BlockingPage from './pages/BlockingPage'
import BlockOverlay from './pages/BlockOverlay'
import SessionStartOverlay from './pages/SessionStartOverlay'
import HomePage from './pages/HomePage'
import CommitmentsPage from './pages/CommitmentsPage'
import TimePage from './pages/TimePage'

export default function App(): JSX.Element {
  const location = useLocation()
  const authLoaded = useAuthStore((s) => s.loaded)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const loadAuth = useAuthStore((s) => s.load)
  const loaded = useSettingsStore((s) => s.loaded)
  const onboardingCompleted = useSettingsStore((s) => s.onboardingCompleted)
  const loadSettings = useSettingsStore((s) => s.load)
  const loadPlanning = usePlanningStore((s) => s.load)
  const toast = useToast()
  const themeMode = useSettingsStore((s) => s.theme)
  const themeLightAt = useSettingsStore((s) => s.themeLightAt)
  const themeDarkAt = useSettingsStore((s) => s.themeDarkAt)

  // Le thème est appliqué ici, au-dessus de tout le reste — y compris des
  // fenêtres d'overlay et de l'écran d'authentification. Un réglage qui ne
  // vaudrait qu'une fois connecté laisserait la porte d'entrée en clair.
  useTheme({ mode: themeMode, lightAt: themeLightAt, darkAt: themeDarkAt, loaded })

  const isOverlayRoute =
    location.pathname === '/block-overlay' ||
    location.pathname === '/session-start' ||
    location.pathname === 'block-overlay' ||
    location.pathname === 'session-start'

  useEffect(() => {
    void loadAuth()
    void loadSettings()
    void loadPlanning()
  }, [loadAuth, loadSettings, loadPlanning])

  useEffect(() => {
    const offFlush = nexus.app.onFlushDebounces(() => {
      void flushSettingsPersist()
    })
    const offUpdateReady = nexus.app.onUpdateDownloaded((info) => {
      toast.info({
        title: 'Update ready',
        description: info.version
          ? `Vethos ${info.version} will install on the next restart.`
          : 'It will install on the next restart.',
      })
    })
    // D.7/D.8 : l'horloge de planification (processus main) écrit du retard,
    // des ratés, des confirmations — indépendamment de cette fenêtre. Sans
    // cette écoute, une fenêtre déjà ouverte affiche un plan périmé jusqu'à
    // ce qu'elle soit fermée et rouverte.
    const offPlanningChanged = nexus.planning.onChanged(() => {
      void loadPlanning()
    })
    return () => {
      offFlush()
      offUpdateReady()
      offPlanningChanged()
    }
  }, [toast, loadPlanning])

  // Les fenêtres d'overlay sont autonomes : elles ne passent pas par l'auth ni l'onboarding.
  if (isOverlayRoute) {
    return (
      <ErrorBoundary>
        <Routes>
          <Route path="/block-overlay" element={<BlockOverlay />} />
          <Route path="/session-start" element={<SessionStartOverlay />} />
        </Routes>
      </ErrorBoundary>
    )
  }

  const showOnboarding = loaded && onboardingCompleted !== true

  return (
    <ErrorBoundary>
      {!authLoaded ? (
        <div className="relative z-10 flex h-[100dvh] w-screen items-center justify-center text-fg">
          <div className="flex flex-col items-center gap-4">
            <NexusLogo size={32} />
            <div className="h-[2px] w-28 overflow-hidden bg-line">
              <div className="h-full w-1/2 animate-pulse bg-accent" />
            </div>
          </div>
        </div>
      ) : !isAuthenticated ? (
        <AuthPage />
      ) : (
        <>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="/engagements" element={<CommitmentsPage />} />
              <Route path="/temps" element={<TimePage />} />
              <Route path="/blocage" element={<BlockingPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
            {/* Hors Layout : l'overlay est une fenetre nue, sans barre laterale. */}
            <Route path="/block-overlay" element={<BlockOverlay />} />
            <Route path="/session-start" element={<SessionStartOverlay />} />
          </Routes>
          <AnimatePresence>
            {showOnboarding && <OnboardingOverlay key="onboarding" />}
          </AnimatePresence>
        </>
      )}
      <ToastViewport />
    </ErrorBoundary>
  )
}
