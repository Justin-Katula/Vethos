import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react'
import type { PreviewSafetyReport } from '@shared/execution-preview-model'
import { cn } from '@/lib/cn'

export function ExecutionPreviewSafetyBanner({ status, reasons, warnings = [] }: {
  status: PreviewSafetyReport['status']
  reasons: string[]
  warnings?: string[]
}) {
  const details = [...new Set([...reasons, ...warnings])]
  if (status === 'safe') return (
    <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
      <CheckCircle2 size={16} /><span>Les contrôles de sécurité autorisent l’affichage de cette preview en lecture seule.</span>
    </div>
  )
  const critical = status === 'unsafe' || status === 'critical'
  return (
    <div className={cn('flex flex-col gap-2 rounded-md border px-4 py-3 text-sm', critical ? 'border-red-500/40 bg-red-500/10 text-red-200' : 'border-yellow-500/40 bg-yellow-500/10 text-yellow-200')}>
      <div className="flex items-center gap-2 font-medium">{critical ? <ShieldAlert size={16} /> : <AlertTriangle size={16} />}<span>{critical ? 'Preview non sécurisée' : 'Avertissement de sécurité'}</span></div>
      {details.length > 0 && <ul className="ml-6 list-disc space-y-1 text-xs opacity-90">{details.map((detail) => <li key={detail}>{detail}</li>)}</ul>}
      {critical && <div className="mt-2 text-xs font-semibold uppercase tracking-wider">Cette preview ne doit pas être appliquée.</div>}
    </div>
  )
}
