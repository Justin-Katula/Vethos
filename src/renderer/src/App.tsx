import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import HomePage from './pages/HomePage'
import ObjectivesPage from './pages/ObjectivesPage'
import PlanningPage from './pages/PlanningPage'
import BlockingPage from './pages/BlockingPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="/objectives" element={<ObjectivesPage />} />
        <Route path="/planning" element={<PlanningPage />} />
        <Route path="/blocking" element={<BlockingPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}
