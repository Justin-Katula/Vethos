import { Check, X } from 'lucide-react'
import type { BlockingProfile, BlockingState } from '@shared/schemas'
import { cn } from '@/lib/cn'

type Props = {
  items: BlockingState['history']
  profiles: BlockingProfile[]
}

export function HistoryList({ items, profiles }: Props) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border-subtle p-8 text-center text-sm text-text-muted">
        {"Aucune session pour l'instant. Démarre ta première session ci-dessus."}
      </div>
    )
  }

  const completed = items.filter((i) => i.completedNormally).length
  const profileById = new Map(profiles.map((p) => [p.id, p]))

  return (
    <div>
      <div className="mb-3 text-xs text-text-muted">
        Complétées : <span className="font-mono text-text-secondary">{completed}</span> /{' '}
        <span className="font-mono text-text-secondary">{items.length}</span>
      </div>
      <ul className="divide-y divide-border-subtle overflow-hidden rounded-lg border border-border-subtle bg-bg-card">
        {items.map((it) => {
          const profile = profileById.get(it.profileId)
          const durationMs = Date.parse(it.endedAt) - Date.parse(it.startedAt)
          return (
            <li
              key={it.sessionId}
              className="flex items-center gap-3 px-4 py-3 transition-colors duration-200 hover:bg-bg-card-hover"
            >
              <div
                className={cn(
                  'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full',
                  it.completedNormally
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'bg-amber-500/15 text-amber-400',
                )}
              >
                {it.completedNormally ? (
                  <Check size={12} strokeWidth={3} />
                ) : (
                  <X size={12} strokeWidth={3} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-text-primary">
                  {profile?.name ?? 'Profile supprimé'}
                </div>
                <div className="text-xs text-text-muted">
                  {formatDuration(durationMs)} · {formatRelative(it.endedAt)}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function formatDuration(ms: number): string {
  const totalMin = Math.max(1, Math.round(ms / 60_000))
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h}h`
  return `${h}h${String(m).padStart(2, '0')}`
}

function formatRelative(iso: string): string {
  const diff = Date.now() - Date.parse(iso)
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return "à l'instant"
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `il y a ${days}j`
  return new Date(iso).toLocaleDateString('fr-FR')
}
