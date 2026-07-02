import { useState } from 'react'
import { HelpCircle, ShieldAlert } from 'lucide-react'
import { useRegistryStore } from '@/store/registry.store'
import { ClassificationDialog } from './ClassificationDialog'
import type { RegistryItem } from '@shared/schemas'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'

const CATEGORY_STYLES: Record<string, string> = {
  'Social': 'bg-purple-500/10 border-purple-500/20 text-purple-400',
  'Games': 'bg-red-500/10 border-red-500/20 text-red-400',
  'Entertainment': 'bg-pink-500/10 border-pink-500/20 text-pink-400',
  'Creativity': 'bg-blue-500/10 border-blue-500/20 text-blue-400',
  'Education': 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  'Health & Fitness': 'bg-teal-500/10 border-teal-500/20 text-teal-400',
  'Information & Reading': 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400',
  'Productivity & Finance': 'bg-amber-500/10 border-amber-500/20 text-amber-400',
  'Shopping & Food': 'bg-orange-500/10 border-orange-500/20 text-orange-400',
  'Travel': 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400',
  'Utilities': 'bg-white/10 border-white/20 text-text-secondary',
  'Other': 'bg-white/5 border-white/10 text-text-muted'
}

export function UnclassifiedList() {
  const items = useRegistryStore((s) => s.items).filter((i) => !i.classified)
  const [selectedItem, setSelectedItem] = useState<RegistryItem | null>(null)

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-subtle p-6 text-center text-xs text-text-muted bg-bg-elevated/10">
        ✨ Toutes les ressources détectées sur votre système sont classifiées.
      </div>
    )
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <ShieldAlert size={16} className="text-yellow animate-pulse" />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Ressources non classifiées ({items.length})
        </h2>
      </div>

      <div className="rounded-lg border border-yellow/20 bg-yellow/5 px-4 py-3 text-xs text-text-secondary leading-normal mb-3">
        Ces processus ou sites ont été détectés en arrière-plan. Par défaut, ils seront bloqués pendant vos blocs focus tant que vous ne les aurez pas déclarés utiles.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="info-panel flex items-center justify-between gap-4 rounded-xl border-yellow/10 bg-yellow/5 px-4 py-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-text-primary truncate">
                  {item.displayName}
                </span>
                <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] font-bold uppercase text-text-muted">
                  {item.kind === 'site' ? 'Web' : 'App'}
                </span>
                {item.category && (
                  <span className={cn(
                    "rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                    CATEGORY_STYLES[item.category] || CATEGORY_STYLES['Other']
                  )}>
                    {item.category}
                  </span>
                )}
              </div>
              <div className="text-[10px] text-text-muted font-mono truncate mt-0.5">
                {item.identifier}
              </div>
            </div>

            <Button
              variant="default"
              size="sm"
              onClick={() => setSelectedItem(item)}
              className="h-7 text-xs border-yellow/20 bg-yellow/10 text-yellow hover:bg-yellow/20"
            >
              Classifier
            </Button>
          </div>
        ))}
      </div>

      {selectedItem && (
        <ClassificationDialog item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}
    </section>
  )
}
