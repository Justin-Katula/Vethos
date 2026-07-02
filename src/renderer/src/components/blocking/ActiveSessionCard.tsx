import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Shield, Globe, Cpu, Wifi } from 'lucide-react'
import type { ActiveSession } from '@shared/schemas'
import type { LayerStatus } from '../../../../preload/index'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'

type Props = {
  session: ActiveSession
  layerStatus: LayerStatus
  onRequestStop: () => void
}

export function ActiveSessionCard({ session, layerStatus, onRequestStop }: Props) {
  const [now, setNow] = useState(() => Date.now())
  const [showWhy, setShowWhy] = useState(false)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const remaining = Math.max(0, Date.parse(session.endsAt) - now)
  const total = Date.parse(session.endsAt) - Date.parse(session.startedAt)
  const elapsed = Math.max(0, Math.min(1, (total - remaining) / total))

  return (
    <motion.section
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="info-panel rounded-xl border-accent/30 p-6"
    >
      <div className="relative">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-accent">
              <Shield size={14} strokeWidth={2.5} />
              Session active
              <span className={cn(
                "inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider ml-1.5",
                session.profileSnapshot.mode === 'allowlist' 
                  ? "bg-accent/15 text-accent border border-accent/20" 
                  : "bg-bg-base text-text-muted border border-border-subtle"
              )}>
                {session.profileSnapshot.mode === 'allowlist' ? 'Focus strict' : 'Filtre actif'}
              </span>
            </div>
            <h2 className="mt-2 truncate text-2xl font-semibold tracking-tight text-text-primary">
              {session.profileSnapshot.name}
            </h2>
            <div className="mt-2 flex items-center gap-4 text-sm text-text-secondary">
              <span className="flex items-center gap-1.5">
                <Globe size={13} /> {session.profileSnapshot.blockedSites.length}{' '}
                {session.profileSnapshot.mode === 'allowlist' ? 'autorisés' : 'sites'}
              </span>
              <span className="flex items-center gap-1.5">
                <Cpu size={13} /> {session.profileSnapshot.blockedProcesses.length}{' '}
                {session.profileSnapshot.mode === 'allowlist' ? 'autorisées' : 'apps'}
              </span>
              <span className="flex items-center gap-1.5">
                <Wifi size={13} /> {session.profileSnapshot.blockedNetworkApps.length}{' '}
                {session.profileSnapshot.mode === 'allowlist' ? 'réseau' : 'net'}
              </span>
            </div>
          </div>

          <div className="text-right">
            <div className="font-mono text-4xl font-light tabular-nums text-text-primary">
              {formatRemaining(remaining)}
            </div>
            <div className="mt-1 text-xs text-text-muted">restant</div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-5 h-1 overflow-hidden rounded-2xl bg-bg-base">
          <motion.div
            className="h-full bg-accent"
            initial={{ width: 0 }}
            animate={{ width: `${elapsed * 100}%` }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          />
        </div>

        {/* Layer status */}
        <div className="mt-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LayerDot
              label="hosts"
              status={layerStatus.hosts}
            />
            <LayerDot
              label="processes"
              status={layerStatus.processes}
            />
            <LayerDot
              label="firewall"
              status={layerStatus.firewall}
            />
          </div>

          <Button
            type="button"
            onClick={onRequestStop}
            disabled={session.unlockState.phase !== 'locked'}
          >
            Demander à arrêter
          </Button>
        </div>
        <button type="button" className="mt-4 text-xs font-medium text-accent hover:underline" onClick={() => setShowWhy((value) => !value)}>
          Pourquoi cette protection ?
        </button>
        {showWhy && (
          <div className="mt-3 rounded-lg border border-border-subtle bg-bg-base/50 p-3 text-xs leading-relaxed text-text-secondary">
            <p>{session.profileSnapshot.mode === 'allowlist' ? 'Cette session préserve uniquement les outils déclarés utiles pour éviter les détours.' : 'Cette session bloque seulement les distractions connues pour préserver ton travail.'}</p>
            {session.protectionResult?.applied
              ? <p className="mt-1">La protection a bien été appliquée par les couches nécessaires.</p>
              : session.protectionResult?.warnings.map((warning) => <p key={warning} className="mt-1">{warning}</p>)}
          </div>
        )}
      </div>
    </motion.section>
  )
}

function LayerDot({
  label,
  status,
}: {
  label: string
  status: 'ok' | 'drifted' | 'error' | 'inactive'
}) {
  const color =
    status === 'ok'
      ? 'bg-emerald-400'
      : status === 'drifted'
        ? 'bg-amber-400'
        : status === 'error'
          ? 'bg-red-400'
          : 'bg-zinc-600'
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2 w-2">
        <div className={cn('absolute inset-0 rounded-2xl', color)} />
      </div>
      <span className="text-xs text-text-muted">{label}</span>
    </div>
  )
}

function formatRemaining(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
