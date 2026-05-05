import { NavLink, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Home, Target, Calendar, Shield, Settings, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import { NexusLogo } from '@/components/NexusLogo'

type NavItem = {
  to: string
  label: string
  Icon: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Accueil', Icon: Home },
  { to: '/objectives', label: 'Mes objectifs', Icon: Target },
  { to: '/planning', label: 'Mon planning', Icon: Calendar },
  { to: '/blocking', label: 'Blocage', Icon: Shield },
  { to: '/settings', label: 'Paramètres', Icon: Settings },
]

export function Sidebar() {
  const { pathname } = useLocation()

  return (
    <aside
      className={cn(
        'flex w-60 shrink-0 flex-col gap-1 px-3 py-6',
        'border-r border-border-subtle',
        'bg-bg-elevated/60 backdrop-blur-2xl',
      )}
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="px-3 pb-6">
        <NexusLogo size={26} />
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
                'text-sm font-medium transition-colors duration-200 ease-out',
                isActive ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary',
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active-pill"
                  className="absolute inset-0 rounded-md bg-bg-card"
                  style={{ boxShadow: 'var(--shadow-card)' }}
                  transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-3">
                <Icon size={18} strokeWidth={1.75} />
                {label}
              </span>
            </NavLink>
          )
        })}
      </nav>

      <div className="mt-auto px-3 text-xs text-text-muted">v0.1.0</div>
    </aside>
  )
}
