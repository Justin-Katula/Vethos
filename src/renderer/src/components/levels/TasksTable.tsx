import { motion } from 'framer-motion'
import { Task } from '@shared/schemas'
import { getDeadlineMultiplier, taskDeadlineLabel } from '@/lib/free-time-calculator'
import { momentumPhrase, priorityPhrase, stagnationPhrase, urgencyPhrase, workloadPhrase } from '@/lib/human-score-language'

type Props = {
  tasks: Task[]
}

export function TasksTable({ tasks }: Props) {
  const activeTasks = tasks.filter((t) => t.status === 'active')
  const today = new Date().toISOString().split('T')[0] || ''

  if (activeTasks.length === 0) {
    return (
      <div className="info-panel rounded-xl border-dashed p-8 text-center">
        <div className="text-sm text-text-muted">Aucune tâche urgente.</div>
      </div>
    )
  }

  return (
    <div className="info-panel rounded-xl">
      <table className="w-full text-left text-sm">
        <thead className="bg-bg-base/50 text-[10px] uppercase tracking-widest text-text-muted">
          <tr>
            <th className="px-5 py-3 font-medium">Tâche</th>
            <th className="px-5 py-3 font-medium text-center">Niveau</th>
            <th className="px-5 py-3 font-medium text-right">Deadline</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {activeTasks.map((task) => {
            const multiplier =
              task.deadline === today && task.deadlineTime
                ? 2
                : getDeadlineMultiplier(task.deadline, today)
            const deadlineLabel = taskDeadlineLabel(task, today)

            return (
              <motion.tr
                key={task.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                whileHover={{ backgroundColor: 'var(--bg-card-hover)' }}
                className="transition-colors"
              >
                <td className="px-5 py-4">
                  <div className="font-medium text-text-primary">{task.title}</div>
                  <div className="mt-1 text-[10px] text-text-muted">{priorityPhrase(task.priorityScoreV2?.priorityScore ?? task.level * 10)}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-text-muted">
                    <span>{urgencyPhrase(task.priorityScoreV2?.urgencyScore ?? 0)}</span>
                    <span>{workloadPhrase(task.priorityScoreV2?.workloadScore ?? 0)}</span>
                    <span>{stagnationPhrase(task.priorityScoreV2?.stagnationScore ?? 0)}</span>
                    <span>{momentumPhrase(task.priorityScoreV2?.momentumScore ?? 0)}</span>
                  </div>
                  <details className="mt-2 text-[10px] text-text-secondary">
                    <summary className="cursor-pointer text-accent">Pourquoi ?</summary>
                    {(task.priorityScoreV2?.reasons ?? ['Le niveau et la deadline actuels déterminent cette recommandation.']).map((reason) => <p key={reason} className="mt-1">• {reason}</p>)}
                  </details>
                </td>
                <td className="px-5 py-4">
                  <div className="flex flex-col items-center gap-1">
                    <div className="h-1 w-16 rounded-2xl bg-bg-base overflow-hidden">
                      <div
                        className={`h-full ${task.level >= 6 ? 'bg-red-500' : task.level >= 4 ? 'bg-yellow' : 'bg-emerald-500'}`}
                        style={{ width: `${(task.level / 10) * 100}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-bold text-text-secondary">{task.level}</span>
                  </div>
                </td>
                <td className="px-5 py-4 text-right">
                  <span
                    className={`text-xs font-bold ${multiplier >= 2.0 ? 'text-red-500' : multiplier >= 1.6 ? 'text-orange' : 'text-text-secondary'}`}
                  >
                    {deadlineLabel}
                  </span>
                </td>
              </motion.tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
