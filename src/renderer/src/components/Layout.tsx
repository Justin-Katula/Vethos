import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { Sidebar } from './Sidebar'

/**
 * La coque.
 *
 * `AnimatePresence` avec `mode="wait"` est ce qui rend le changement de page
 * perceptible : sans lui, la sortie de l'ancienne page n'est jamais jouée et
 * les écrans se remplacent d'un coup, ce qui donne exactement l'impression
 * d'une fenêtre Windows qui redessine son contenu.
 */
export function Layout() {
  const location = useLocation()

  return (
    <div className="flex h-[100dvh] w-screen overflow-hidden bg-bg">
      <Sidebar />
      <main className="relative min-w-0 flex-1 overflow-y-auto">
        <AnimatePresence mode="wait" initial={false}>
          <Outlet key={location.pathname} />
        </AnimatePresence>
      </main>
    </div>
  )
}
