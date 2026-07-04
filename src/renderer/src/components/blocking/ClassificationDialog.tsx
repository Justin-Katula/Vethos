import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check, Shield, AlertTriangle } from 'lucide-react'
import { useRegistryStore } from '@/store/registry.store'
import { useLevelsStore } from '@/store/levels.store'
import { useTasksStore } from '@/store/tasks.store'
import { DistractionWarning } from './DistractionWarning'
import type { RegistryItem } from '@shared/schemas'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'

type Props = {
  item: RegistryItem
  onClose: () => void
  /** Si true, l'utilisateur est déjà en train de modifier un item classé,
   * donc on n'affiche pas l'option 'Distraction' si déjà classifié utile. */
  isEditing?: boolean
}

export function ClassificationDialog({ item, onClose, isEditing = false }: Props) {
  const objectives = useLevelsStore((s) => s.objectives)
  const tasks = useTasksStore((s) => s.tasks).filter(
    (t) => t.status === 'active' && t.linkedObjectiveId === null,
  )
  const classifyItem = useRegistryStore((s) => s.classifyItem)
  const addUsefulFor = useRegistryStore((s) => s.addUsefulFor)
  const demoteItem = useRegistryStore((s) => s.demoteItem)

  // Pré-cocher les objectifs et tâches déjà associés si on édite
  const [selObjs, setSelObjs] = useState<string[]>(item.usefulFor?.objectives ?? [])
  const [selTasks, setSelTasks] = useState<string[]>(item.usefulFor?.standaloneTasks ?? [])
  const [pendingAction, setPendingAction] = useState<'classify' | 'distraction' | null>(null)

  const toggleObjective = (id: string) => {
    // Si on édite, on ne peut que rajouter des objectifs, pas en enlever (anti-sabotage)
    if (isEditing && item.usefulFor?.objectives.includes(id)) return
    setSelObjs((prev) => (prev.includes(id) ? prev.filter((oid) => oid !== id) : [...prev, id]))
  }

  const toggleTask = (id: string) => {
    // Si on édite, on ne peut que rajouter des tâches, pas en enlever (anti-sabotage)
    if (isEditing && item.usefulFor?.standaloneTasks.includes(id)) return
    setSelTasks((prev) => (prev.includes(id) ? prev.filter((tid) => tid !== id) : [...prev, id]))
  }

  const handleConfirmClassify = async () => {
    if (isEditing) {
      await addUsefulFor({
        itemId: item.id,
        usefulFor: { objectives: selObjs, standaloneTasks: selTasks },
      })
    } else {
      await classifyItem({
        itemId: item.id,
        usefulFor: { objectives: selObjs, standaloneTasks: selTasks },
      })
    }
    setPendingAction(null)
    onClose()
  }

  const handleConfirmDistraction = async () => {
    await classifyItem({
      itemId: item.id,
      usefulFor: { objectives: [], standaloneTasks: [] },
    })
    await demoteItem(item.id)
    setPendingAction(null)
    onClose()
  }

  const hasSelection = selObjs.length > 0 || selTasks.length > 0

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="relative flex h-[580px] w-[500px] flex-col rounded-2xl border border-border-subtle bg-bg-elevated shadow-elevated"
        >
          {/* Header */}
          <header className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-text-primary">
                Classifier {item.displayName}
              </h2>
              <p className="text-xs text-text-muted mt-0.5 font-mono">{item.identifier}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 rounded-full p-0">
              <X size={16} />
            </Button>
          </header>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            {isEditing && (
              <div className="rounded-lg border border-accent/20 bg-accent/5 px-3 py-2.5 text-xs text-text-secondary leading-normal flex items-start gap-2">
                <Shield size={14} className="text-accent shrink-0 mt-0.5" />
                <div>
                  <strong>Mode Édition (Anti-Sabotage)</strong>
                  <br />
                  Vous pouvez ajouter des objectifs et tâches supplémentaires pour lesquels ce site/app est utile. Les associations déjà validées ne peuvent pas être supprimées.
                </div>
              </div>
            )}

            {/* Objectifs */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
                Utile pour mes objectifs ({objectives.length})
              </h3>
              {objectives.length === 0 ? (
                <p className="text-xs text-text-muted">Aucun objectif créé.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {objectives.map((obj) => {
                    const selected = selObjs.includes(obj.id)
                    const original = item.usefulFor?.objectives.includes(obj.id)
                    return (
                      <button
                        key={obj.id}
                        type="button"
                        onClick={() => toggleObjective(obj.id)}
                        disabled={isEditing && original}
                        className={cn(
                          'flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-all',
                          selected
                            ? 'border-accent/40 bg-accent/10 text-text-primary'
                            : 'border-border-subtle bg-bg-base/40 text-text-secondary hover:border-border-strong hover:bg-bg-base/80',
                          isEditing && original && 'opacity-60 cursor-not-allowed border-accent/20 bg-accent/5',
                        )}
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: obj.color }}
                        />
                        <span>{obj.name}</span>
                        {selected && <Check size={12} className="text-accent ml-0.5" />}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Tâches autonomes */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
                Utile pour mes tâches autonomes ({tasks.length})
              </h3>
              {tasks.length === 0 ? (
                <p className="text-xs text-text-muted">Aucune tâche autonome active.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {tasks.map((t) => {
                    const selected = selTasks.includes(t.id)
                    const original = item.usefulFor?.standaloneTasks.includes(t.id)
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleTask(t.id)}
                        disabled={isEditing && original}
                        className={cn(
                          'flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-all',
                          selected
                            ? 'border-accent/40 bg-accent/10 text-text-primary'
                            : 'border-border-subtle bg-bg-base/40 text-text-secondary hover:border-border-strong hover:bg-bg-base/80',
                          isEditing && original && 'opacity-60 cursor-not-allowed border-accent/20 bg-accent/5',
                        )}
                      >
                        <span>{t.title}</span>
                        {selected && <Check size={12} className="text-accent ml-0.5" />}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <footer className="flex items-center justify-between border-t border-border-subtle px-6 py-4 bg-bg-base/20">
            <Button variant="ghost" size="default" onClick={onClose}>
              Plus tard
            </Button>

            <div className="flex items-center gap-2">
              {!isEditing && (
                <Button
                  variant="danger"
                  size="default"
                  onClick={() => setPendingAction('distraction')}
                >
                  C&apos;est une distraction
                </Button>
              )}
              <Button
                variant="solid"
                size="default"
                disabled={!hasSelection}
                onClick={() => setPendingAction('classify')}
              >
                {isEditing ? 'Enregistrer les ajouts' : 'Utile pour focus'}
              </Button>
            </div>
          </footer>
        </motion.div>
      </div>

      <DistractionWarning
        open={pendingAction === 'classify'}
        title={`Marquer ${item.displayName} comme utile ?`}
        message={`Vous allez déclarer ${item.displayName} comme outil de travail nécessaire pour vos blocs focus. Une fois validé, vous ne pourrez plus supprimer ces liaisons. La seule modification possible sera de rétrograder entièrement ce site/app en distraction.`}
        onConfirm={handleConfirmClassify}
        onCancel={() => setPendingAction(null)}
      />

      <DistractionWarning
        open={pendingAction === 'distraction'}
        title={`Marquer ${item.displayName} comme distraction ?`}
        message={`Vous allez déclarer ${item.displayName} comme distraction pure. Il sera bloqué automatiquement sur TOUS vos blocs de travail et il sera IMPOSSIBLE de le rendre utile à l'avenir.`}
        onConfirm={handleConfirmDistraction}
        onCancel={() => setPendingAction(null)}
      />
    </>
  )
}
