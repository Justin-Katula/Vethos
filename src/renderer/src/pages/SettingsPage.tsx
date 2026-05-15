import { useEffect, useState, type ComponentType } from 'react'
import {
  Save,
  RefreshCw,
  Moon,
  Clock,
  Shield,
  HardDrive,
  FileText,
  History,
  type LucideProps,
} from 'lucide-react'
import { PageTransition } from '@/components/PageTransition'
import { useSettingsStore } from '@/store/settings.store'
import { useOnboardingStore } from '@/store/onboarding.store'
import { cn } from '@/lib/cn'
import { useShortcut } from '@/lib/use-shortcut'
import { useToast } from '@/lib/use-toast'
import { nexus } from '@/lib/ipc'

function ToggleRow({
  label,
  description,
  icon: Icon,
  value,
  onChange,
}: {
  label: string
  description: string
  icon: ComponentType<LucideProps>
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border-subtle bg-bg-card px-5 py-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Icon size={18} />
        </div>
        <div>
          <div className="text-sm font-medium text-text-primary">{label}</div>
          <div className="text-xs text-text-muted">{description}</div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={cn(
          'relative h-6 w-11 rounded-full transition-colors duration-200',
          value ? 'bg-accent' : 'bg-border-subtle',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200',
            value && 'translate-x-5',
          )}
        />
        <span className="sr-only">{value ? 'Actif' : 'Inactif'}</span>
      </button>
    </div>
  )
}

export default function SettingsPage() {
  const {
    username,
    savedAt,
    sleepStart,
    sleepEnd,
    sessionRulesEnabled,
    strictBlocking,
    antiBypass,
    autoSave,
    browserHistoryScanEnabled,
    loaded,
    load,
    save,
    updateSettings,
  } = useSettingsStore()

  const restartOnboarding = useOnboardingStore((s) => s.restart)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const toast = useToast()

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (loaded) setDraft(username)
  }, [loaded, username])

  const dirty = draft !== username

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
            Configure Nexus selon tes besoins. Toutes les modifications sont sauvegardées automatiquement.
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

        {/* --- Toggles --- */}
        <section className="max-w-lg space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Paramètres clés
          </h2>
          <ToggleRow
            icon={Clock}
            label="Règles de session"
            description="Pauses obligatoires après 4h (même projet) ou 6h (total)"
            value={sessionRulesEnabled}
            onChange={(v) => {
              if (!v) {
                toast.info({
                  title: 'Règles désactivées',
                  description: 'Sans ces règles, tu risques l’épuisement. Elles sont là pour que tu tiennes sur la durée.',
                })
              }
              void updateSettings({ sessionRulesEnabled: v })
            }}
          />
          <ToggleRow
            icon={Shield}
            label="Blocage strict"
            description="Empêche tout contournement pendant les sessions actives"
            value={strictBlocking}
            onChange={(v) => void updateSettings({ strictBlocking: v })}
          />
          <ToggleRow
            icon={Shield}
            label="Anti-bypass"
            description="Bloque regedit, Task Manager et nouveaux navigateurs pendant sessions"
            value={antiBypass}
            onChange={(v) => void updateSettings({ antiBypass: v })}
          />
          <ToggleRow
            icon={HardDrive}
            label="Sauvegarde auto"
            description="Sauvegarde automatique de toutes les données en continu"
            value={autoSave}
            onChange={(v) => void updateSettings({ autoSave: v })}
          />
          <ToggleRow
            icon={History}
            label="Scan historique navigateur"
            description="Propose des domaines visités à bloquer, en local seulement"
            value={browserHistoryScanEnabled}
            onChange={(v) => void updateSettings({ browserHistoryScanEnabled: v })}
          />
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
