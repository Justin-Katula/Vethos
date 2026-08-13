import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { Sidebar } from './Sidebar'
import { FallingPattern } from './ui/FallingPattern'

export function Layout() {
  const location = useLocation()

  return (
    <div className="relative flex h-[100dvh] w-screen overflow-hidden bg-bg-base">
      {/* Fond animé ambient. Le masque radial l'efface au centre : le motif
          vit sur les bords, le contenu reste parfaitement lisible. */}
      <FallingPattern
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
        color="rgba(216, 216, 216, 0.38)"
        backgroundColor="var(--bg-base)"
        blurIntensity="0.6em"
        density={1}
        style={{
          maskImage: 'radial-gradient(ellipse at center, transparent 0%, black 72%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, transparent 0%, black 72%)',
        }}
      />
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
