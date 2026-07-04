import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ClipboardList,
  Loader2,
  Plus,
  ShieldCheck,
  Target,
  X,
} from 'lucide-react'
import { PageTransition } from '@/components/PageTransition'
import { useBlockingStore } from '@/store/blocking.store'
import { useTasksStore } from '@/store/tasks.store'
import { useLevelsStore } from '@/store/levels.store'
import { ActiveSessionCard } from '@/components/blocking/ActiveSessionCard'
import { UnlockModal } from '@/components/blocking/UnlockModal'
import { HistoryList } from '@/components/blocking/HistoryList'
import { WorkBlockingFields } from '@/components/blocking/WorkBlockingFields'
import { PageSkeleton } from '@/components/ui/Skeleton'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/lib/use-toast'
import { estimateMinutesForLevel } from '@/lib/free-time-calculator'
import type { BlockingProfile, WorkBlockingConfig } from '@shared/schemas'
import { useSessionV2Store } from '@/store/session-v2.store'
import { buildSessionUiData } from '@/lib/session-ui-data-adapter'

const AUTO_PROFILE_ID = '00000000-0000-4000-8000-000000000042'

type TaskComplexity = 'easy' | 'normal' | 'hard' | 'manual' | 'extreme'

function todayDateInputValue(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export default function BlockingPage() {
  const {
    userId,
    loaded: blockingLoaded,
    serviceStatus,
    state: blockState,
    active,
    layerStatus,
    load: loadBlocking,
    requestUnlock,
    submitJustification,
  } = useBlockingStore()
  const { loaded: tasksLoaded, load: loadTasks, saveTask } = useTasksStore()
  const {
    loaded: levelsLoaded,
    load: loadLevels,
    saveObjective,
  } = useLevelsStore()
  const toast = useToast()
  const latestSessionRecord = useSessionV2Store((state) => state.records.at(-1))
  const latestSessionUi = latestSessionRecord ? buildSessionUiData(latestSessionRecord.plan) : null

  const [unlockOpen, setUnlockOpen] = useState(false)
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [objectiveModalOpen, setObjectiveModalOpen] = useState(false)

  useEffect(() => {
    if (!userId) return
    loadBlocking(userId)
    loadTasks(userId)
    loadLevels(userId)
  }, [loadBlocking, loadLevels, loadTasks, userId])

  const handleRequestUnlock = async () => {
    await requestUnlock()
    setUnlockOpen(true)
  }

  const autoProfileList = useMemo<BlockingProfile[]>(() => {
    const profiles = blockState.profiles ?? []
    return [
      ...profiles,
      {
        id: AUTO_PROFILE_ID,
        name: 'Session Focus Automatique',
        mode: 'blocklist',
        blockedSites: [],
        blockedProcesses: [],
        blockedNetworkApps: [],
        unlockPolicy: { type: 'none' },
        createdAt: new Date().toISOString(),
      },
    ]
  }, [blockState.profiles])

  const loaded = blockingLoaded && tasksLoaded && levelsLoaded

  if (!loaded) {
    return (
      <PageTransition>
        <PageSkeleton>
          <div className="space-y-2">
            <div className="h-8 w-40 animate-pulse rounded bg-bg-card" />
            <div className="h-3 w-60 animate-pulse rounded bg-bg-card" />
          </div>
        </PageSkeleton>
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <div className="flex h-full flex-col gap-8 overflow-y-auto px-12 pb-16 pt-16">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accent">
              Coach Vethos
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Centre de discipline</h1>
            <p className="mt-2 max-w-2xl text-sm text-text-secondary">
              Crée tes tâches et objectifs manuellement. Coach garde le blocage, les sessions et
              les décisions automatiques, mais la discussion est retirée pour cette version.
            </p>
          </div>
        </header>

        <section className="grid gap-4 xl:grid-cols-2">
          <ActionCard
            icon={<ClipboardList size={22} />}
            title="Créer une tâche"
            description="Ajoute une chose concrète à faire, sa date limite et les apps/sites nécessaires."
            buttonLabel="Nouvelle tâche"
            onClick={() => setTaskModalOpen(true)}
          />
          <ActionCard
            icon={<Target size={22} />}
            title="Créer un objectif"
            description="Ajoute un objectif plus large que Vethos pourra protéger et utiliser pour organiser tes tâches."
            buttonLabel="Nouvel objectif"
            onClick={() => setObjectiveModalOpen(true)}
          />
        </section>

        {serviceStatus !== 'ok' && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="info-panel flex items-start gap-3 rounded-lg border-orange/40 bg-orange/10 px-4 py-3 text-sm text-orange"
          >
            <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-medium text-orange">Service de blocage indisponible</div>
              <p className="mt-0.5 text-xs text-orange/80">
                Vethos relance automatiquement le service Windows de blocage.
              </p>
            </div>
          </motion.div>
        )}

        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Session en cours
          </h2>
          {active ? (
            <ActiveSessionCard
              session={active}
              layerStatus={layerStatus}
              onRequestStop={handleRequestUnlock}
            />
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="info-panel flex items-center gap-3 rounded-lg px-5 py-4 text-sm text-text-secondary"
            >
              <ShieldCheck size={18} className="text-emerald-400" />
              <div>
                <span>Aucune session active. Le blocage démarrera automatiquement selon ton planning.</span>
                {latestSessionUi && !latestSessionRecord?.outcome && (
                  <div className="mt-2 text-xs text-text-muted">
                    Prochain contrat : {latestSessionUi.title} · {latestSessionUi.duration} · protection {latestSessionUi.protectionLevel}/100
                    {latestSessionUi.warnings[0] ? <div className="mt-1 text-orange">{latestSessionUi.warnings[0]}</div> : null}
                  </div>
                )}
              </div>
              {blockState.nextSessionPenaltyMinutes > 0 && (
                <span className="ml-auto rounded-md border border-orange/30 bg-orange/10 px-2 py-1 text-xs font-medium text-orange">
                  +{blockState.nextSessionPenaltyMinutes} min prochaine session
                </span>
              )}
            </motion.div>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Historique des sessions
          </h2>
          <HistoryList items={blockState.history.slice(0, 30)} profiles={autoProfileList} />
        </section>

        <QuickTaskModal
          open={taskModalOpen}
          onClose={() => setTaskModalOpen(false)}
          onSave={async (draft) => {
            await saveTask(draft)
            toast.success({
              title: 'Tâche créée',
              description: 'Elle est maintenant prise en compte par Vethos.',
            })
          }}
        />

        <QuickObjectiveModal
          open={objectiveModalOpen}
          onClose={() => setObjectiveModalOpen(false)}
          onSave={async (draft) => {
            await saveObjective(draft)
            toast.success({
              title: 'Objectif créé',
              description: 'Vethos pourra maintenant l’utiliser pour organiser tes priorités.',
            })
          }}
        />

        {active && (
          <UnlockModal
            open={unlockOpen}
            onClose={() => setUnlockOpen(false)}
            session={active}
            onSubmit={async (justification) => {
              const decision = await submitJustification(justification)
              if (decision.ok) {
                toast.success({
                  title: 'Session arrêtée',
                  description: 'La justification a été acceptée.',
                })
              } else {
                toast.error({
                  title: 'Arrêt refusé',
                  description: decision.reason,
                })
              }
              return decision
            }}
          />
        )}
      </div>
    </PageTransition>
  )
}

function ActionCard({
  icon,
  title,
  description,
  buttonLabel,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  description: string
  buttonLabel: string
  onClick: () => void
}) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="info-panel overflow-hidden rounded-2xl p-6"
    >
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-accent">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-text-secondary">{description}</p>
          <Button type="button" className="mt-5" onClick={onClick}>
            <Plus size={16} />
            {buttonLabel}
          </Button>
        </div>
      </div>
    </motion.article>
  )
}

function QuickTaskModal({
  open,
  onClose,
  onSave,
}: {
  open: boolean
  onClose: () => void
  onSave: (draft: {
    title: string
    deadline: string
    complexity: TaskComplexity
    level: number
    estimatedMinutes?: number
    remainingMinutes?: number
    scheduledDurationMinutes?: number
    linkedObjectiveId: null
    blocking?: WorkBlockingConfig
  }) => Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [deadline, setDeadline] = useState(todayDateInputValue())
  const [complexity, setComplexity] = useState<TaskComplexity>('normal')
  const [manualMinutes, setManualMinutes] = useState(60)
  const [blocking, setBlocking] = useState<WorkBlockingConfig | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const level = complexity === 'easy' ? 3 : complexity === 'hard' ? 7 : complexity === 'extreme' ? 10 : 5
  const estimatedMinutes =
    complexity === 'manual' ? Math.max(1, Math.min(1440, manualMinutes)) : estimateMinutesForLevel(level)

  const reset = () => {
    setTitle('')
    setDeadline(todayDateInputValue())
    setComplexity('normal')
    setManualMinutes(60)
    setBlocking(undefined)
    setError(null)
  }

  const handleSave = async () => {
    const cleanTitle = title.trim()
    if (!cleanTitle) {
      setError('Donne un nom clair à la tâche.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave({
        title: cleanTitle,
        deadline,
        complexity,
        level,
        estimatedMinutes,
        remainingMinutes: estimatedMinutes,
        scheduledDurationMinutes: complexity === 'manual' ? estimatedMinutes : undefined,
        linkedObjectiveId: null,
        blocking,
      })
      reset()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell open={open} onClose={onClose} title="Créer une tâche">
      <div className="space-y-5">
        <Field label="Nom de la tâche">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Ex : finir le rapport de maths"
            className="w-full rounded-lg border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-accent"
          />
        </Field>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Date limite">
            <div className="relative">
              <CalendarDays
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
              />
              <input
                type="date"
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
                className="w-full rounded-lg border border-border-subtle bg-bg-base py-2 pl-9 pr-3 text-sm text-text-primary outline-none transition-colors focus:border-accent"
              />
            </div>
          </Field>

          <Field label="Complexité">
            <select
              value={complexity}
              onChange={(event) => setComplexity(event.target.value as TaskComplexity)}
              className="w-full rounded-lg border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-accent"
            >
              <option value="easy">Simple</option>
              <option value="normal">Normal</option>
              <option value="hard">Difficile</option>
              <option value="manual">Durée manuelle</option>
              <option value="extreme">Extrême — non recommandé</option>
            </select>
          </Field>
        </div>

        {complexity === 'manual' && (
          <Field label="Durée manuelle">
            <input
              type="number"
              min={1}
              max={1440}
              value={manualMinutes}
              onChange={(event) => setManualMinutes(Number(event.target.value))}
              className="w-full rounded-lg border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-accent"
            />
            <p className="mt-1 text-xs text-text-muted">Durée en minutes. Maximum : 1440.</p>
          </Field>
        )}

        <WorkBlockingFields value={blocking} onChange={setBlocking} subjectLabel="tâche" />

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            Créer la tâche
          </Button>
        </div>
      </div>
    </ModalShell>
  )
}

function QuickObjectiveModal({
  open,
  onClose,
  onSave,
}: {
  open: boolean
  onClose: () => void
  onSave: (draft: {
    name: string
    description?: string
    color: string
    level: number
  }) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [level, setLevel] = useState(5)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setName('')
    setDescription('')
    setLevel(5)
    setError(null)
  }

  const handleSave = async () => {
    const cleanName = name.trim()
    if (!cleanName) {
      setError('Donne un nom clair à l’objectif.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave({
        name: cleanName,
        description: description.trim() || undefined,
        color: '#22c55e',
        level,
      })
      reset()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell open={open} onClose={onClose} title="Créer un objectif">
      <div className="space-y-5">
        <Field label="Nom de l’objectif">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex : réussir la session d’examens"
            className="w-full rounded-lg border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-accent"
          />
        </Field>

        <Field label="Description">
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            placeholder="Pourquoi cet objectif compte, ce qu’il faut protéger, ce qu’il faut éviter…"
            className="w-full resize-none rounded-lg border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-accent"
          />
        </Field>

        <Field label="Niveau de protection">
          <input
            type="range"
            min={1}
            max={10}
            value={level}
            onChange={(event) => setLevel(Number(event.target.value))}
            className="w-full accent-accent"
          />
          <div className="mt-1 flex justify-between text-xs text-text-muted">
            <span>Souple</span>
            <span className="font-mono text-text-secondary">Niveau {level}</span>
            <span>Strict</span>
          </div>
        </Field>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            Créer l’objectif
          </Button>
        </div>
      </div>
    </ModalShell>
  )
}

function ModalShell({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6 py-10 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.96, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 18 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="max-h-full w-full max-w-3xl overflow-y-auto rounded-2xl border border-border-subtle bg-bg-card shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border-subtle bg-bg-card/95 px-6 py-4 backdrop-blur">
              <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-card-hover hover:text-text-primary"
                aria-label="Fermer"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-6">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-text-muted">
        {label}
      </span>
      {children}
    </label>
  )
}
