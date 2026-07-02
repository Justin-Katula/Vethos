import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Show, UserButton, useUser } from '@clerk/react'
import { motion } from 'framer-motion'
import { Home, Calendar, Shield, Settings, LayoutGrid, BarChart3, ListTodo, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import { VethosLogo } from '@/components/VethosLogo'
import { vethos } from '@/lib/ipc'

import { useRegistryStore } from '@/store/registry.store'

type NavItem = {
  to: string
  label: string
  Icon: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Accueil', Icon: Home },
  { to: '/todo', label: 'À faire', Icon: ListTodo },
  { to: '/planning', label: 'Mon planning', Icon: Calendar },
  { to: '/blocking', label: 'Coach', Icon: Shield },
  { to: '/apps', label: 'Apps', Icon: LayoutGrid },
  { to: '/statistics', label: 'Statistiques', Icon: BarChart3 },
  { to: '/settings', label: 'Paramètres', Icon: Settings },
]

export function Sidebar() {
  const { pathname } = useLocation()
  const [version, setVersion] = useState<string | null>(null)
  const { user } = useUser()
  const displayName =
    user?.fullName ?? user?.username ?? user?.primaryEmailAddress?.emailAddress ?? 'Compte Vethos'
  const email = user?.primaryEmailAddress?.emailAddress ?? ''

  const unclassifiedCount = useRegistryStore((s) => s.items.filter((i) => !i.classified).length)

  useEffect(() => {
    void vethos.app.getVersion().then(setVersion).catch(() => setVersion(null))
  }, [])

  return (
    <aside
      className={cn(
        'flex w-[220px] shrink-0 flex-col gap-1 px-3 py-6',
        'border-r border-border-subtle',
        'bg-bg-base',
      )}
      style={
        {
          WebkitAppRegion: 'drag',
          boxShadow: '1px 0 10px rgba(216, 216, 216, 0.08)',
        } as React.CSSProperties
      }
    >
      <div className="px-3 pb-6">
        <VethosLogo size={42} />
        <p className="mt-1 text-xs text-text-muted">Focus, par design.</p>
      </div>

      <nav
        className="flex flex-col gap-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {NAV_ITEMS.map(({ to, label, Icon }) => {
          const isActive = to === '/' ? pathname === '/' : pathname.startsWith(to)
          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={cn(
                'group relative flex items-center gap-3 rounded-md px-3 py-2.5',
                'text-sm font-medium transition-all duration-200 ease-out hover:shadow-[0_0_8px_rgba(216,216,216,0.16)]',
                isActive ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary',
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 z-20 h-[60%] w-[3px] -translate-y-1/2 rounded-r-[2px] bg-accent" />
              )}
              {isActive && (
                <motion.div
                  layoutId="sidebar-active-pill"
                  className="absolute inset-0 rounded-md bg-bg-card"
                  style={{ boxShadow: 'var(--shadow-card)' }}
                  transition={{ type: 'tween', duration: 0.25 }}
                />
              )}
              <span className="relative z-10 flex w-full items-center justify-between">
                <span className="flex items-center gap-3">
                  <Icon size={18} strokeWidth={1.75} />
                  {label}
                </span>
                {label === 'Apps' && unclassifiedCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-yellow px-1.5 text-[10px] font-bold text-black shadow-sm">
                    {unclassifiedCount}
                  </span>
                )}
              </span>
            </NavLink>
          )
        })}
      </nav>

      <div
        className="mt-auto space-y-3 px-3"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <Show when="signed-in">
          <div className="flex min-w-0 items-center gap-3 rounded-md border border-border-subtle bg-bg-card px-3 py-2">
            <UserButton />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-text-primary">{displayName}</div>
              {email && <div className="truncate text-xs text-text-muted">{email}</div>}
            </div>
          </div>
        </Show>
        <div className="text-xs text-text-muted">{version ? `v${version}` : 'Vethos'}</div>
      </div>
    </aside>
  )
}
