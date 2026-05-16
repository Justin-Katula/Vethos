import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Trash2, Check } from 'lucide-react'
import type { Objective, TimeRule } from '@shared/schemas'
import { cn } from '@/lib/cn'
import { PALETTE, ICON_OPTIONS } from '@/lib/rule-palette'
import { useShortcut } from '@/lib/use-shortcut'
import { areColorsSimilar } from '@/lib/color-similarity'

type SaveDraft = {
  id?: string
  name: string
  description?: string
  color: string
  icon?: string
  linkedRuleIds?: string[]
  level: number
  deadline?: string
}

type Props = {
  open: boolean
  initial: Objective | null
  existingObjectives: Objective[]
  rules: TimeRule[]
  onClose: () => void
  onSave: (draft: SaveDraft) => Promise<Objective>
  onDelete?: (id: string) => Promise<void>
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/

export function ObjectiveEditor({
  open,
  initial,
  existingObjectives,
  rules,
  onClose,
  onSave,
  onDelete,
}: Props): JSX.Element {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(PALETTE[0]!)
  const [icon, setIcon] = useState<string | undefined>(undefined)
  const [linkedRuleIds, setLinkedRuleIds] = useState<string[]>([])
  const [level, setLevel] = useState(5)
  const [deadline, setDeadline] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useShortcut('Escape', onClose, { enabled: open && !busy })

  useEffect(() => {
    if (!open) return
    if (initial) {
      setName(initial.name)
      setDescription(initial.description ?? '')
      setColor(initial.color)
      setIcon(initial.icon)
      setLinkedRuleIds(initial.linkedRuleIds)
      setLevel(initial.level)
      setDeadline(initial.deadline ?? '')
    } else {
      setName('')
      setDescription('')
      setColor(PALETTE[0]!)
      setIcon(undefined)
      setLinkedRuleIds([])
      setLevel(5)
      setDeadline('')
    }
    setError(null)
    setConfirmDelete(false)
  }, [open, initial])

  const colorValid = HEX_RE.test(color)
  const canSave = !busy && name.trim().length > 0 && colorValid
  const closeColorWarning = existingObjectives.some((objective) =>
    objective.id !== initial?.id && areColorsSimilar(objective.color, color),
  )

  const toggleRule = (id: string): void => {
    setLinkedRuleIds((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id],
    )
  }

  const handleSave = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const draft: SaveDraft = {
        name: name.trim(),
        description: description.trim() || undefined,
        color,
        icon,
        linkedRuleIds,
        level,
        deadline: deadline || undefined,
      }
      if (initial?.id) draft.id = initial.id
      await onSave(draft)
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (!initial || !onDelete) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setBusy(true)
    try {
      await onDelete(initial.id)
      onClose()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="fixed right-0 top-0 z-50 flex h-full w-[440px] max-w-full flex-col border-l border-border-subtle bg-bg-elevated shadow-elevated"
          >
            <header className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
              <div className="flex items-center gap-3">
                <div
                  className="h-8 w-8 rounded-2xl ring-2 ring-bg-base transition-colors"
                  style={{ backgroundColor: colorValid ? color : '#404040' }}
                />
                <h2 className="text-lg font-semibold tracking-tight">
                  {initial ? 'Modifier l’objectif' : 'Nouvel objectif'}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1.5 text-text-muted hover:bg-bg-card hover:text-text-primary"
              >
                <X size={18} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <Field label="Nom">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Maîtriser TypeScript, Forme physique..."
                  className={inputCls}
                  maxLength={60}
                />
              </Field>

              <Field label="Description" hint="Optionnel">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Pourquoi cet objectif compte pour toi ?"
                  className={cn(inputCls, 'min-h-[72px] resize-y')}
                  maxLength={500}
                />
              </Field>

              <Field label="Couleur">
                <div className="grid grid-cols-6 gap-2">
                  {PALETTE.map((c) => {
                    const selected = color.toLowerCase() === c.toLowerCase()
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor(c)}
                        className={cn(
                          'group relative h-10 w-full rounded-md ring-offset-2 ring-offset-bg-elevated transition-all',
                          selected ? 'ring-2 ring-text-primary' : 'hover:scale-105',
                        )}
                        style={{ backgroundColor: c }}
                        aria-label={`Couleur ${c}`}
                      >
                        {selected && (
                          <Check
                            size={16}
                            strokeWidth={3}
                            className="absolute inset-0 m-auto text-white drop-shadow"
                          />
                        )}
                      </button>
                    )
                  })}
                </div>
                {closeColorWarning && (
                  <div className="mt-3 rounded-md border border-orange/40 bg-orange/10 px-3 py-2 text-xs text-orange">
                    Cette couleur ressemble beaucoup à un objectif existant.
                  </div>
                )}
              </Field>

              <Field label="Icône">
                <div className="grid grid-cols-6 gap-2">
                  {ICON_OPTIONS.map(({ name: n, Icon }) => {
                    const selected = icon === n
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setIcon(selected ? undefined : n)}
                        className={cn(
                          'flex h-10 w-full items-center justify-center rounded-md border transition-colors',
                          selected
                            ? 'border-accent bg-accent/10 text-accent'
                            : 'border-border-subtle bg-bg-base text-text-muted hover:border-border-strong hover:text-text-primary',
                        )}
                        aria-label={`Icône ${n}`}
                      >
                        <Icon size={16} />
                      </button>
                    )
                  })}
                </div>
              </Field>

              <Field
                label="Règles liées"
                hint="Sessions terminées sur ces règles feront progresser cet objectif"
              >
                {rules.length === 0 ? (
                  <p className="rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-xs text-text-muted">
                    {"Aucune règle. Crée une règle dans l’onglet Programme d’abord."}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {rules.map((r) => {
                      const selected = linkedRuleIds.includes(r.id)
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => toggleRule(r.id)}
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-2xl border px-3 py-1 text-xs font-medium transition-colors',
                            selected
                              ? 'border-transparent text-white'
                              : 'border-border-subtle bg-bg-base text-text-secondary hover:border-border-strong',
                          )}
                          style={
                            selected
                              ? { backgroundColor: r.color }
                              : undefined
                          }
                        >
                          <span
                            className="h-2 w-2 rounded-2xl"
                            style={{
                              backgroundColor: selected ? 'white' : r.color,
                            }}
                          />
                          {r.name}
                        </button>
                      )
                    })}
                  </div>
                )}
              </Field>

              <Field label="Deadline" hint="Optionnel — les tâches gardent la priorité pour le calcul quotidien">
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className={inputCls}
                />
              </Field>
              
              <Field label="Intensité (Niveau)" hint="Le niveau recommandé est 5. Plus le niveau est haut, plus cet objectif consommera de temps libre.">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                     <span className="text-2xl font-bold text-text-primary">{level}</span>
                     <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${level === 5 ? 'bg-accent/20 text-accent' : 'bg-bg-base text-text-muted'}`}>
                        {level === 5 ? 'Recommandé' : 'Manuel'}
                     </span>
                  </div>
                  <input
                    type="range"
                    min="3"
                    max="7"
                    step="1"
                    value={level}
                    onChange={(e) => setLevel(parseInt(e.target.value))}
                    className="w-full accent-accent h-1.5 rounded-2xl bg-bg-base appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-text-muted font-mono">
                    <span>3</span>
                    <span>4</span>
                    <span className="text-accent font-bold">5</span>
                    <span>6</span>
                    <span>7</span>
                  </div>
                </div>
              </Field>

              {error && (
                <div className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {error}
                </div>
              )}
            </div>

            <footer className="flex items-center justify-between gap-2 border-t border-border-subtle px-6 py-4">
              {initial && onDelete ? (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={busy}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors',
                    confirmDelete
                      ? 'bg-red-500 text-white hover:bg-red-600'
                      : 'text-red-400 hover:bg-red-500/10',
                  )}
                >
                  <Trash2 size={14} />
                  {confirmDelete ? 'Confirmer' : 'Supprimer'}
                </button>
              ) : (
                <div />
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md px-4 py-2 text-sm text-text-secondary hover:bg-bg-card"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!canSave}
                  className={cn(
                    'rounded-md px-4 py-2 text-sm font-medium transition-colors',
                    canSave
                      ? 'bg-accent text-white hover:bg-accent-hover'
                      : 'cursor-not-allowed bg-bg-card text-text-muted',
                  )}
                >
                  {busy ? 'Sauvegarde...' : 'Sauvegarder'}
                </button>
              </div>
            </footer>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

const inputCls =
  'w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary outline-none transition-colors duration-200 focus:border-accent focus:ring-2 focus:ring-accent/30'

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="mb-5">
      <label className="block text-xs font-medium uppercase tracking-wider text-text-muted">
        {label}
      </label>
      <div className="mt-2">{children}</div>
      {hint && <p className="mt-1.5 text-xs text-text-muted">{hint}</p>}
    </div>
  )
}
