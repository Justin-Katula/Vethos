import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Plus, Trash2 } from 'lucide-react'
import { PageTransition } from '@/components/PageTransition'
import { AncresEditor, ObjectivesEditor, duration, inputClass } from '@/components/editors'
import { usePlanningStore } from '@/store/planning.store'
import { useToast } from '@/lib/use-toast'
import { addDays, dateKey } from '@/lib/planning/dates'
import { cn } from '@/lib/cn'
import type { TaskItem } from '@/lib/planning/types'

/**
 * Mes engagements.
 *
 * Trois types d'objets, trois lois de calcul différentes. Les mêler dans une
 * seule liste serait mentir sur leur nature : une tâche a une échéance et se
 * termine, un objectif a un rythme et ne se termine jamais, une ancre a une
 * heure et ne bouge pas. Chacun garde donc sa section, son vocabulaire et son
 * propre geste de création.
 */
export default function CommitmentsPage() {
  const {
    tasks,
    objectives,
    ancres,
    addTask,
    deleteTask,
    completeTask,
    addObjective,
    deleteObjective,
    addAncre,
    deleteAncre,
  } = usePlanningStore()
  const toast = useToast()
  const reduce = useReducedMotion()

  const active = useMemo(() => tasks.filter((t) => t.status === 'active'), [tasks])

  return (
    <PageTransition>
      <div className="mx-auto flex h-full w-full max-w-[1560px] flex-col overflow-y-auto px-14 pb-14 pt-12">
        <header className="mb-10">
          <h1 className="text-3xl font-semibold text-fg">Mes engagements</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-fg-3">
            Tu déclares ce que tu veux faire. L{'’'}application décide quand, en fonction du temps
            qui te reste réellement.
          </p>
        </header>

        <div className="grid flex-1 items-start gap-x-14 gap-y-12 xl:grid-cols-3">
          <Section
            index={0}
            reduce={reduce}
            title="Tâches"
            law="Une échéance et une quantité finie de travail. Gouvernée par la marge : ce qui est dû en premier passe en premier."
            count={active.length}
          >
            <TasksEditor
              tasks={active}
              onAdd={addTask}
              onComplete={(id) => void completeTask(id)}
              onDelete={(id) => void deleteTask(id)}
            />
          </Section>

          <Section
            index={1}
            reduce={reduce}
            title="Objectifs"
            law="Une cible par semaine, jamais d’échéance. Gouverné par le rythme : il avance sans jamais être en retard."
            count={objectives.length}
          >
            <ObjectivesEditor
              objectives={objectives}
              onAdd={(draft) => void addObjective(draft)}
              onDelete={(id) => void deleteObjective(id)}
            />
          </Section>

          <Section
            index={2}
            reduce={reduce}
            title="Ancres"
            law="Une heure fixe, choisie une fois. Gouvernée par la stabilité : elle ne bouge jamais d’un jour à l’autre."
            count={ancres.length}
          >
            <AncresEditor
              ancres={ancres}
              onAdd={async (draft) => {
                try {
                  await addAncre(draft)
                } catch (err) {
                  // D.3 : la création est refusée, jamais décalée en silence.
                  toast.error({
                    title: 'Ancre refusée',
                    description: err instanceof Error ? err.message : String(err),
                  })
                }
              }}
              onDelete={(id) => void deleteAncre(id)}
            />
          </Section>
        </div>
      </div>
    </PageTransition>
  )
}

/**
 * Une section porte son nom, sa loi, et son compte. La loi n'est pas de la
 * décoration : c'est ce qui explique pourquoi les trois ne se rangent pas
 * ensemble, et quelqu'un qui découvre l'application en a besoin.
 */
function Section({
  index,
  reduce,
  title,
  law,
  count,
  children,
}: {
  index: number
  reduce: boolean | null
  title: string
  law: string
  count: number
  children: React.ReactNode
}) {
  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="min-w-0"
    >
      <div className="mb-4 border-b border-line pb-3">
        <div className="flex items-baseline gap-2.5">
          <h2 className="text-lg font-semibold text-fg">{title}</h2>
          <span className="font-mono text-xs tabular-nums text-fg-3">{count}</span>
        </div>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-fg-3">{law}</p>
      </div>
      {children}
    </motion.section>
  )
}

// ─── Tâches ───────────────────────────────────────────────────────────────

