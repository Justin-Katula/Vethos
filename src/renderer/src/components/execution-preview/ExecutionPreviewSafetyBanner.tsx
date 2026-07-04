import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/cn'

export function ExecutionPreviewSafetyBanner({
  status,
  reasons,
}: {
  status: 'safe' | 'warning' | 'unsafe' | 'critical'
  reasons: string[]
}) {
  if (status === 'safe') {
    return (
      <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
        <CheckCircle2 size={16} />
        <span>Ce plan est sûr et respecte toutes les règles de sécurité métier.</span>
      </div>
    )
  }

  const isCritical = status === 'unsafe' || status === 'critical'
  
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-md border px-4 py-3 text-sm',
        isCritical
          ? 'border-red-500/40 bg-red-500/10 text-red-200'
          : 'border-yellow-500/40 bg-yellow-500/10 text-yellow-200'
      )}
    >
      <div className="flex items-center gap-2 font-medium">
        {isCritical ? <ShieldAlert size={16} /> : <AlertTriangle size={16} />}
        <span>{isCritical ? 'Preview non sécurisée (Rejetée)' : 'Avertissement de sécurité'}</span>
      </div>
      {reasons.length > 0 && (
        <ul className="ml-6 list-disc text-xs opacity-90 space-y-1">
          {reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
      {isCritical && (
        <div className="mt-2 text-xs font-semibold uppercase tracking-wider opacity-100">
          Ce plan ne doit en aucun cas être appliqué.
        </div>
      )}
    </div>
  )
}
