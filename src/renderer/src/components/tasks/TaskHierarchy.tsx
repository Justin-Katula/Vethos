import { useMemo } from 'react'
import { Trash2, Layers, CheckCircle2, Lock, Circle } from 'lucide-react'
import { isPartLocked } from '@shared/planning/estimation'
import { cn } from '@/lib/cn'
import type { TaskItem } from '@shared/planning/types'

export function duration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`
}

function cleanPartTitle(fullTitle: string, parentTitle: string, order: number | null): string {
  const prefix = `${parentTitle} — `
  if (fullTitle.startsWith(prefix)) {
    return fullTitle.slice(prefix.length)
  }
  if (order !== null) {
    return `Partie ${order}`
  }
  return fullTitle
}

export type TaskGroupItem = {
  root: TaskItem
  isSplit: boolean
  parts: TaskItem[]
  totalEstimatedMinutes: number
  totalRemainingMinutes: number
  totalWorkedMinutes: number
  deadline: string
  category: string
}

export function groupTasks(
  tasks: TaskItem[],
  worked: Record<string, number> = {},
): TaskGroupItem[] {
  const groupIds = new Set(
    tasks.map((t) => t.parentTaskId).filter((id): id is string => id !== null),
  )

  const roots = tasks.filter((t) => t.parentTaskId === null)

  return roots.map((root) => {
    const parts = tasks
      .filter((t) => t.parentTaskId === root.id)
      .sort((a, b) => (a.partOrder ?? 0) - (b.partOrder ?? 0))

    const isSplit = parts.length > 0 || groupIds.has(root.id)

    if (isSplit) {
      const activeParts = parts.filter((p) => p.status === 'active')
      const totalEstimated = parts.reduce((s, p) => s + p.estimatedMinutes + p.extraMinutes, 0)
      const totalWorked = parts.reduce((s, p) => s + (worked[p.id] ?? 0), 0)
      const totalRemaining = parts.reduce(
        (s, p) => s + Math.max(0, p.remainingMinutes + p.extraMinutes - (worked[p.id] ?? 0)),
        0,
      )

      return {
        root,
        isSplit: true,
        parts: activeParts.length > 0 ? activeParts : parts,
        totalEstimatedMinutes: totalEstimated,
        totalRemainingMinutes: totalRemaining,
        totalWorkedMinutes: totalWorked,
        deadline: root.deadline,
        category: root.category,
      }
    }

    const taskWorked = worked[root.id] ?? 0
    const remaining = Math.max(0, root.remainingMinutes + root.extraMinutes - taskWorked)

    return {
      root,
      isSplit: false,
      parts: [],
      totalEstimatedMinutes: root.estimatedMinutes + root.extraMinutes,
      totalRemainingMinutes: remaining,
      totalWorkedMinutes: taskWorked,
      deadline: root.deadline,
      category: root.category,
    }
  })
}

export function TaskHierarchyList({
  tasks,
  worked = {},
  onAddMoreTime,
  onDelete,
  stepMinutes = 25,
}: {
  tasks: TaskItem[]
  worked?: Record<string, number>
  onAddMoreTime?: (id: string) => void
  onDelete?: (id: string) => void
  stepMinutes?: number
}) {
  const groups = useMemo(() => groupTasks(tasks, worked), [tasks, worked])

  if (groups.length === 0) {
    return <div className="py-6 text-center text-xs text-fg-3">Nothing due right now.</div>
  }

  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <TaskCard
          key={g.root.id}
          group={g}
          allTasks={tasks}
          worked={worked}
          onAddMoreTime={onAddMoreTime}
          onDelete={onDelete}
          stepMinutes={stepMinutes}
        />
      ))}
    </div>
  )
}

function TaskCard({
  group,
  allTasks,
  worked,
  onAddMoreTime,
  onDelete,
  stepMinutes,
}: {
  group: TaskGroupItem
  allTasks: TaskItem[]
  worked: Record<string, number>
  onAddMoreTime?: (id: string) => void
  onDelete?: (id: string) => void
  stepMinutes: number
}) {
  const { root, isSplit, parts, totalRemainingMinutes, totalWorkedMinutes, deadline, category } =
    group

  return (
    <div className="group/card relative rounded border border-line bg-surface p-3.5 transition-colors hover:border-line-strong">
      {/* En-tête de la tâche / Tâche maîtresse */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[13.5px] font-semibold text-fg">{root.title}</h3>

            {isSplit && (
              <span className="inline-flex items-center gap-1 rounded border border-line bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-medium text-fg-2">
                <Layers size={11} className="text-fg-3" />
                {parts.length} partie{parts.length > 1 ? 's' : ''}
              </span>
            )}

            {category !== 'general' && (
              <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-fg-3">
                {category}
              </span>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-fg-3">
            <span className="rounded border border-line bg-surface-2 px-1.5 py-0.5">
              Due{' '}
              <span className="font-mono tabular-nums">{deadline.slice(5).replace('-', '.')}</span>
            </span>
            <span className="rounded border border-line bg-surface-2 px-1.5 py-0.5">
              Restant :{' '}
              <span className="font-mono tabular-nums">{duration(totalRemainingMinutes)}</span>
            </span>
            {totalWorkedMinutes > 0 && (
              <span className="rounded border border-line bg-surface-2 px-1.5 py-0.5 text-fg-2">
                <span className="font-mono tabular-nums">{duration(totalWorkedMinutes)}</span> fait
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {!isSplit && onAddMoreTime && (
            <button
              type="button"
              onClick={() => onAddMoreTime(root.id)}
              className="border border-line px-2 py-0.5 text-[11px] text-fg-3 opacity-80 transition-all hover:border-line-strong hover:text-fg hover:opacity-100"
              title={`Add ${stepMinutes} min to ${root.title}`}
            >
              +{stepMinutes} min
            </button>
          )}

          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(root.id)}
              className="p-1 text-fg-3 opacity-0 transition-opacity hover:text-warn focus-visible:opacity-100 group-hover/card:opacity-100"
              title={`Supprimer ${root.title}`}
              aria-label={`Supprimer ${root.title}`}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Sous-parties imbriquées */}
      {isSplit && parts.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-line/60 pt-2.5">
          <div className="flex items-center gap-1 text-[10.5px] font-medium text-fg-3">
            <span>Sous-parties dans « {root.title} »</span>
          </div>

          <div className="space-y-1.5 pl-2 border-l-2 border-line-strong/40">
            {parts.map((p) => {
              const locked = isPartLocked(p, allTasks)
              const partWorked = worked[p.id] ?? 0
              const partRemaining = Math.max(0, p.remainingMinutes + p.extraMinutes - partWorked)
              const isDone = p.status === 'history' || (partRemaining === 0 && partWorked > 0)
              const partLabel = cleanPartTitle(p.title, root.title, p.partOrder)

              return (
                <div
                  key={p.id}
                  className={cn(
                    'group/part flex items-center justify-between gap-3 rounded px-2 py-1.5 text-xs transition-colors',
                    isDone
                      ? 'bg-surface/30 text-fg-3'
                      : locked
                        ? 'bg-surface/20 text-fg-3'
                        : 'bg-surface-2/60 text-fg hover:bg-surface-2',
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    {isDone ? (
                      <CheckCircle2 size={13} className="shrink-0 text-fg-3" />
                    ) : locked ? (
                      <Lock size={12} className="shrink-0 text-fg-3" />
                    ) : (
                      <Circle size={12} className="shrink-0 text-accent" />
                    )}

                    <span
                      className={cn('truncate font-medium', isDone && 'line-through opacity-70')}
                    >
                      {partLabel}
                    </span>

                    {locked && !isDone && (
                      <span className="shrink-0 text-[10px] text-fg-3 italic">
                        (waiting for the previous one)
                      </span>
                    )}

                    {!locked && !isDone && (
                      <span className="shrink-0 text-[10px] text-fg-2 font-mono">
                        (actionnable)
                      </span>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-mono text-[11px] tabular-nums text-fg-3">
                      {duration(partRemaining)}
                    </span>

                    {!isDone && onAddMoreTime && (
                      <button
                        type="button"
                        onClick={() => onAddMoreTime(p.id)}
                        className="border border-line px-1.5 py-0.5 text-[10px] text-fg-3 opacity-0 transition-all hover:border-line-strong hover:text-fg focus-visible:opacity-100 group-hover/part:opacity-100"
                        title={`Add ${stepMinutes} minutes to this part`}
                      >
                        +{stepMinutes}
                      </button>
                    )}

                    {onDelete && (
                      <button
                        type="button"
                        onClick={() => onDelete(p.id)}
                        className="text-fg-3 opacity-0 transition-opacity hover:text-warn focus-visible:opacity-100 group-hover/part:opacity-100"
                        title="Delete this part"
                        aria-label={`Supprimer ${p.title}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
