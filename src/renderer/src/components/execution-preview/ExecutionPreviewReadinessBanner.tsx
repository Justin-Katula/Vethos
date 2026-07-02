import { Info, AlertCircle, FileSearch, ShieldX } from 'lucide-react'
import { cn } from '@/lib/cn'

export function ExecutionPreviewReadinessBanner({
  status,
}: {
  status: 'ready' | 'warning' | 'partial' | 'manual_review' | 'unsafe' | 'empty'
}) {
  if (status === 'empty') return null

  const configs = {
    ready: {
      icon: Info,
      color: 'border-accent/40 bg-accent/10 text-accent',
      title: 'Preview complète',
      description: 'Voici ce que Vethos propose. Application automatique désactivée pour la preview.',
    },
    warning: {
      icon: AlertCircle,
      color: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-200',
      title: 'Preview avec avertissements',
      description: 'Le plan est généré mais contient des avertissements qui méritent ton attention.',
    },
    partial: {
      icon: FileSearch,
      color: 'border-orange-500/40 bg-orange-500/10 text-orange-200',
      title: 'Preview partielle',
      description: 'Certaines données sont manquantes. Seule une partie du plan est affichable.',
    },
    manual_review: {
      icon: FileSearch,
      color: 'border-orange-500/40 bg-orange-500/10 text-orange-200',
      title: 'Examen manuel requis',
      description: 'Vethos refuse d’exécuter ce plan sans que tu ne l’aies examiné et validé manuellement (fonctionnalité désactivée ici).',
    },
    unsafe: {
      icon: ShieldX,
      color: 'border-red-500/40 bg-red-500/10 text-red-200',
      title: 'Preview non sécurisée',
      description: 'Ce plan viole les règles de sécurité. Il est affiché pour débogage uniquement.',
    },
  }

  const conf = configs[status]
  const Icon = conf.icon

  return (
    <div className={cn('flex items-start gap-3 rounded-md border px-4 py-3 text-sm', conf.color)}>
      <Icon size={18} className="mt-0.5 shrink-0" />
      <div>
        <div className="font-medium">{conf.title}</div>
        <div className="text-xs opacity-90">{conf.description}</div>
      </div>
    </div>
  )
}
