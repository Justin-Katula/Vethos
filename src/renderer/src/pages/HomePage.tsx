import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, AlertTriangle, Clock, Plus, Trash2, Target, Zap } from 'lucide-react'
import { PageTransition } from '@/components/PageTransition'
import { usePlanning } from '@/lib/use-planning'
import { usePlanningStore } from '@/store/planning.store'
import { localDateKey } from '@/lib/use-planning'
import type { TaskItem, ObjectiveItem, AncreItem, ScheduleEntry } from '@/lib/planning/types'

function minuteLabel(m: number): string {
  const h = Math.floor(m / 60)
  const min = m % 60
  return `${String(h).padStart(2, '0')}h${String(min).padStart(2, '0')}`
}

export default function HomePage() {
  const [now] = useState(() => new Date())
  const plan = usePlanning(now)
  const store = usePlanningStore()
  const todayStr = localDateKey(now)

  const todayBlocks = useMemo(
    () => plan?.blocks.filter((b) => b.date === todayStr) ?? [],
    [plan, todayStr],
  )

  const todayCapacity = useMemo(
    () => plan?.capacities.find((c) => c.date === todayStr),
    [plan, todayStr],
  )

  const isFeasible = plan?.feasibility.globallyFeasible ?? true

  return (
    <PageTransition>
      <div className="flex h-full flex-col gap-6 overflow-y-auto px-12 pb-16 pt-16">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">Aujourd'hui</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {todayBlocks.length} bloc(s) planifié(s) · {todayCapacity?.usableCapacityMinutes ?? 0} min disponibles
          </p>
        </header>

        {/* Faisabilité */}
        <div className={`rounded-lg border px-5 py-4 ${isFeasible ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
          <div className="flex items-center gap-2 text-sm font-medium">
            {isFeasible ? (
              <><CheckCircle2 size={16} className="text-green-400" /> Plan faisable</>
            ) : (
              <><AlertTriangle size={16} className="text-red-400" /> Plan en déficit</>
            )}
          </div>
          {!isFeasible && plan?.feasibility.deficits.map((d, i) => (
            <div key={i} className="mt-2 text-xs text-text-muted">
              {d.deadline} : déficit de {d.deficitMinutes} min ({d.severity})
            </div>
          ))}
        </div>

        {/* Blocs du jour */}
        <section>
          <h2 className="mb-3 text-lg font-medium">Blocs planifiés</h2>
          {todayBlocks.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border-subtle px-5 py-10 text-center text-sm text-text-muted">
              Aucun bloc. Ajoute des tâches ou des objectifs pour voir le planning.
            </div>
          ) : (
            <div className="space-y-2">
              {todayBlocks.map((b) => (
                <motion.div
                  key={b.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-3 rounded-md border border-border-subtle bg-bg-card px-4 py-3"
                >
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: b.color }} />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-text-primary">{b.label}</div>
                    <div className="text-xs text-text-muted">
                      {minuteLabel(b.startMinute)} — {minuteLabel(b.endMinute)} · {b.durationMinutes} min
                      {b.breakMinutes > 0 && ` · pause ${b.breakMinutes}min`}
                    </div>
                  </div>
                  <div className="text-xs text-text-muted">
                    {b.kind === 'task' && <Zap size={14} className="text-accent" />}
                    {b.kind === 'objective' && <Target size={14} className="text-green-400" />}
                    {b.kind === 'ancre' && <Clock size={14} className="text-orange-400" />}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </section>

        {/* Quick stats */}
        <section className="grid grid-cols-3 gap-3">
          <StatCard label="Placé" value={`${plan?.totalMinutesPlaced ?? 0} min`} />
          <StatCard label="Prévu" value={`${plan?.totalMinutesPlanned ?? 0} min`} />
          <StatCard label="Capacité" value={`${todayCapacity?.usableCapacityMinutes ?? 0} min`} />
        </section>

        {/* Quick add task */}
        <QuickAddTask onAdd={(t) => void store.addTask(t)} />
      </div>
    </PageTransition>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-card px-4 py-3 text-center">
      <div className="text-lg font-semibold text-text-primary">{value}</div>
      <div className="text-xs text-text-muted">{label}</div>
    </div>
  )
}

function QuickAddTask({ onAdd }: { onAdd: (t: Omit<TaskItem, 'id' | 'createdAt' | 'correctionFactor'>) => void }) {
  const [title, setTitle] = useState('')
  const [deadline, setDeadline] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    return localDateKey(d)
  })
  const [importance, setImportance] = useState(5)
  const [estMin, setEstMin] = useState(60)

  return (
    <section className="rounded-lg border border-border-subtle bg-bg-card p-5">
      <h2 className="mb-3 text-sm font-medium">Ajouter une tâche rapide</h2>
      <div className="flex flex-col gap-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Titre de la tâche..."
          className="rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
        <div className="flex gap-3">
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)}
            className="rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none" />
          <input type="number" min={1} max={10} value={importance} onChange={(e) => setImportance(Number(e.target.value))}
            className="w-20 rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none" title="Importance 1-10" />
          <input type="number" min={5} max={480} value={estMin} onChange={(e) => setEstMin(Number(e.target.value))}
            className="w-24 rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none" title="Estimation (min)" />
          <button
            type="button"
            disabled={!title.trim()}
            onClick={() => {
              onAdd({ title: title.trim(), deadline, importance, category: 'général', estimatedMinutes: estMin, remainingMinutes: estMin, status: 'active' })
              setTitle('')
            }}
            className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            <Plus size={16} /> Ajouter
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Importance (1-10)</span>
          <span>·</span>
          <span>Estimation (min)</span>
        </div>
      </div>
    </section>
  )
}
