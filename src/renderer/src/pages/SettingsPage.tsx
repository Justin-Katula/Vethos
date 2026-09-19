import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Clock4, FileText, Monitor, Moon, RefreshCw, Sun } from 'lucide-react'
import { PageTransition } from '@/components/PageTransition'
import { useSettingsStore } from '@/store/settings.store'
import { useOnboardingStore } from '@/store/onboarding.store'
import { cn } from '@/lib/cn'
import { useShortcut } from '@/lib/use-shortcut'
import { useStagger } from '@/lib/motion'
import { nexus } from '@/lib/ipc'
import { THEME_MODES, type ThemeMode } from '@shared/theme'

/**
 * Les réglages tiennent en trois choses : qui tu es, où se règle le reste, et
 * comment ouvrir le capot quand ça coince. Chacune est une ligne, pas une carte
 * dans une colonne étroite : quatre encadrés empilés pour quatre champs, c'était
 * de l'emballage.
 */
export default function SettingsPage() {
  const {
    username,
    savedAt,
    sleepStart,
    sleepEnd,
    theme,
    themeLightAt,
    themeDarkAt,
    loaded,
    load,
    save,
    deepseekApiKey,
    updateSettings,
  } = useSettingsStore()
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
                  name="settings-name"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void handleSave()}
                  placeholder="Ton prénom"
                  className="field w-full max-w-xs text-sm"
                />
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={!dirty || saving}
                  className="btn-iris pressable shrink-0"
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
                <span className="font-mono">
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

            <Row label="Apparence" hint="S'applique tout de suite, partout, y compris aux overlays.">
              <ThemeChoice
                mode={theme}
                onChange={(next) => void updateSettings({ theme: next })}
              />

              {/* Les heures n'existent que pour le mode qui s'en sert. Les
                  laisser affichées en permanence donnerait deux réglages là où
                  l'utilisateur n'en a choisi qu'un. */}
              <AnimatePresence initial={false}>
                {theme === 'schedule' && (
                  <motion.div
                    key="theme-hours"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="flex flex-wrap items-end gap-x-6 gap-y-3 pt-4">
                      <TimeField
                        label="Clair dès"
                        value={themeLightAt}
                        onChange={(v) => void updateSettings({ themeLightAt: v })}
                      />
                      <TimeField
                        label="Sombre dès"
                        value={themeDarkAt}
                        onChange={(v) => void updateSettings({ themeDarkAt: v })}
                      />
                    </div>
                    <p className="mt-3 text-xs text-fg-3">
                      {themeLightAt === themeDarkAt
                        ? 'Deux fois la même heure : il fera sombre en permanence.'
                        : `Sombre de ${themeDarkAt} à ${themeLightAt}, clair le reste du temps.`}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </Row>
          </motion.section>

          <motion.section variants={item} className="space-y-8">
            <Row
              label="Clé DeepSeek"
              hint="Facultative. Vethos reconnaît tes applications sans elle — hors ligne et sans rien envoyer."
            >
              <input
                type="password"
                name="settings-deepseek-key"
                autoComplete="off"
                spellCheck={false}
                value={deepseekApiKey}
                onChange={(e) => void updateSettings({ deepseekApiKey: e.target.value })}
                placeholder="sk-…"
                className="field w-full max-w-xs text-sm"
              />
              <p className="mt-3 text-xs text-fg-3">
                {deepseekApiKey
                  ? 'Ta clé est enregistrée, chiffrée, et ne sort jamais de cette machine sauf vers DeepSeek.'
                  : 'Sans clé, seul le jugement par IA est désactivé. Rien d’autre ne change.'}
              </p>
            </Row>

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

/**
 * Le choix d'apparence.
 *
 * Quatre réponses, toutes visibles en même temps : c'est un choix qu'on fait
 * une fois, et un menu déroulant obligerait à ouvrir pour savoir ce qui existe.
 * Chaque option dit ce qu'elle FAIT, pas comment elle s'appelle — « suivre
 * l'ordinateur » se comprend sans savoir ce qu'est un thème système.
 */
const THEME_LABELS: Record<ThemeMode, { title: string; hint: string; Icon: typeof Sun }> = {
  system: { title: 'Ordinateur', hint: 'Comme Windows', Icon: Monitor },
  light: { title: 'Clair', hint: 'Toujours', Icon: Sun },
  dark: { title: 'Sombre', hint: 'Toujours', Icon: Moon },
  schedule: { title: 'À l’heure', hint: 'Jour / nuit', Icon: Clock4 },
}

function ThemeChoice({
  mode,
  onChange,
}: {
  mode: ThemeMode
  onChange: (mode: ThemeMode) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Apparence"
      className="grid max-w-md grid-cols-4 overflow-hidden rounded border border-line-strong"
    >
      {THEME_MODES.map((option, i) => {
        const { title, hint, Icon } = THEME_LABELS[option]
        const active = mode === option
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option)}
            className={cn(
              'pressable relative flex flex-col items-center gap-1.5 px-2 py-3 text-center',
              i > 0 && 'border-l border-line',
              active ? 'bg-surface-3 text-fg' : 'bg-surface text-fg-3 hover:bg-surface-2 hover:text-fg-2',
            )}
          >
            <Icon size={16} strokeWidth={active ? 2 : 1.75} />
            <span className="text-[12.5px] font-medium leading-none">{title}</span>
            <span className="text-[10.5px] leading-none text-fg-3">{hint}</span>
            {/* Le filet rouge est la seule couleur du contrôle : il dit lequel
                est retenu, comme le liseré sous le bouton primaire. */}
            {active && (
              <motion.span
                layoutId="theme-choice-rule"
                className="absolute inset-x-0 bottom-0 h-[2px] bg-accent"
                transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}

/** Une heure de bascule. Le champ natif suit le thème via `color-scheme`. */
function TimeField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs text-fg-3">{label}</span>
      <input
        type="time"
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        // Assez large pour un champ 12 h : en anglais, le segment AM/PM s'ajoute
        // à l'heure et se faisait couper (« 07:00 AI »).
        className="field num w-[9.5rem] text-sm"
      />
    </label>
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
