import { motion } from 'framer-motion'
import { Play, Pencil, Globe, Cpu, Wifi } from 'lucide-react'
import type { BlockingProfile } from '@shared/schemas'
import { cn } from '@/lib/cn'

type Props = {
  profile: BlockingProfile
  disabled: boolean
  onStart: (profile: BlockingProfile) => void
  onEdit: (profile: BlockingProfile) => void
}

export function ProfileCard({ profile, disabled, onStart, onEdit }: Props) {
  const sites = profile.blockedSites.length
  const procs = profile.blockedProcesses.length
  const apps = profile.blockedNetworkApps.length

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'group relative overflow-hidden rounded-lg border border-border-subtle bg-bg-card p-5',
        'shadow-card transition-colors duration-200',
        !disabled && 'hover:bg-bg-card-hover',
      )}
    >
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <h3 className="truncate text-base font-semibold tracking-tight text-text-primary">
            {profile.name}
          </h3>
          <button
            type="button"
            onClick={() => onEdit(profile)}
            className="rounded-md p-1.5 text-text-muted opacity-0 transition-opacity duration-200 group-hover:opacity-100 hover:bg-bg-base hover:text-text-primary"
            aria-label="Modifier"
          >
            <Pencil size={14} strokeWidth={2} />
          </button>
        </div>

        <div className="mt-3 flex items-center gap-4 text-xs text-text-muted">
          <span className="flex items-center gap-1.5">
            <Globe size={12} strokeWidth={2} /> {sites}
          </span>
          <span className="flex items-center gap-1.5">
            <Cpu size={12} strokeWidth={2} /> {procs}
          </span>
          <span className="flex items-center gap-1.5">
            <Wifi size={12} strokeWidth={2} /> {apps}
          </span>
        </div>

        <div className="mt-5 text-xs text-text-muted">
          {policyLabel(profile.unlockPolicy)}
        </div>

        <button
          type="button"
          onClick={() => onStart(profile)}
          disabled={disabled}
          className={cn(
            'mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md px-3 py-2',
            'text-sm font-medium transition-all duration-200 ease-out',
            disabled
              ? 'cursor-not-allowed bg-bg-card-hover text-text-muted'
              : 'bg-accent text-white hover:bg-accent-hover',
          )}
        >
          <Play size={14} strokeWidth={2.5} />
          Démarrer
        </button>
      </div>
    </motion.div>
  )
}

function policyLabel(p: BlockingProfile['unlockPolicy']): string {
  switch (p.type) {
    case 'none':
      return 'Sans verrou'
    case 'cooldown':
      return `Cooldown ${p.minutes} min`
    case 'justification':
      return `Justification ${p.minWords} mots`
    case 'cooldown_and_justification':
      return `Cooldown ${p.minutes} min + ${p.minWords} mots`
  }
}
