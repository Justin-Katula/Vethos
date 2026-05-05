import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Target, Check } from 'lucide-react'
import { cn } from '@/lib/cn'
import { PALETTE } from '@/lib/rule-palette'
import { useScheduleStore } from '@/store/schedule.store'
import { useLevelsStore } from '@/store/levels.store'

type Props = {
  preselectedRuleIds: string[]
  onObjectiveCreated: (id: string, color: string) => void
}

export function ObjectiveStep({
  preselectedRuleIds,
  onObjectiveCreated,
}: Props): JSX.Element {
  const rules = useScheduleStore((s) => s.rules)
  const loadLevels = useLevelsStore((s) => s.load)
  const levelsLoaded = useLevelsStore((s) => s.loaded)
  const saveObjective = useLevelsStore((s) => s.saveObjective)
  const objectives = useLevelsStore((s) => s.objectives)

  const initialColor = useMemo(() => {
    if (preselectedRuleIds.length === 0) return PALETTE[10]! // violet par défaut
    const firstRule = rules.find((r) => r.id === preselectedRuleIds[0])
    return firstRule?.color ?? PALETTE[10]!
  }, [preselectedRuleIds, rules])

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(initialColor)
  const [linkedRuleIds, setLinkedRuleIds] = useState<string[]>(preselectedRuleIds)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!levelsLoaded) void loadLevels()
  }, [levelsLoaded, loadLevels])

  // Si on est arrivé après un re-render, recale color et rules sur la sélection
  useEffect(() => {
    setColor(initialColor)
    setLinkedRuleIds(preselectedRuleIds)
  }, [initialColor, preselectedRuleIds])

  // Auto-update si l'objectif a déjà été créé et qu'un champ change
  useEffect(() => {
    if (!savedId) return
    if (!name.trim()) return
    const t = setTimeout(() => {
      void (async () => {
        try {
          await saveObjective({
            id: savedId,
            name: name.trim(),
            description: description.trim() || undefined,
            color,
            linkedRuleIds,
          })
        } catch (err) {
          setError((err as Error).message)
        }
      })()
    }, 500)
    return () => clearTimeout(t)
  }, [savedId, name, description, color, linkedRuleIds, saveObjective])

  const toggleRule = (id: string): void => {
    setLinkedRuleIds((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id],
    )
  }

  const handleCreate = async (): Promise<void> => {
    if (!name.trim()) return
    if (savedId) return
    setBusy(true)
    setError(null)
    try {
      const created = await saveObjective({
        name: name.trim(),
        description: description.trim() || undefined,
        color,
        linkedRuleIds,
      })
      setSavedId(created.id)
      onObjectiveCreated(created.id, color)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const alreadyExists = objectives.length > 0 && !savedId
  const canCreate = name.trim().length > 0 && !busy && !savedId

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col items-center gap-3 text-center">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-full"
          style={{ backgroundColor: `${color}22`, color }}
        >
          <Target size={22} />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">
          {"Donne un cap à tes sessions."}
        </h1>
        <p className="max-w-xl text-sm text-text-secondary">
          {"Crée un objectif. Chaque minute concentrée sur les règles liées le fera grandir vers le niveau 10."}
        </p>
      </header>

      <div className="flex flex-col gap-4 rounded-xl border border-border-subtle bg-bg-elevated p-5">
        <div>
          <label className="block text-[10px] font-medium uppercase tracking-widest text-text-muted">
            Nom
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Devenir senior dev, Forme physique, Apprendre la guitare..."
            maxLength={60}
            autoFocus
            className="mt-2 w-full rounded-lg border border-border-subtle bg-bg-base px-4 py-3 text-base text-text-primary outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
        </div>

        <div>
          <label className="block text-[10px] font-medium uppercase tracking-widest text-text-muted">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optionnel — pourquoi cet objectif compte pour toi ?"
            maxLength={500}
            className="mt-2 min-h-[64px] w-full resize-y rounded-lg border border-border-subtle bg-bg-base px-4 py-3 text-sm text-text-primary outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
        </div>

        <div>
          <label className="block text-[10px] font-medium uppercase tracking-widest text-text-muted">
            Couleur
          </label>
          <div className="mt-2 grid grid-cols-12 gap-2">
            {PALETTE.map((c) => {
              const selected = color.toLowerCase() === c.toLowerCase()
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    'relative h-8 w-full rounded-md transition-all',
                    selected ? 'ring-2 ring-text-primary ring-offset-2 ring-offset-bg-elevated' : 'hover:scale-110',
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={`Couleur ${c}`}
                >
                  {selected && (
                    <Check
                      size={14}
                      strokeWidth={3}
                      className="absolute inset-0 m-auto text-white drop-shadow"
                    />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-medium uppercase tracking-widest text-text-muted">
            Règles liées ({linkedRuleIds.length}/{rules.length})
          </label>
          {rules.length === 0 ? (
            <p className="mt-2 rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-xs text-text-muted">
              {"Aucune règle. Reviens à l’étape précédente pour choisir un template."}
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {rules.map((r) => {
                const selected = linkedRuleIds.includes(r.id)
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggleRule(r.id)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      selected
                        ? 'border-transparent text-white'
                        : 'border-border-subtle bg-bg-base text-text-secondary hover:border-border-strong',
                    )}
                    style={selected ? { backgroundColor: r.color } : undefined}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: selected ? 'white' : r.color }}
                    />
                    {r.name}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="text-[11px] text-text-muted">
            {savedId
              ? '✓ Sauvegardé. Tu peux encore ajuster.'
              : alreadyExists
              ? 'Tu as déjà un objectif. Cette étape est optionnelle.'
              : 'Tu peux aussi sauter cette étape.'}
          </p>
          <motion.button
            type="button"
            onClick={() => void handleCreate()}
            disabled={!canCreate}
            whileHover={canCreate ? { y: -1 } : undefined}
            className={cn(
              'inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors',
              canCreate
                ? 'bg-accent text-white hover:bg-accent-hover'
                : savedId
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'cursor-not-allowed bg-bg-card text-text-muted',
            )}
          >
            {savedId ? (
              <>
                <Check size={14} strokeWidth={3} />
                Créé
              </>
            ) : busy ? (
              'Création…'
            ) : (
              'Créer cet objectif'
            )}
          </motion.button>
        </div>
      </div>
    </div>
  )
}
