import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { PageTransition } from '@/components/PageTransition'
import { AncresEditor, ObjectivesEditor, inputClass } from '@/components/editors'
import { TaskHierarchyList } from '@/components/tasks/TaskHierarchy'
import { MORE_TIME_STEP_MINUTES, usePlanningStore, type TaskDraft } from '@/store/planning.store'
import { usePlanning } from '@/lib/use-planning'
import { maxTaskMinutesPerDay } from '@shared/planning/placement'
import { useToast } from '@/lib/use-toast'
import { addDays, dateKey } from '@shared/planning/dates'
import { cn } from '@/lib/cn'
import type { TaskItem } from '@shared/planning/types'
import { IntelligentBlockingReviewModal } from '@/components/blocking/IntelligentBlockingReviewModal'

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
    addMoreTime,
    addObjective,
    deleteObjective,
    addAncre,
    deleteAncre,
    learning,
  } = usePlanningStore()
  const toast = useToast()
  const reduce = useReducedMotion()
  const plan = usePlanning()

  const active = useMemo(() => tasks.filter((t) => t.status === 'active'), [tasks])
  const activeRoots = useMemo(() => active.filter((t) => t.parentTaskId === null), [active])
  const worked = learning.workedMinutesByRef
  // B.5 : seuil de déclenchement du découpage automatique.
  const maxPerDayMinutes = maxTaskMinutesPerDay(plan?.capacities ?? [])

  return (
    <PageTransition>
      <div className="mx-auto flex h-full w-full max-w-[1560px] flex-col overflow-y-auto overflow-x-hidden px-8 pb-14 pt-12 xl:px-14">
        <header className="mb-10">
          <h1 className="text-3xl font-semibold text-fg">My commitments</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-fg-3">
            You declare what you want to do. The app decides when, based on the time you
            actually have left.
          </p>
        </header>

        <div className="grid flex-1 items-start gap-x-12 gap-y-12 lg:grid-cols-2 2xl:grid-cols-3">
          <Section
            index={0}
            reduce={reduce}
            title="Tasks"
            law="A deadline and a finite amount of work. Ruled by slack: whatever is due first goes first."
            count={activeRoots.length}
          >
            <TasksEditor
              tasks={active}
              worked={worked}
              onAdd={(draft) => addTask(draft, { maxPerDayMinutes })}
              onAddMoreTime={(id) => void addMoreTime(id, MORE_TIME_STEP_MINUTES)}
              onDelete={(id) => void deleteTask(id)}
            />
          </Section>

          <Section
            index={1}
            reduce={reduce}
            title="Goals"
            law="A weekly target, never a deadline. Ruled by rhythm: it moves forward without ever being late."
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
            title="Anchors"
            law="A fixed hour, chosen once. Ruled by stability: it never moves from one day to the next."
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
                    title: 'Anchor refused',
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
  worked,
  onAdd,
  onAddMoreTime,
  onDelete,
}: {
  tasks: TaskItem[]
  worked: Record<string, number>
  onAdd: (t: TaskDraft) => Promise<void>
  onAddMoreTime: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [draft, setDraft] = useState(() => ({
    title: '',
    plan: '',
    deadline: addDays(dateKey(new Date()), 7),
    minutes: 60,
    importance: 5,
    category: 'general',
    workKind: 'routine' as 'routine' | 'novel',
  }))
  const [detailed, setDetailed] = useState(false)
  const [pendingDraft, setPendingDraft] = useState<TaskDraft | null>(null)

  const submit = () => {
    if (!draft.title.trim() || !draft.plan.trim()) return
    setPendingDraft({
      title: draft.title.trim(),
      plan: draft.plan.trim(),
      deadline: draft.deadline,
      importance: draft.importance,
      category: draft.category.trim() || 'general',
      workKind: draft.workKind,
      estimatedMinutes: draft.minutes,
      // Le store applique le facteur de correction : l'estimation brute
      // n'entre jamais telle quelle dans le plan.
      remainingMinutes: draft.minutes,
      correctionFactor: draft.workKind === 'novel' ? 1.7 : 1.4,
      status: 'active',
      appsToBlock: [],
    })
  }

  return (
    <>
      <TaskHierarchyList
        tasks={tasks}
        worked={worked}
        onAddMoreTime={onAddMoreTime}
        onDelete={onDelete}
        stepMinutes={MORE_TIME_STEP_MINUTES}
      />

      <div className="mt-4 space-y-2 border-t border-line pt-4">
        <input
          type="text"
          name="commitment-task-title"
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="What there is to do…"
          className={cn(inputClass, 'w-full')}
        />
        <input
          type="text"
          name="commitment-task-plan"
          value={draft.plan}
          onChange={(e) => setDraft({ ...draft, plan: e.target.value })}
          placeholder="What will this concretely involve? (e.g. tonight at my desk...)"
          className={cn(inputClass, 'w-full')}
        />
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            name="commitment-task-deadline"
            value={draft.deadline}
            onChange={(e) => setDraft({ ...draft, deadline: e.target.value })}
            className={inputClass}
          />
          <label className="flex items-center gap-1.5 text-xs text-fg-3">
            <input
              type="number"
              name="commitment-task-minutes"
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
            disabled={!draft.title.trim() || !draft.plan.trim()}
            onClick={submit}
            className="pressable ml-auto inline-flex items-center gap-1.5 rounded border border-line-strong px-3 py-2 text-sm text-fg transition-colors hover:bg-surface-2 disabled:opacity-40"
          >
            <Plus size={14} /> Add
          </button>
        </div>

        <button
          type="button"
          onClick={() => setDetailed((v) => !v)}
          className="text-[11px] text-fg-3 underline-offset-2 transition-colors hover:text-fg-2 hover:underline"
        >
          {detailed ? 'Hide' : 'Importance, category, kind of work'}
        </button>

        {detailed && (
          <div className="grid grid-cols-3 gap-2 pt-1">
            <label className="text-[11px] text-fg-3">
              Importance
              <input
                type="number"
                name="commitment-task-importance"
                min={1}
                max={10}
                value={draft.importance}
                onChange={(e) => setDraft({ ...draft, importance: Number(e.target.value) })}
                className={cn(inputClass, 'mt-1 w-full')}
              />
            </label>
            <label className="text-[11px] text-fg-3">
              Category
              <input
                type="text"
                name="commitment-task-category"
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                className={cn(inputClass, 'mt-1 w-full')}
              />
            </label>
            <label className="text-[11px] text-fg-3">
              Nature
              <select
                value={draft.workKind}
                name="commitment-task-work-kind"
                onChange={(e) =>
                  setDraft({ ...draft, workKind: e.target.value as 'routine' | 'novel' })
                }
                className={cn(inputClass, 'mt-1 w-full')}
              >
                <option value="routine">Done before</option>
                <option value="novel">First time</option>
              </select>
            </label>
          </div>
        )}

        <p className="pt-1 text-[11px] text-fg-3">
          Importance is declared once, at creation. It is never recomputed.
        </p>
      </div>

      {pendingDraft && (
        <IntelligentBlockingReviewModal
          open={true}
          title={pendingDraft.title}
          plan={pendingDraft.plan}
          kindLabel="task"
          onConfirm={(blockedApps) => {
            void onAdd({
              ...pendingDraft,
              appsToBlock: blockedApps,
            })
            setPendingDraft(null)
            setDraft((d) => ({ ...d, title: '', plan: '' }))
          }}
          onCancel={() => setPendingDraft(null)}
        />
      )}
    </>
  )
}
