import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Check, FileText, RefreshCw } from 'lucide-react'
import { PageTransition } from '@/components/PageTransition'
import { useSettingsStore } from '@/store/settings.store'
import { useOnboardingStore } from '@/store/onboarding.store'
import { cn } from '@/lib/cn'
import { useShortcut } from '@/lib/use-shortcut'
import { useStagger } from '@/lib/motion'
import { nexus } from '@/lib/ipc'

/**
 * Les réglages tiennent en trois choses : qui tu es, où se règle le reste, et
 * comment ouvrir le capot quand ça coince. Chacune est une ligne, pas une carte
 * dans une colonne étroite : quatre encadrés empilés pour quatre champs, c'était
 * de l'emballage.
 */
export default function SettingsPage() {
  const { username, savedAt, sleepStart, sleepEnd, loaded, load, save } = useSettingsStore()
  const restartOnboarding = useOnboardingStore((s) => s.restart)
  const { container, item } = useStagger()

  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [restarting, setRestarting] = useState(false)

  useEffect(() => {
    void load()
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
      <div className="mx-auto flex h-full w-full max-w-[1560px] flex-col overflow-y-auto px-14 pb-14 pt-12">
        <header className="mb-12">
          <h1 className="text-3xl font-semibold text-fg">Paramètres</h1>
          <p className="mt-1.5 max-w-xl text-sm text-fg-3">
            Tout se sauvegarde en écrivant. Il n{'’'}y a rien à valider.
          </p>
        </header>

        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid flex-1 items-start gap-x-20 gap-y-12 lg:grid-cols-2"
        >
          <motion.section variants={item} className="space-y-8">
            <Row label="Nom" hint="Utilisé pour te saluer, nulle part ailleurs.">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void handleSave()}
                  placeholder="Ton prénom"
                  className="w-full max-w-xs rounded border border-line bg-base px-3 py-2 text-sm text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-line-strong"
                />
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={!dirty || saving}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-2 rounded px-4 py-2 text-sm font-medium transition-colors',
                    dirty && !saving
                      ? 'bg-fg text-base hover:bg-white'
                      : 'cursor-not-allowed border border-line text-fg-3',
                  )}
                >
                  {saving ? 'Sauvegarde' : 'Enregistrer'}
                </button>
              </div>
              {savedAt && !dirty && (
                <p className="mt-2 flex items-center gap-1.5 text-[11px] text-fg-3">
                  <Check size={12} />
                  Enregistré le {new Date(savedAt).toLocaleString('fr-FR')}
                </p>
              )}
            </Row>

            <Row label="Sommeil" hint="Se règle avec le reste de ce qui prend ton temps.">
              <p className="text-sm text-fg-2">
                <span className="numeric">
                  {sleepStart} {'→'} {sleepEnd}
                </span>
                <Link
                  to="/temps"
                  className="ml-3 text-sm text-fg-3 underline-offset-4 transition-colors hover:text-fg hover:underline"
                >
                  Modifier dans Mon temps
                </Link>
              </p>
            </Row>
          </motion.section>

          <motion.section variants={item} className="space-y-8">
            <Row label="Journal" hint="Ce que l'application a fait, dans l'ordre, avec l'heure.">
              <button
                type="button"
                onClick={() => void nexus.app.openLogs()}
                className="inline-flex items-center gap-2 rounded border border-line px-4 py-2 text-sm font-medium text-fg-2 transition-colors hover:border-line-strong hover:text-fg"
              >
                <FileText size={14} />
                Ouvrir le journal
              </button>
            </Row>

            <Row label="Introduction" hint="Ne touche ni à tes règles, ni à tes objectifs.">
              <button
                type="button"
                onClick={() => void handleRestart()}
                disabled={restarting}
                className={cn(
                  'inline-flex items-center gap-2 rounded border px-4 py-2 text-sm font-medium transition-colors',
                  restarting
                    ? 'cursor-wait border-line text-fg-3'
                    : 'border-line text-fg-2 hover:border-line-strong hover:text-fg',
                )}
              >
                <RefreshCw size={14} className={restarting ? 'animate-spin' : ''} />
                {restarting ? 'Lancement' : 'Revoir l’introduction'}
              </button>
            </Row>
          </motion.section>
        </motion.div>
      </div>
    </PageTransition>
  )
}

/** Un réglage : son nom, ce qu'il fait, et le contrôle. Pas d'encadré. */
function Row({
  label,
  hint,
  children,
}: {
  label: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <div className="border-t border-line pt-5">
      <h2 className="text-sm font-medium text-fg">{label}</h2>
      <p className="mb-4 mt-1 text-xs text-fg-3">{hint}</p>
      {children}
    </div>
  )
}
