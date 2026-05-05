import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { AppWindow, Plus, Check, Trash2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useDeclaredAppsStore } from '@/store/declared-apps.store'
import { useLevelsStore } from '@/store/levels.store'

type Suggestion = {
  key: string
  name: string
  exeName: string
  emoji: string
}

const SUGGESTIONS: Suggestion[] = [
  { key: 'vscode', name: 'VS Code', exeName: 'Code.exe', emoji: '💻' },
  { key: 'chrome', name: 'Chrome', exeName: 'chrome.exe', emoji: '🌐' },
  { key: 'firefox', name: 'Firefox', exeName: 'firefox.exe', emoji: '🦊' },
  { key: 'notion', name: 'Notion', exeName: 'Notion.exe', emoji: '📝' },
  { key: 'discord', name: 'Discord', exeName: 'Discord.exe', emoji: '💬' },
  { key: 'figma', name: 'Figma', exeName: 'Figma.exe', emoji: '🎨' },
]

type Props = {
  defaultObjectiveId: string | null
}

export function AppsStep({ defaultObjectiveId }: Props): JSX.Element {
  const apps = useDeclaredAppsStore((s) => s.apps)
  const loaded = useDeclaredAppsStore((s) => s.loaded)
  const load = useDeclaredAppsStore((s) => s.load)
  const saveApp = useDeclaredAppsStore((s) => s.saveApp)
  const deleteApp = useDeclaredAppsStore((s) => s.deleteApp)
  const objectives = useLevelsStore((s) => s.objectives)

  const [busyKeys, setBusyKeys] = useState<Set<string>>(new Set())
  const [customName, setCustomName] = useState('')
  const [customExe, setCustomExe] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])

  const isAdded = (exeName: string): boolean =>
    apps.some((a) => a.exeName.toLowerCase() === exeName.toLowerCase())

  const findByExe = (exeName: string) =>
    apps.find((a) => a.exeName.toLowerCase() === exeName.toLowerCase())

  const setBusy = (k: string, v: boolean): void => {
    setBusyKeys((prev) => {
      const next = new Set(prev)
      if (v) next.add(k)
      else next.delete(k)
      return next
    })
  }

  const handleToggle = async (s: Suggestion): Promise<void> => {
    const existing = findByExe(s.exeName)
    setBusy(s.key, true)
    setError(null)
    try {
      if (existing) {
        await deleteApp(existing.id)
      } else {
        await saveApp({
          name: s.name,
          exeName: s.exeName,
          linkedObjectiveId: defaultObjectiveId,
          xpRatio: 0.25,
        })
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(s.key, false)
    }
  }

  const handleUpdate = async (
    id: string,
    patch: { linkedObjectiveId?: string | null; xpRatio?: number },
  ): Promise<void> => {
    const a = apps.find((x) => x.id === id)
    if (!a) return
    try {
      await saveApp({
        id,
        name: a.name,
        exeName: a.exeName,
        linkedObjectiveId: patch.linkedObjectiveId ?? a.linkedObjectiveId,
        xpRatio: patch.xpRatio ?? a.xpRatio,
      })
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleAddCustom = async (): Promise<void> => {
    const trimmedName = customName.trim()
    const trimmedExe = customExe.trim()
    if (!trimmedName || !trimmedExe) return
    setError(null)
    try {
      await saveApp({
        name: trimmedName,
        exeName: trimmedExe,
        linkedObjectiveId: defaultObjectiveId,
        xpRatio: 0.25,
      })
      setCustomName('')
      setCustomExe('')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
          <AppWindow size={22} />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{"Quelles apps tu utilises ?"}</h1>
        <p className="max-w-xl text-sm text-text-secondary">
          {"Ces apps seront suivies hors blocage avec un crédit XP réduit. Tu peux ajuster le ratio plus tard."}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => {
          const added = isAdded(s.exeName)
          const existing = findByExe(s.exeName)
          const busy = busyKeys.has(s.key)
          return (
            <motion.div
              key={s.key}
              layout
              className={cn(
                'rounded-xl border p-4 transition-colors',
                added
                  ? 'border-accent/40 bg-accent/5'
                  : 'border-border-subtle bg-bg-elevated',
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bg-base text-xl">
                    {s.emoji}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-text-primary">
                      {s.name}
                    </div>
                    <div className="truncate font-mono text-[10px] text-text-muted">
                      {s.exeName}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleToggle(s)}
                  disabled={busy}
                  className={cn(
                    'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors',
                    added
                      ? 'bg-accent text-white hover:bg-accent-hover'
                      : 'border border-border-subtle text-text-muted hover:border-border-strong hover:text-text-primary',
                  )}
                >
                  {added ? <Check size={14} strokeWidth={3} /> : <Plus size={14} />}
                </button>
              </div>

              {added && existing && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-3 flex flex-col gap-2 border-t border-border-subtle pt-3"
                >
                  <label className="block text-[10px] font-medium uppercase tracking-widest text-text-muted">
                    Objectif lié
                  </label>
                  <select
                    value={existing.linkedObjectiveId ?? ''}
                    onChange={(e) =>
                      void handleUpdate(existing.id, {
                        linkedObjectiveId: e.target.value || null,
                      })
                    }
                    className="rounded-md border border-border-subtle bg-bg-base px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent"
                  >
                    <option value="">Aucun</option>
                    {objectives.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>

                  <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-text-muted">
                    <span>Ratio XP</span>
                    <span className="tabular-nums text-text-secondary">
                      {existing.xpRatio.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={existing.xpRatio}
                    onChange={(e) =>
                      void handleUpdate(existing.id, {
                        xpRatio: Number(e.target.value),
                      })
                    }
                    className="w-full accent-accent"
                  />
                </motion.div>
              )}
            </motion.div>
          )
        })}
      </div>

      {/* Custom apps déjà ajoutées (hors suggestions) */}
      {apps.filter(
        (a) => !SUGGESTIONS.some((s) => s.exeName.toLowerCase() === a.exeName.toLowerCase()),
      ).length > 0 && (
        <div>
          <div className="mb-2 text-[10px] font-medium uppercase tracking-widest text-text-muted">
            Apps personnalisées
          </div>
          <div className="flex flex-col gap-1.5">
            {apps
              .filter(
                (a) =>
                  !SUGGESTIONS.some(
                    (s) => s.exeName.toLowerCase() === a.exeName.toLowerCase(),
                  ),
              )
              .map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-text-primary">
                      {a.name}
                    </div>
                    <div className="truncate font-mono text-[10px] text-text-muted">
                      {a.exeName}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void deleteApp(a.id)}
                    className="rounded-md p-1.5 text-text-muted hover:bg-red-500/10 hover:text-red-300"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-dashed border-border-subtle bg-bg-elevated/40 p-4">
        <div className="mb-2 text-[10px] font-medium uppercase tracking-widest text-text-muted">
          Ajouter une app personnalisée
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input
            type="text"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="Nom (ex. Spotify)"
            className="rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
          <input
            type="text"
            value={customExe}
            onChange={(e) => setCustomExe(e.target.value)}
            placeholder="Exécutable (ex. Spotify.exe)"
            className="rounded-md border border-border-subtle bg-bg-base px-3 py-2 font-mono text-xs text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
          <button
            type="button"
            onClick={() => void handleAddCustom()}
            disabled={!customName.trim() || !customExe.trim()}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold transition-colors',
              customName.trim() && customExe.trim()
                ? 'bg-accent text-white hover:bg-accent-hover'
                : 'cursor-not-allowed bg-bg-card text-text-muted',
            )}
          >
            <Plus size={14} />
            Ajouter
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}
    </div>
  )
}
