import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bot, Check, ArrowRight, X, Clock, HelpCircle } from 'lucide-react'
import { useTasksStore } from '@/store/tasks.store'
import { useLevelsStore } from '@/store/levels.store'
import { usePlacement, localDateKey } from '@/lib/use-placement'
import { vethos } from '@/lib/ipc'
import { Button } from '@/components/ui/Button'
import type { Task, RegistryItem } from '@shared/schemas'
import { cn } from '@/lib/cn'

/**
 * Deliberate product surface: a short contextual pre-session clarification panel,
 * not a general chat. It disappears once the task is actionable, while every
 * Coach call returns the structured CoachResult safety envelope.
 */
export function CoachPrompt() {
  const { tasks, saveTask, loaded: tasksLoaded } = useTasksStore()
  const objectives = useLevelsStore((s) => s.objectives)
  const levelsLoaded = useLevelsStore((s) => s.loaded)

  // Temps courant
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date())
    }, 15_000)
    return () => clearInterval(interval)
  }, [])

  const todayStr = localDateKey(now)
  const currentMinute = now.getHours() * 60 + now.getMinutes()

  // Détecter les blocs planifiés pour aujourd'hui
  // On demande les blocks sur les 2 prochains jours pour être large
  const rangeEnd = useMemo(() => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    return localDateKey(d)
  }, [now])

  const { blocks } = usePlacement(now, rangeEnd, { todayStartMinute: 0 })

  // Retrouver la tâche concernée par le bloc en cours (ou commençant dans les 5 minutes)
  const targetTaskAndBlock = useMemo(() => {
    if (!tasksLoaded || !levelsLoaded) return null

    // Chercher d'abord un bloc actif, sinon un bloc commençant d'ici 5 minutes
    const currentOrUpcomingBlock = blocks.find((b) => {
      if (b.date !== todayStr) return false
      const isWorkBlock = b.kind === 'task' || b.kind === 'objective'
      if (!isWorkBlock) return false

      // En cours ou démarre dans les 5 minutes
      const startsSoon = b.startMinute - 5 <= currentMinute && currentMinute < b.endMinute
      return startsSoon
    })

    if (!currentOrUpcomingBlock) return null

    // Résoudre le taskId
    const taskId =
      currentOrUpcomingBlock.kind === 'task'
        ? currentOrUpcomingBlock.refId
        : currentOrUpcomingBlock.linkedTaskId

    if (!taskId) return null

    const task = tasks.find((t) => t.id === taskId)
    if (!task || task.status !== 'active') return null

    return { task, block: currentOrUpcomingBlock }
  }, [blocks, todayStr, currentMinute, tasks, tasksLoaded, levelsLoaded])

  // États locaux
  const [analyzedTaskIds, setAnalyzedTaskIds] = useState<Set<string>>(() => new Set())
  const [suggestedQuestions, setSuggestedQuestions] = useState<Record<string, string>>({})
  const [skippedTaskIds, setSkippedTaskIds] = useState<Set<string>>(() => new Set())
  const [notes, setNotes] = useState('')
  const [generating, setGenerating] = useState(false)
  const [showChecklistMode, setShowChecklistMode] = useState(false)

  // Effet pour appeler analyzeTaskClarity une seule fois par tâche
  useEffect(() => {
    if (!targetTaskAndBlock) return
    const { task } = targetTaskAndBlock

    // Si pas encore analysé et pas de coachStatus persistant
    if (task.coachStatus === undefined && !analyzedTaskIds.has(task.id)) {
      setAnalyzedTaskIds((prev) => {
        const next = new Set(prev)
        next.add(task.id)
        return next
      })

      // Marquer temporairement comme learning pour éviter les doubles requêtes
      void saveTask({ id: task.id, title: task.title, deadline: task.deadline, coachStatus: 'learning' })

      // Appeler l'IA
      void vethos.coach
        .analyzeTask({ taskTitle: task.title })
        .then((res) => {
          if (res.data.clear) {
            void saveTask({ id: task.id, title: task.title, deadline: task.deadline, coachStatus: 'optimized' })
          } else if (res.data.suggestedQuestion) {
            setSuggestedQuestions((prev) => ({
              ...prev,
              [task.id]: res.data.suggestedQuestion!,
            }))
            // Garder coachStatus: 'learning'
          }
        })
        .catch(() => {
          // Fallback silencieux en cas d'erreur
          void saveTask({ id: task.id, title: task.title, deadline: task.deadline, coachStatus: 'optimized' })
        })
    }
  }, [targetTaskAndBlock, analyzedTaskIds, saveTask])

  // Déterminer s'il faut afficher le prompt à l'écran
  const activePrompt = useMemo(() => {
    if (!targetTaskAndBlock) return null
    const { task, block } = targetTaskAndBlock

    // Si sauté pour la session courante ou déjà optimisé
    if (skippedTaskIds.has(task.id) || task.coachStatus === 'optimized') {
      return null
    }

    // Si en apprentissage (vague)
    if (task.coachStatus === 'learning') {
      return {
        task,
        block,
        question:
          suggestedQuestions[task.id] ??
          'Que vas-tu accomplir précisément durant cette session ?',
      }
    }

    return null
  }, [targetTaskAndBlock, skippedTaskIds, suggestedQuestions])

  const handleSkip = () => {
    if (activePrompt) {
      setSkippedTaskIds((prev) => {
        const next = new Set(prev)
        next.add(activePrompt.task.id)
        return next
      })
      setNotes('')
    }
  }

  const handleGenerate = async () => {
    if (!activePrompt || !notes.trim()) return
    const { task, block } = activePrompt
    setGenerating(true)

    try {
      const duration = block.endMinute - block.startMinute
      const coachResult = await vethos.coach.generateSubtasks({
        taskTitle: task.title,
        contextNotes: notes.trim(),
        totalMinutes: duration,
      })
      const subTasks = coachResult.data

      if (subTasks && subTasks.length > 0) {
        const mapped = subTasks.map((st) => ({
          id: crypto.randomUUID(),
          title: st.title,
          durationMinutes: st.durationMinutes,
          status: 'pending' as const,
        }))

        await saveTask({
          id: task.id,
          title: task.title,
          deadline: task.deadline,
          contextNotes: notes.trim(),
          subTasks: mapped,
          coachStatus: 'optimized',
        })
        setShowChecklistMode(true)
      } else {
        // Fallback sans sous-tâches
        await saveTask({
          id: task.id,
          title: task.title,
          deadline: task.deadline,
          contextNotes: notes.trim(),
          coachStatus: 'optimized',
        })
        handleCloseChecklist()
      }
    } catch (err) {
      console.error('Failed to generate subtasks', err)
    } finally {
      setGenerating(false)
    }
  }

  const handleCloseChecklist = () => {
    setShowChecklistMode(false)
    setNotes('')
  }

  const handleToggleSubtask = async (subtaskId: string) => {
    if (!targetTaskAndBlock) return
    const { task } = targetTaskAndBlock
    if (!task.subTasks) return

    const updatedSubtasks = task.subTasks.map((st) => {
      if (st.id === subtaskId) {
        return {
          ...st,
          status: st.status === 'completed' ? ('pending' as const) : ('completed' as const),
        }
      }
      return st
    })

    await saveTask({
      id: task.id,
      title: task.title,
      deadline: task.deadline,
      subTasks: updatedSubtasks,
    })
  }

  // Si showChecklistMode est activé mais que la tâche n'a plus de sous-tâches, fermer
  useEffect(() => {
    if (showChecklistMode && targetTaskAndBlock && !targetTaskAndBlock.task.subTasks) {
      setShowChecklistMode(false)
    }
  }, [showChecklistMode, targetTaskAndBlock])

  return (
    <AnimatePresence>
      {/* 1. Fenêtre de Prompt de clarification */}
      {activePrompt && !showChecklistMode && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className={cn(
            'fixed bottom-6 right-6 z-[90] w-[380px]',
            'rounded-2xl border border-white/10 bg-black/70 p-5 shadow-2xl backdrop-blur-md',
            'text-white'
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/20 text-accent">
                <Bot size={15} />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider text-accent">
                Coach Vethos
              </span>
            </div>
            <button
              onClick={handleSkip}
              className="text-text-muted hover:text-white transition-colors"
              title="Ignorer pour cette session"
            >
              <X size={14} />
            </button>
          </div>

          {/* Corps du message */}
          <div className="mt-4">
            <div className="text-xs text-text-muted">
              Préparation de votre session de focus :
            </div>
            <div className="mt-1 font-semibold text-sm">
              « {activePrompt.task.title} » ·{' '}
              {activePrompt.block.endMinute - activePrompt.block.startMinute} min
            </div>

            <div className="mt-3 rounded-lg bg-white/5 border border-white/5 p-3 text-xs leading-relaxed text-text-secondary">
              <HelpCircle size={14} className="text-accent inline mr-1 -mt-0.5" />
              {activePrompt.question}
            </div>

            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Réviser les intégrales, faire l'exercice 4..."
              className={cn(
                'mt-3 h-20 w-full rounded-lg border border-white/10 bg-black/40 p-2.5 text-xs text-white outline-none transition-colors resize-none',
                'focus:border-accent'
              )}
            />
          </div>

          {/* Boutons d'action */}
          <div className="mt-4 flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSkip}
              className="text-text-secondary hover:text-white border-transparent bg-transparent"
            >
              Passer
            </Button>
            <Button
              variant="solid"
              size="sm"
              disabled={!notes.trim() || generating}
              onClick={handleGenerate}
              className="px-4 shrink-0"
            >
              {generating ? 'Calcul du plan...' : 'Découper mon temps'}
              <ArrowRight size={12} className="ml-1" />
            </Button>
          </div>
        </motion.div>
      )}

      {/* 2. Fenêtre d'affichage de la check-list après découpage */}
      {showChecklistMode && targetTaskAndBlock && targetTaskAndBlock.task.subTasks && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className={cn(
            'fixed bottom-6 right-6 z-[90] w-[380px] max-h-[420px] flex flex-col',
            'rounded-2xl border border-white/10 bg-black/70 p-5 shadow-2xl backdrop-blur-md',
            'text-white'
          )}
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
                <Bot size={15} />
              </div>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  Votre Plan Focus
                </span>
              </div>
            </div>
            <button
              onClick={handleCloseChecklist}
              className="text-text-muted hover:text-white transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          {/* Liste des sous-tâches */}
          <div className="flex-1 overflow-y-auto mt-3 pr-1 space-y-2.5">
            {targetTaskAndBlock.task.subTasks.map((st) => {
              const completed = st.status === 'completed'
              return (
                <div
                  key={st.id}
                  onClick={() => handleToggleSubtask(st.id)}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border border-white/5 bg-white/5 p-2.5 cursor-pointer transition-colors',
                    completed ? 'bg-white/2 border-white/2 opacity-50' : 'hover:bg-white/10'
                  )}
                >
                  <div
                    className={cn(
                      'flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border transition-colors mt-0.5',
                      completed
                        ? 'border-emerald-500 bg-emerald-500 text-black'
                        : 'border-white/20 bg-transparent'
                    )}
                  >
                    {completed && <Check size={10} strokeWidth={3} />}
                  </div>
                  <div className="min-w-0 flex-1 leading-snug">
                    <div className={cn('text-xs font-medium', completed && 'line-through text-text-muted')}>
                      {st.title}
                    </div>
                    <div className="text-[10px] text-text-muted mt-1 flex items-center gap-1">
                      <Clock size={10} />
                      {st.durationMinutes} minutes
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-white/10 flex justify-end">
            <Button variant="solid" size="sm" onClick={handleCloseChecklist} className="px-5 bg-emerald-500 hover:bg-emerald-600 text-black border-transparent">
              Prêt à focus !
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
