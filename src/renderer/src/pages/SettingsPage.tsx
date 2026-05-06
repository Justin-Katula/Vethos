import { useEffect, useState } from 'react'
import { Save, RefreshCw } from 'lucide-react'
import { PageTransition } from '@/components/PageTransition'
import { useSettingsStore } from '@/store/settings.store'
import { useOnboardingStore } from '@/store/onboarding.store'
import { cn } from '@/lib/cn'
import { useShortcut } from '@/lib/use-shortcut'

export default function SettingsPage() {
  const { username, savedAt, loaded, load, save } = useSettingsStore()
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
      <div className="flex h-full flex-col gap-6 overflow-y-auto px-12 pb-16 pt-16">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">Paramètres</h1>
          <p className="mt-2 text-sm text-text-secondary">
            Données persistées dans <code className="font-mono text-xs">nexus_settings.json</code>.
          </p>
        </header>

        <div className="max-w-md rounded-lg border border-border-subtle bg-bg-card p-6 shadow-card">
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

          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            className={cn(
              'mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2',
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
            <p className="mt-4 font-mono text-xs text-text-muted">
              Dernière sauvegarde : {new Date(savedAt).toLocaleString('fr-FR')}
            </p>
          )}
        </div>

        <div className="max-w-md rounded-lg border border-border-subtle bg-bg-card p-6 shadow-card">
          <h2 className="text-sm font-semibold tracking-tight">Onboarding</h2>
          <p className="mt-1 text-xs text-text-muted">
            {"Réafficher le tour d’introduction. Ne supprime ni tes règles, ni tes objectifs."}
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
      </div>
    </PageTransition>
  )
}
