import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Trash2, Check } from 'lucide-react'
import type { BlockingProfile, TimeRule } from '@shared/schemas'
import { cn } from '@/lib/cn'
import { PALETTE, ICON_OPTIONS } from '@/lib/rule-palette'
import { useShortcut } from '@/lib/use-shortcut'
import { Button } from '@/components/ui/Button'

type SaveDraft = {
  id?: string
  name: string
  color: string
  icon?: string
  categoryType?: TimeRule['categoryType']
  linkedProfileId?: string | null
}

type Props = {
  open: boolean
  initial: TimeRule | null
  profiles: BlockingProfile[]
  onClose: () => void
  onSave: (draft: SaveDraft) => Promise<TimeRule>
  onDelete?: (id: string) => Promise<void>
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/

export function RuleEditor({ open, initial, profiles, onClose, onSave, onDelete }: Props) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(PALETTE[0]!)
  const [icon, setIcon] = useState<string | undefined>(undefined)
  const [categoryType, setCategoryType] = useState<TimeRule['categoryType']>('custom')
  const [linkedProfileId, setLinkedProfileId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useShortcut('Escape', onClose, { enabled: open && !busy })

  useEffect(() => {
    if (!open) return
    if (initial) {
      setName(initial.name)
      setColor(initial.color)
      setIcon(initial.icon)
      setCategoryType(initial.categoryType ?? 'custom')
      setLinkedProfileId(initial.linkedProfileId)
    } else {
      setName('')
      setColor(PALETTE[0]!)
      setIcon(undefined)
      setCategoryType('custom')
      setLinkedProfileId(null)
    }
    setError(null)
    setConfirmDelete(false)
  }, [open, initial])

  const colorValid = HEX_RE.test(color)
  const canSave = !busy && name.trim().length > 0 && colorValid

  const handleSave = async () => {
    setBusy(true)
    setError(null)
    try {
      const draft: SaveDraft = {
        name: name.trim(),
        color,
        icon,
        categoryType,
        linkedProfileId,
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

  const handleDelete = async () => {
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
            className="fixed right-0 top-0 z-50 flex h-full w-[420px] max-w-full flex-col border-l border-border-subtle bg-bg-elevated shadow-elevated"
          >
            <header className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
              <div className="flex items-center gap-3">
                <div
                  className="h-8 w-8 rounded-2xl ring-2 ring-bg-base transition-colors"
                  style={{ backgroundColor: colorValid ? color : '#404040' }}
                />
                <h2 className="text-lg font-semibold tracking-tight">
                  {initial ? 'Modifier la règle' : 'Nouvelle règle'}
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
                  placeholder="Travail deep, Sport..."
                  className={inputCls}
                  maxLength={40}
                />
              </Field>

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
                <input
                  type="text"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="#3b82f6"
                  className={cn(inputCls, 'mt-2 font-mono text-xs')}
                />
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

              <Field label="Catégorie" hint="Le calcul du temps libre soustrait sommeil, école, travail et engagements.">
                <select
                  value={categoryType ?? 'custom'}
                  onChange={(e) => setCategoryType(e.target.value as TimeRule['categoryType'])}
                  className={inputCls}
                >
                  <option value="custom">Personnalisé</option>
                  <option value="sleep">Sommeil</option>
                  <option value="school">École</option>
                  <option value="work">Travail</option>
                  <option value="commitment">Engagement protégé</option>
                  <option value="free">Temps libre</option>
                </select>
              </Field>

              <Field label="Profil de blocage lié" hint="Optionnel — démarre automatiquement ce profil pendant ce bloc horaire.">
                <select
                  value={linkedProfileId ?? ''}
                  onChange={(e) => setLinkedProfileId(e.target.value || null)}
                  className={inputCls}
                >
                  <option value="">Aucun</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
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
}) {
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
