import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { Sidebar } from './Sidebar'

export function Layout() {
  const location = useLocation()

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <main className="relative flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <div key={location.pathname} className="h-full">
            <Outlet />
          </div>
        </AnimatePresence>
      </main>
    </div>
  )
}
