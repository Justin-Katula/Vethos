import { AlertCircle, FileSearch, Info, ShieldX } from 'lucide-react'
import type { PreviewReadinessGateResult } from '@shared/execution-preview-model'
import { cn } from '@/lib/cn'

export function ExecutionPreviewReadinessBanner({ status, blockers = [], warnings = [] }: {
  status: PreviewReadinessGateResult['readiness']
  blockers?: string[]
  warnings?: string[]
}) {
  const configs: Record<PreviewReadinessGateResult['readiness'], { icon: typeof Info; color: string; title: string; description: string }> = {
    ready_for_debug_preview: { icon: Info, color: 'border-accent/40 bg-accent/10 text-accent', title: 'Prête pour la preview de debug', description: 'Les données peuvent être affichées pour inspection. Rien ne sera appliqué.' },
    ready_for_ui_preview: { icon: Info, color: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200', title: 'Prête pour la preview UI', description: 'Le plan proposé peut être affiché. Cette interface reste en lecture seule.' },
    partial_preview_only: { icon: FileSearch, color: 'border-orange-500/40 bg-orange-500/10 text-orange-200', title: 'Preview partielle seulement', description: 'Certaines données manquent ; seules les parties disponibles sont affichées.' },
    manual_review_required: { icon: FileSearch, color: 'border-orange-500/40 bg-orange-500/10 text-orange-200', title: 'Examen manuel requis', description: 'Le plan peut être consulté, mais aucune action ne peut partir de cet écran.' },
    blocked: { icon: AlertCircle, color: 'border-red-500/40 bg-red-500/10 text-red-200', title: 'Preview bloquée', description: 'Les dépendances requises ne permettent pas de produire une preview applicable.' },
    unsafe: { icon: ShieldX, color: 'border-red-500/40 bg-red-500/10 text-red-200', title: 'Preview non sécurisée', description: 'Le plan est visible pour diagnostic uniquement et ne doit pas être appliqué.' },
  }
  const config = configs[status]
  const Icon = config.icon
  const details = [...new Set([...blockers, ...warnings])]
  return (
    <div className={cn('flex items-start gap-3 rounded-md border px-4 py-3 text-sm', config.color)}>
      <Icon size={18} className="mt-0.5 shrink-0" />
      <div>
        <div className="font-medium">{config.title}</div>
        <div className="text-xs opacity-90">{config.description}</div>
        {details.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-4 text-xs opacity-90">{details.map((detail) => <li key={detail}>{detail}</li>)}</ul>}
      </div>
    </div>
  )
}
