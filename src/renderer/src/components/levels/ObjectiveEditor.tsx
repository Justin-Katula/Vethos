import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Trash2, Check } from 'lucide-react'
import {
  DEFAULT_OBJECTIVE_LEVEL,
  OBJECTIVE_DAILY_MINUTES_BY_LEVEL,
  OBJECTIVE_LEVEL_MAX,
  OBJECTIVE_LEVEL_MIN,
  clampObjectiveLevel,
  type Objective,
  type TimeRule,
  type WorkBlockingConfig,
  type UnlockPolicy,
} from '@shared/schemas'
import { cn } from '@/lib/cn'
import { PALETTE, ICON_OPTIONS } from '@/lib/rule-palette'
import { useShortcut } from '@/lib/use-shortcut'
import { areColorsSimilar } from '@/lib/color-similarity'
import { WorkBlockingFields } from '@/components/blocking/WorkBlockingFields'
import { Button } from '@/components/ui/Button'
import { UnlockPolicyForm } from '@/components/blocking/UnlockPolicyForm'

type SaveDraft = {
  id?: string
  name: string
  description?: string
  color: string
  icon?: string
  linkedRuleIds?: string[]
  level: number
  blocking?: WorkBlockingConfig
  unlockPolicy?: UnlockPolicy
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
  const [level, setLevel] = useState(DEFAULT_OBJECTIVE_LEVEL)
  const [blocking, setBlocking] = useState<WorkBlockingConfig | undefined>(undefined)
  const [unlockPolicy, setUnlockPolicy] = useState<UnlockPolicy | undefined>(undefined)
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
      setLevel(clampObjectiveLevel(initial.level))
      setBlocking(initial.blocking)
      setUnlockPolicy(initial.unlockPolicy)
    } else {
      setName('')
      setDescription('')
      setColor(PALETTE[0]!)
      setIcon(undefined)
      setLinkedRuleIds([])
      setLevel(DEFAULT_OBJECTIVE_LEVEL)
      setBlocking(undefined)
      setUnlockPolicy(undefined)
    }
    setError(null)
    setConfirmDelete(false)
  }, [open, initial])

  const colorValid = HEX_RE.test(color)
  const canSave = !busy && name.trim().length > 0 && colorValid
  const dailyMinutes = OBJECTIVE_DAILY_MINUTES_BY_LEVEL[level] ?? 0
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
        blocking,
        unlockPolicy,
      }
      if (initial) {
        draft.id = initial.id
      }
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
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
              >
                <X size={18} />
              </Button>
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

              <WorkBlockingFields
                value={blocking}
                onChange={setBlocking}
                subjectLabel="objectif"
              />

              <div className="mb-5">
                <UnlockPolicyForm
                  value={unlockPolicy}
                  onChange={setUnlockPolicy}
                />
              </div>

              <Field label="Couleur">
                <div className="grid grid-cols-6 gap-2">
                  {PALETTE.map((c) => {
                    const selected = color.toLowerCase() === c.toLowerCase()
                    return (
                      <Button
                        key={c}
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setColor(c)}
                        className={cn(
                          'relative h-10 w-full rounded-md p-0 ring-offset-2 ring-offset-bg-elevated',
                          selected ? 'ring-2 ring-text-primary' : 'hover:scale-105',
                        )}
                        contentClassName="absolute inset-0"
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
                      </Button>
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
                      <Button
                        key={n}
                        type="button"
                        variant={selected ? 'solid' : 'default'}
                        size="sm"
                        onClick={() => setIcon(selected ? undefined : n)}
                        className={cn(
                          'h-10 w-full rounded-md p-0',
                          selected
                            ? 'border-accent/60 bg-accent/15 text-accent hover:bg-accent/20'
                            : 'bg-bg-base text-text-muted',
                        )}
                        aria-label={`Icône ${n}`}
                      >
                        <Icon size={16} />
                      </Button>
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
                        <Button
                          key={r.id}
                          type="button"
                          variant={selected ? 'solid' : 'default'}
                          size="sm"
                          onClick={() => toggleRule(r.id)}
                          className={cn(
                            'rounded-2xl px-3 py-1',
                            selected
                              ? 'border-transparent text-white'
                              : 'bg-bg-base text-text-secondary',
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
                        </Button>
                      )
                    })}
                  </div>
                )}
              </Field>

              <Field label="Intensité (niveau)" hint="Le niveau définit le maximum quotidien réservé à cet objectif quand la journée le permet.">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                     <span className="text-2xl font-bold text-text-primary">{level}</span>
                     <span className="rounded bg-bg-base px-2 py-0.5 text-[10px] font-bold uppercase text-text-muted">
                        {dailyMinutes} min/jour
                     </span>
                  </div>
                  <input
                    type="range"
                    min={OBJECTIVE_LEVEL_MIN}
                    max={OBJECTIVE_LEVEL_MAX}
                    step="1"
                    value={level}
                    onChange={(e) => setLevel(clampObjectiveLevel(parseInt(e.target.value)))}
                    className="w-full accent-accent h-1.5 rounded-2xl bg-bg-base appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-text-muted font-mono">
                    {[3, 4, 5, 6, 7].map((n) => (
                      <span key={n} className={n === level ? 'font-bold text-accent' : undefined}>
                        {n}
                      </span>
                    ))}
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
                <Button
                  type="button"
                  variant="danger"
                  onClick={handleDelete}
                  disabled={busy}
                  className={cn(
                    confirmDelete
                      ? 'bg-red-500 text-white hover:bg-red-600'
                      : 'text-red-400 hover:bg-red-500/10',
                  )}
                >
                  <Trash2 size={14} />
                  {confirmDelete ? 'Confirmer' : 'Supprimer'}
                </Button>
              ) : (
                <div />
              )}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onClose}
                >
                  Annuler
                </Button>
                <Button
                  type="button"
                  variant="solid"
                  onClick={handleSave}
                  disabled={!canSave}
                >
                  {busy ? 'Sauvegarde...' : 'Sauvegarder'}
                </Button>
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