function TasksEditor({
  tasks,
  onAdd,
  onComplete,
  onDelete,
}: {
  tasks: TaskItem[]
  onAdd: (t: Omit<TaskItem, 'id' | 'createdAt' | 'parentTaskId'>) => Promise<void>
  onComplete: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [draft, setDraft] = useState(() => ({
    title: '',
    deadline: addDays(dateKey(new Date()), 7),
    minutes: 60,
    importance: 5,
    category: 'général',
    workKind: 'routine' as 'routine' | 'novel',
  }))
  const [detailed, setDetailed] = useState(false)

  const submit = () => {
    if (!draft.title.trim()) return
    void onAdd({
      title: draft.title.trim(),
      deadline: draft.deadline,
      importance: draft.importance,
      category: draft.category.trim() || 'général',
      workKind: draft.workKind,
      estimatedMinutes: draft.minutes,
      // Le store applique le facteur de correction : l'estimation brute
      // n'entre jamais telle quelle dans le plan.
      remainingMinutes: draft.minutes,
      correctionFactor: draft.workKind === 'novel' ? 1.7 : 1.4,
      status: 'active',
    })
    setDraft((d) => ({ ...d, title: '' }))
  }

  return (
    <>
      <div className="space-y-1">
        {tasks.length === 0 ? (
          <p className="py-4 text-center text-xs text-fg-3">
            Rien à rendre pour l{'’'}instant.
          </p>
        ) : (
          tasks.map((t) => (
            <div key={t.id} className="group flex items-center gap-3 py-1.5 text-xs">
              <button
                type="button"
                onClick={() => onComplete(t.id)}
                className="h-3.5 w-3.5 shrink-0 rounded-full border border-line-strong transition-colors hover:border-fg hover:bg-fg"
                aria-label={`Terminer ${t.title}`}
              />
              <span className="truncate text-fg">{t.title}</span>
              <span className="ml-auto shrink-0 font-mono tabular-nums text-fg-3">
                {t.deadline.slice(5)} · {duration(t.remainingMinutes)}
              </span>
              <button
                type="button"
                onClick={() => onDelete(t.id)}
                className="shrink-0 text-fg-3 opacity-0 transition-opacity hover:text-fg group-hover:opacity-100"
                aria-label={`Supprimer ${t.title}`}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 space-y-2 border-t border-line pt-4">
        <input
          type="text"
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Ce qu’il y a à faire…"
          className={cn(inputClass, 'w-full')}
        />
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={draft.deadline}
            onChange={(e) => setDraft({ ...draft, deadline: e.target.value })}
            className={inputClass}
          />
          <label className="flex items-center gap-1.5 text-xs text-fg-3">
            <input
              type="number"
              min={5}
              max={2400}
              step={5}
              value={draft.minutes}
              onChange={(e) => setDraft({ ...draft, minutes: Number(e.target.value) })}
              className={cn(inputClass, 'w-20')}
            />
            min
          </label>
          <button
            type="button"
            disabled={!draft.title.trim()}
            onClick={submit}
            className="pressable ml-auto inline-flex items-center gap-1.5 rounded border border-line-strong px-3 py-2 text-sm text-fg transition-colors hover:bg-surface-2 disabled:opacity-40"
          >
            <Plus size={14} /> Ajouter
          </button>
        </div>

        <button
          type="button"
          onClick={() => setDetailed((v) => !v)}
          className="text-[11px] text-fg-3 underline-offset-2 transition-colors hover:text-fg-2 hover:underline"
        >
          {detailed ? 'Masquer' : 'Importance, catégorie, nature du travail'}
        </button>

        {detailed && (
          <div className="grid grid-cols-3 gap-2 pt-1">
            <label className="text-[11px] text-fg-3">
              Importance
              <input
                type="number"
                min={1}
                max={10}
                value={draft.importance}
                onChange={(e) => setDraft({ ...draft, importance: Number(e.target.value) })}
                className={cn(inputClass, 'mt-1 w-full')}
              />
            </label>
            <label className="text-[11px] text-fg-3">
              Catégorie
              <input
                type="text"
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                className={cn(inputClass, 'mt-1 w-full')}
              />
            </label>
            <label className="text-[11px] text-fg-3">
              Nature
              <select
                value={draft.workKind}
                onChange={(e) =>
                  setDraft({ ...draft, workKind: e.target.value as 'routine' | 'novel' })
                }
                className={cn(inputClass, 'mt-1 w-full')}
              >
                <option value="routine">Connu</option>
                <option value="novel">Nouveau</option>
              </select>
            </label>
          </div>
        )}

        <p className="pt-1 text-[11px] text-fg-3">
          L{'’'}importance se déclare une seule fois, à la création. Elle n{'’'}est jamais
          recalculée.
        </p>
      </div>
    </>
  )
}
