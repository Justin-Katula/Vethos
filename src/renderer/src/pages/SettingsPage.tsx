import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { PageTransition } from '@/components/PageTransition'
import { useSettingsStore } from '@/store/settings.store'
import { cn } from '@/lib/cn'

export default function SettingsPage() {
  const { username, savedAt, loaded, load, save } = useSettingsStore()
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

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

  return (
    <PageTransition>
      <div className="flex h-full flex-col px-12 pt-16">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">Paramètres</h1>
          <p className="mt-2 text-sm text-text-secondary">
            Démo bout-en-bout : ces données sont persistées dans <code className="font-mono text-xs">nexus_settings.json</code>.
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
      </div>
    </PageTransition>
  )
}
