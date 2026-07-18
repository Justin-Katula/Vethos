import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { Sidebar } from './Sidebar'
import { FallingPattern } from './ui/FallingPattern'

export function Layout() {
  const location = useLocation()

  return (
    <div className="relative flex h-screen w-screen overflow-hidden">
      {/* Fond animé ambient (pluie de gouttes accent) — derrière tout le contenu. */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <FallingPattern />
      </div>
      {/* Contenu au-dessus du fond. */}
      <div className="relative z-10 flex h-full w-full">
        <Sidebar />
        <main className="relative flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <div key={location.pathname} className="h-full">
              <Outlet />
            </div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}
