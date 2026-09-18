import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { Sidebar } from './Sidebar'

/** La coque de l'application : rail fixe a gauche, contenu scrollable a droite. */
export function Layout() {
  const location = useLocation()

  return (
    <div className="relative z-10 flex h-[100dvh] w-screen overflow-hidden">
      <Sidebar />
      <main className="relative min-w-0 flex-1 overflow-y-auto">
        <AnimatePresence mode="wait" initial={false}>
          <Outlet key={location.pathname} />
        </AnimatePresence>
      </main>
    </div>
  )
}
