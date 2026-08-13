import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { NexusLogo } from '@/components/NexusLogo'
import { nexus } from '@/lib/ipc'
import { useAuthStore } from '@/store/auth.store'

/**
 * LE QUAI
 *
 * La signalétique d'un quai : des noms alignés, un filet gravé, et un seul
 * repère rouge sur la destination courante. Pas de pastille arrondie derrière
 * l'élément actif, pas de halo : sur un panneau émaillé, ce qui est actif est
 * marqué, pas éclairé.
 *
 * Les deux piliers du produit, planifier et bloquer, sont d'importance égale.
 * Ils portent donc le même poids typographique et le même rang.
 */

const DESTINATIONS = [
  { to: '/', label: 'Aujourd’hui' },
  { to: '/temps', label: 'Mon temps' },
  { to: '/blocage', label: 'Blocage' },
  { to: '/settings', label: 'Réglages' },
]

export function Sidebar() {
  const { pathname } = useLocation()
  const [version, setVersion] = useState<string | null>(null)
  const account = useAuthStore((s) => s.account)
  const signOut = useAuthStore((s) => s.signOut)

  useEffect(() => {
    void nexus.app
      .getVersion()
      .then(setVersion)
      .catch(() => setVersion(null))
  }, [])

  return (
    <aside
      className="flex w-[224px] shrink-0 flex-col border-r border-rail bg-panel"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="border-b border-rail px-5 py-5">
        <NexusLogo size={22} />
        <p className="mt-1.5 text-[11px] text-ink-3">Focus, par design.</p>
      </div>

      <nav className="flex flex-col" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {DESTINATIONS.map(({ to, label }) => {
          const active = to === '/' ? pathname === '/' : pathname.startsWith(to)
          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={cn(
                'relative border-b border-rail px-5 py-3 text-sm transition-colors duration-150',
                active ? 'bg-panel-lit text-ink' : 'text-ink-2 hover:bg-panel-lit hover:text-ink',
              )}
            >
              {active && <span className="absolute inset-y-0 left-0 w-[3px] bg-signal" />}
              {label}
            </NavLink>
          )
        })}
      </nav>

      <div
        className="mt-auto border-t border-rail px-5 py-4"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {account && (
          <div className="min-w-0">
            <div className="truncate text-[13px] text-ink">{account.name}</div>
            <div className="truncate text-[11px] text-ink-3">{account.email}</div>
          </div>
        )}
        <div className="mt-3 flex items-baseline justify-between">
          <button
            type="button"
            onClick={() => void signOut()}
            className="text-[11px] text-ink-3 underline-offset-4 transition-colors hover:text-ink hover:underline"
          >
            Se déconnecter
          </button>
          <span className="font-mono text-[10.5px] text-ink-3">{version ? `v${version}` : ''}</span>
        </div>
      </div>
    </aside>
  )
}
