import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CalendarDays, Home, Shield, Sliders, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/cn'
import { NexusLogo } from '@/components/NexusLogo'
import { nexus } from '@/lib/ipc'
import { useAuthStore } from '@/store/auth.store'

/**
 * La navigation.
 *
 * L'indicateur de page active est une pastille unique qui GLISSE d'un élément
 * à l'autre, portée par `layoutId`. Deux raisons, et la seconde compte plus
 * que la première : on voit où on est, et on voit d'où on vient. Un fond qui
 * s'allume au bon endroit dit la première chose ; seul un objet qui se déplace
 * dit la seconde.
 */

const DESTINATIONS = [
  { to: '/', label: 'Aujourd’hui', Icon: Home },
  { to: '/temps', label: 'Mon temps', Icon: CalendarDays },
  { to: '/engagements', label: 'Mes engagements', Icon: SlidersHorizontal },
  { to: '/blocage', label: 'Blocage', Icon: Shield },
  { to: '/settings', label: 'Réglages', Icon: Sliders },
]

export function Sidebar() {
  const { pathname } = useLocation()
  const [version, setVersion] = useState<string | null>(null)
  const account = useAuthStore((s) => s.account)
  const signOut = useAuthStore((s) => s.signOut)

  useEffect(() => {
    void nexus.app.getVersion().then(setVersion).catch(() => setVersion(null))
  }, [])

  return (
    <aside
      className="flex w-[236px] shrink-0 flex-col bg-bg px-3 py-5"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="mb-7 px-3">
        <NexusLogo size={22} />
        <p className="mt-1.5 text-[11px] text-text-3">Focus, par design.</p>
      </div>

      <nav
        className="flex flex-col gap-0.5"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {DESTINATIONS.map(({ to, label, Icon }) => {
          const active = to === '/' ? pathname === '/' : pathname.startsWith(to)
          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={cn(
                'group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-[13.5px]',
                'transition-colors duration-150',
                active ? 'text-text' : 'text-text-2 hover:text-text',
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-md bg-surface-2 shadow-lift"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
              <Icon
                size={16}
                strokeWidth={1.9}
                className={cn(
                  'relative z-10 shrink-0 transition-colors duration-150',
                  active ? 'text-text' : 'text-text-3 group-hover:text-text-2',
                )}
              />
              <span className="relative z-10">{label}</span>
            </NavLink>
          )
        })}
      </nav>

      <div
        className="mt-auto px-3"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {account && (
          <div className="min-w-0">
            <div className="truncate text-[13px] text-text">{account.name}</div>
            <div className="truncate text-[11px] text-text-3">{account.email}</div>
          </div>
        )}
        <div className="mt-3 flex items-baseline justify-between">
          <button
            type="button"
            onClick={() => void signOut()}
            className="text-[11px] text-text-3 underline-offset-4 transition-colors hover:text-text-2 hover:underline"
          >
            Se déconnecter
          </button>
          <span className="font-mono text-[10.5px] text-text-3">{version ? `v${version}` : ''}</span>
        </div>
      </div>
    </aside>
  )
}
