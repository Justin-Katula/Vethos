import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Info } from 'lucide-react'
import { PageTransition } from '@/components/PageTransition'
import { RuleTable } from '@/components/interface/RuleTable'
import { WeekCalendar } from '@/components/interface/WeekCalendar'
import { RuleEditor } from '@/components/interface/RuleEditor'
import { useScheduleStore } from '@/store/schedule.store'
import { useBlockingStore } from '@/store/blocking.store'
import type { TimeRule } from '@shared/schemas'

export default function PlanningPage() {
  const {
    loaded,
    rules,
    entries,
    load,
    saveRule,
    deleteRule,
    saveEntry,
    deleteEntry,
  } = useScheduleStore()
  const blockingState = useBlockingStore((s) => s.state)
  const loadBlocking = useBlockingStore((s) => s.load)
  const blockingLoaded = useBlockingStore((s) => s.loaded)

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<TimeRule | null>(null)
  const [errorToast, setErrorToast] = useState<string | null>(null)

  useEffect(() => {
    void load()
    if (!blockingLoaded) void loadBlocking()
  }, [load, loadBlocking, blockingLoaded])

  useEffect(() => {
    if (!errorToast) return
    const t = setTimeout(() => setErrorToast(null), 3000)
    return () => clearTimeout(t)
  }, [errorToast])

  const openEditor = (rule: TimeRule | null) => {
    setEditingRule(rule)
    setEditorOpen(true)
  }

  const handleCreateEntry = async (draft: {
    ruleId: string
    dayOfWeek: number
    startMinute: number
    endMinute: number
  }) => {
    try {
      await saveEntry(draft)
    } catch (err) {
      setErrorToast((err as Error).message)
    }
  }

  const handleUpdateEntry = async (
    id: string,
    patch: { startMinute: number; endMinute: number },
  ) => {
    const existing = entries.find((e) => e.id === id)
    if (!existing) return
    try {
      await saveEntry({
        id,
        ruleId: existing.ruleId,
        dayOfWeek: existing.dayOfWeek,
        startMinute: patch.startMinute,
        endMinute: patch.endMinute,
      })
    } catch (err) {
      setErrorToast((err as Error).message)
    }
  }

  const handleChangeRule = async (id: string, ruleId: string) => {
    const existing = entries.find((e) => e.id === id)
    if (!existing) return
    try {
      await saveEntry({
        id,
        ruleId,
        dayOfWeek: existing.dayOfWeek,
        startMinute: existing.startMinute,
        endMinute: existing.endMinute,
      })
    } catch (err) {
      setErrorToast((err as Error).message)
    }
  }

  if (!loaded) {
    return (
      <PageTransition>
        <div className="flex h-full items-center justify-center text-sm text-text-muted">
          Chargement…
        </div>
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <div className="flex h-full flex-col gap-6 overflow-y-auto px-12 pb-16 pt-16">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">Mon planning</h1>
          <p className="mt-2 max-w-2xl text-sm text-text-secondary">
            {"Dessine ta semaine en blocs colorés. Une règle = une couleur. Glisse pour créer, redimensionne pour ajuster, clique pour supprimer."}
          </p>
        </header>

        <section>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-text-muted">
            Règles
          </h2>
          <RuleTable
            rules={rules}
            entries={entries}
            onCreate={() => openEditor(null)}
            onEdit={openEditor}
          />
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted">
              Semaine
            </h2>
            <div className="inline-flex items-center gap-1.5 text-xs text-text-muted">
              <Info size={11} />
              {"Glisse sur une cellule vide pour créer un bloc · pas de 15 min"}
            </div>
          </div>
          <WeekCalendar
            rules={rules}
            entries={entries}
            onCreateEntry={handleCreateEntry}
            onUpdateEntry={handleUpdateEntry}
            onChangeRule={handleChangeRule}
            onDeleteEntry={deleteEntry}
            onCreateRule={() => openEditor(null)}
          />
        </section>
      </div>

      <RuleEditor
        open={editorOpen}
        initial={editingRule}
        profiles={blockingState.profiles}
        onClose={() => setEditorOpen(false)}
        onSave={saveRule}
        onDelete={deleteRule}
      />

      <AnimatePresence>
        {errorToast && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-6 right-6 z-30 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200 shadow-elevated"
          >
            {errorToast}
          </motion.div>
        )}
      </AnimatePresence>
    </PageTransition>
  )
}
