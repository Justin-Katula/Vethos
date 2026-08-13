import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'

/**
 * LE HALL
 *
 * Deux plans, rien de plus : le quai à gauche, le tableau à droite. Le fond
 * est une surface d'émail, pas un décor. L'ancienne pluie animée venait d'un
 * autre monde et passait devant le contenu ; un hall de gare n'a pas de pluie
 * à l'intérieur.
 */
export function Layout() {
  const location = useLocation()

  return (
    <div className="flex h-[100dvh] w-screen overflow-hidden bg-hall">
      <Sidebar />
      <main key={location.pathname} className="relative min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
