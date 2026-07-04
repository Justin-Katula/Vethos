import { motion } from 'framer-motion'
import { Play, Pencil, Globe, Cpu, Wifi } from 'lucide-react'
import type { BlockingProfile } from '@shared/schemas'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'

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
        'info-panel group rounded-lg p-5',
        'transition-colors duration-200',
        !disabled && 'hover:bg-bg-card-hover',
      )}
    >
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold tracking-tight text-text-primary">
              {profile.name}
            </h3>
            <div className="mt-1">
              <span className={cn(
                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider",
                profile.mode === 'allowlist' 
                  ? "bg-accent/15 text-accent border border-accent/20" 
                  : "bg-bg-base text-text-muted border border-border-subtle"
              )}>
                {profile.mode === 'allowlist' ? 'Focus strict' : 'Filtre actif'}
              </span>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onEdit(profile)}
            className="opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            aria-label="Modifier"
          >
            <Pencil size={14} strokeWidth={2} />
          </Button>
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

        <Button
          type="button"
          variant="solid"
          onClick={() => onStart(profile)}
          disabled={disabled}
          className="mt-5 w-full"
        >
          <Play size={14} strokeWidth={2.5} />
          Démarrer
        </Button>
      </div>
    </motion.div>
  )
}

function policyLabel(p: BlockingProfile['unlockPolicy']): string {
  switch (p.type) {
    case 'none':
      return 'Sans verrou'
    case 'deny_during_strict_session':
      return 'Aucun arrêt anticipé'
    case 'cooldown':
      return `Cooldown ${p.minutes} min`
    case 'justification':
      return `Justification ${p.minWords} mots`
    case 'cooldown_and_justification':
      return `Cooldown ${p.minutes} min + ${p.minWords} mots`
  }
}
