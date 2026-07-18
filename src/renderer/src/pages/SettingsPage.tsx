import { useEffect, useState } from 'react'
import {
  Save,
  RefreshCw,
  Moon,
  FileText,
  Sparkles,
} from 'lucide-react'
import { PageTransition } from '@/components/PageTransition'
import { useSettingsStore } from '@/store/settings.store'
import { useOnboardingStore } from '@/store/onboarding.store'
import { cn } from '@/lib/cn'
import { useShortcut } from '@/lib/use-shortcut'
import { nexus } from '@/lib/ipc'
import {
  canChangeFreeTimeLevel,
  daysUntilFreeTimeLevelChange,
} from '@/lib/placement-engine'

export default function SettingsPage() {
  const {
    username,
    savedAt,
    sleepStart,
    sleepEnd,
    freeTimeLevel,
    freeTimeLevelChangedAt,
    loaded,
    load,
    save,
    updateSettings,
  } = useSettingsStore()

  const restartOnboarding = useOnboardingStore((s) => s.restart)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [restarting, setRestarting] = useState(false)

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (loaded) setDraft(username)
  }, [loaded, username])

  const dirty = draft !== username

  const now = new Date()
  const canChangeLevel = canChangeFreeTimeLevel(freeTimeLevelChangedAt ?? undefined, now)
  const daysLeft = daysUntilFreeTimeLevelChange(freeTimeLevelChangedAt ?? undefined, now)

  const handleSave = async () => {
    setSaving(true)
    try {
      await save(draft)
    } finally {
      setSaving(false)
    }
  }

  useShortcut('Mod+S', () => void handleSave(), { enabled: dirty && !saving })

  const handleRestart = async () => {
    setRestarting(true)
    try {
      await restartOnboarding()
    } finally {
      setRestarting(false)
    }
  }

  return (
    <PageTransition>
      <div className="flex h-full flex-col gap-8 overflow-y-auto px-12 pb-16 pt-16">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">Paramètres</h1>
          <p className="mt-2 text-sm text-text-secondary">
            Configure Vethos selon tes besoins. Toutes les modifications sont sauvegardées automatiquement.
          </p>
        </header>

        {/* --- Profil --- */}
        <section className="max-w-lg space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted">Profil</h2>
          <div className="rounded-lg border border-border-subtle bg-bg-card p-6 shadow-card">
            <label className="block text-xs font-medium uppercase tracking-wider text-text-muted">
              {"Nom d'utilisateur"}
            </label>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className={cn(
                'mt-2 w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2',
                'text-sm text-text-primary outline-none transition-colors duration-200',
                'focus:border-accent focus:ring-2 focus:ring-accent/30',
              )}
              placeholder="Ton prénom"
            />
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={!dirty || saving}
                className={cn(
                  'inline-flex items-center gap-2 rounded-md px-4 py-2',
                  'text-sm font-medium transition-all duration-200 ease-out',
                  dirty && !saving
                    ? 'bg-accent text-white hover:bg-accent-hover'
                    : 'cursor-not-allowed bg-bg-card-hover text-text-muted',
                )}
              >
                <Save size={16} strokeWidth={2} />
                {saving ? 'Sauvegarde...' : 'Sauvegarder'}
              </button>
              {savedAt && (
                <span className="font-mono text-xs text-text-muted">
                  Dernière sauvegarde : {new Date(savedAt).toLocaleString('fr-FR')}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* --- Heures de sommeil --- */}
        <section className="max-w-lg space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Heures de sommeil
          </h2>
          <div className="flex items-center gap-4 rounded-lg border border-border-subtle bg-bg-card px-5 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <Moon size={18} />
            </div>
            <div className="flex items-center gap-2 text-sm text-text-primary">
              <input
                type="time"
                value={sleepStart}
                onChange={(e) => void updateSettings({ sleepStart: e.target.value })}
                className="rounded-md border border-border-subtle bg-bg-base px-2 py-1 text-sm text-text-primary outline-none focus:border-accent"
              />
              <span className="text-text-muted">→</span>
              <input
                type="time"
                value={sleepEnd}
                onChange={(e) => void updateSettings({ sleepEnd: e.target.value })}
                className="rounded-md border border-border-subtle bg-bg-base px-2 py-1 text-sm text-text-primary outline-none focus:border-accent"
              />
            </div>
            <span className="ml-auto text-xs text-text-muted">{sleepStart} — {sleepEnd}</span>
          </div>
        </section>

        {/* --- Niveau de temps libre --- */}
        <section className="max-w-lg space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Niveau de temps libre
          </h2>
          <div className="rounded-lg border border-border-subtle bg-bg-card px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <Sparkles size={18} />
              </div>
              <p className="text-xs text-text-muted">
                Détermine la part de temps qui te reste vraiment libre, en concurrence avec tes tâches et objectifs. Plus haut = plus de repos. Modifiable une fois toutes les 2 semaines.
              </p>
            </div>
            <div className="mt-4 flex items-center gap-2">
              {([4, 5, 6, 7] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  disabled={!canChangeLevel}
                  onClick={() =>
                    void updateSettings({
                      freeTimeLevel: lvl,
                      freeTimeLevelChangedAt: new Date().toISOString(),
                    })
                  }
                  className={cn(
                    'h-10 w-10 rounded-lg border text-sm font-semibold transition-colors',
                    freeTimeLevel === lvl
                      ? 'border-accent bg-accent text-white'
                      : 'border-border-subtle bg-bg-base text-text-secondary hover:border-border-strong',
                    !canChangeLevel && 'cursor-not-allowed opacity-50',
                  )}
                >
                  {lvl}
                </button>
              ))}
            </div>
            {!canChangeLevel && (
              <p className="mt-3 text-[10px] text-text-muted">
                Verrouillé. Modifiable dans {daysLeft} jour{daysLeft > 1 ? 's' : ''}.
              </p>
            )}
          </div>
        </section>

        {/* --- Diagnostic --- */}
        <section className="max-w-lg space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Diagnostic
          </h2>
          <div className="rounded-lg border border-border-subtle bg-bg-card p-6 shadow-card">
            <p className="text-xs text-text-muted">
              Les logs aident à comprendre un blocage, une session interrompue ou une erreur de sauvegarde.
            </p>
            <button
              type="button"
              onClick={() => void nexus.app.openLogs()}
              className={cn(
                'mt-4 inline-flex items-center gap-2 rounded-md border px-4 py-2',
                'border-border-subtle text-sm font-medium text-text-secondary transition-colors',
                'hover:border-border-strong hover:text-text-primary',
              )}
            >
              <FileText size={14} />
              Ouvrir les logs
            </button>
          </div>
        </section>

        {/* --- Onboarding --- */}
        <section className="max-w-lg space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Onboarding
          </h2>
          <div className="rounded-lg border border-border-subtle bg-bg-card p-6 shadow-card">
            <p className="text-xs text-text-muted">
              {"Réafficher le tour d'introduction. Ne supprime ni tes règles, ni tes objectifs."}
            </p>
            <button
              type="button"
              onClick={() => void handleRestart()}
              disabled={restarting}
              className={cn(
                'mt-4 inline-flex items-center gap-2 rounded-md border px-4 py-2',
                'text-sm font-medium transition-colors',
                restarting
                  ? 'cursor-wait border-border-subtle text-text-muted'
                  : 'border-border-subtle text-text-secondary hover:border-border-strong hover:text-text-primary',
              )}
            >
              <RefreshCw size={14} className={restarting ? 'animate-spin' : ''} />
              {restarting ? 'Lancement…' : "Relancer l'onboarding"}
            </button>
          </div>
        </section>
      </div>
    </PageTransition>
  )
}
