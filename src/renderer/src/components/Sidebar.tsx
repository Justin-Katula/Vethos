import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { CalendarDays, Home, Shield, Sliders, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/cn'
import { NexusLogo } from '@/components/NexusLogo'
import { nexus } from '@/lib/ipc'
import { useAuthStore } from '@/store/auth.store'

/** Navigation principale : un rail stable, pas un panneau décoratif. */

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
    void nexus.app
      .getVersion()
      .then(setVersion)
      .catch(() => setVersion(null))
  }, [])

  return (
    <aside
      className="flex w-[244px] shrink-0 flex-col p-3"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="glass flex flex-1 flex-col px-3 py-4">
        <div className="mb-7 border-b border-line px-2 pb-4">
          <NexusLogo size={24} />
          <p className="mt-2 text-[11px] text-fg-3">Focus, par design.</p>
        </div>

        <nav
          className="flex flex-col gap-1"
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
                  'group relative flex h-10 items-center gap-3 rounded px-3 text-[13.5px]',
                  'transition-colors duration-150',
                  active
                    ? 'bg-surface-2 text-fg shadow-[inset_3px_0_0_var(--accent)]'
                    : 'text-fg-2 hover:bg-surface-2/70 hover:text-fg',
                )}
              >
                <Icon
                  size={16}
                  strokeWidth={1.9}
                  className={cn(
                    'shrink-0 transition-colors duration-150',
                    active ? 'text-accent' : 'text-fg-3 group-hover:text-fg-2',
                  )}
                />
                <span>{label}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className="mt-auto px-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {account && (
            <div className="min-w-0 border-t border-line pt-4">
              <div className="truncate text-[13px] text-fg">{account.name}</div>
              <div className="truncate text-[11px] text-fg-3">{account.email}</div>
            </div>
          )}
          <div className="mt-3 flex items-baseline justify-between">
            <button
              type="button"
              onClick={() => void signOut()}
              className="text-[11px] text-fg-3 underline-offset-4 transition-colors hover:text-fg-2 hover:underline"
            >
              Se déconnecter
            </button>
            <span className="font-mono text-[10.5px] text-fg-3">
              {version ? `v${version}` : ''}
            </span>
          </div>
        </div>
      </div>
    </aside>
  )
}
