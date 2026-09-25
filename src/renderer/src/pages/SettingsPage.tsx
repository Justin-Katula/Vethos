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
import { effectiveContract, requestModeChange, signContract, MODES, type Mode } from '@shared/contract'
import { activeConfirmedSession } from '@shared/planning/session'
import { dateKey } from '@shared/planning/dates'
import { usePlanningStore } from '@/store/planning.store'
import { AgeChoice } from '@/components/onboarding/AgeStep'

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
          <h1 className="text-3xl font-semibold text-fg">Settings</h1>
          <p className="mt-1.5 max-w-xl text-sm text-fg-3">
            Everything saves as you type. There is nothing to confirm.
          </p>
        </header>

        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid flex-1 items-start gap-x-20 gap-y-12 lg:grid-cols-2"
        >
          <motion.section variants={item} className="space-y-8">
            <Row label="Name" hint="Used to greet you, nowhere else.">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  name="settings-name"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void handleSave()}
                  placeholder="Your first name"
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
                  Saved at {new Date(savedAt).toLocaleString('en-GB')}
                </p>
              )}
            </Row>

            <Row label="Sleep" hint="Set alongside everything else that takes your time.">
              <p className="text-sm text-fg-2">
                <span className="font-mono">
                  {sleepStart} {'→'} {sleepEnd}
                </span>
                <Link
                  to="/temps"
                  className="ml-3 text-sm text-fg-3 underline-offset-4 transition-colors hover:text-fg hover:underline"
                >
                  Change it in My time
                </Link>
              </p>
            </Row>

            <Row label="Age" hint="Sets your sleep floor: 8 hours from 13 to 18, 7 hours after.">
              <AgeChoice />
            </Row>

            <Row label="Contract" hint="No changes during a block. A change here takes 48 hours.">
              <ContractChoice />
            </Row>

            <Row label="Appearance" hint="Applies at once, everywhere, overlays included.">
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
                        label="Light from"
                        value={themeLightAt}
                        onChange={(v) => void updateSettings({ themeLightAt: v })}
                      />
                      <TimeField
                        label="Dark from"
                        value={themeDarkAt}
                        onChange={(v) => void updateSettings({ themeDarkAt: v })}
                      />
                    </div>
                    <p className="mt-3 text-xs text-fg-3">
                      {themeLightAt === themeDarkAt
                        ? 'The same hour twice: it will stay dark all the time.'
                        : `Dark from ${themeDarkAt} to ${themeLightAt}, light the rest of the time.`}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </Row>
          </motion.section>

          <motion.section variants={item} className="space-y-8">
            <Row
              label="DeepSeek key"
              hint="Optional. Vethos recognises your apps without it — offline, sending nothing."
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
                  ? 'Your key is stored, encrypted, and never leaves this machine except towards DeepSeek.'
                  : 'Without a key, only the AI judgement is off. Nothing else changes.'}
              </p>
            </Row>

            <Row label="Log" hint="What the app did, in order, with the time.">
              <button
                type="button"
                onClick={() => void nexus.app.openLogs()}
                className="inline-flex items-center gap-2 rounded border border-line px-4 py-2 text-sm font-medium text-fg-2 transition-colors hover:border-line-strong hover:text-fg"
              >
                <FileText size={14} />
                Open the log
              </button>
            </Row>

            <Row label="Introduction" hint="Touches neither your rules nor your goals.">
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
  system: { title: 'Device', hint: 'Follow Windows', Icon: Monitor },
  light: { title: 'Light', hint: 'Always', Icon: Sun },
  dark: { title: 'Dark', hint: 'Always', Icon: Moon },
  schedule: { title: 'On a clock', hint: 'Day / night', Icon: Clock4 },
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
      aria-label="Appearance"
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

/**
 * Le mode du contrat d'Ulysse : Allié ou Sergent. Même fermeté, deux tons.
 * Un changement se fait hors bloc et prend effet 48 h plus tard.
 */
function ContractChoice() {
  const contract = useSettingsStore((s) => s.contract)
  const updateSettings = useSettingsStore((s) => s.updateSettings)
  const confirmations = usePlanningStore((s) => s.sessionConfirmations)
  const [refused, setRefused] = useState(false)
  const now = new Date()
  const current = contract ? effectiveContract(contract, now) : null
  const choose = (mode: Mode) => {
    if (!current) {
      void updateSettings({ contract: signContract(mode, new Date()) })
      return
    }
    const inBlock = activeConfirmedSession(confirmations ?? null, dateKey(now), now.getHours() * 60 + now.getMinutes()) !== null
    const r = requestModeChange(current, mode, new Date(), inBlock)
    setRefused(!r.ok && r.reason === 'during-block')
    if (r.ok) void updateSettings({ contract: r.contract })
  }
  const shown = current?.pending?.mode ?? current?.mode
  return (
    <div>
      <div className="flex gap-2">
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => choose(m)}
            className={cn('pressable rounded border px-4 py-2 text-sm', shown === m ? 'border-line-strong text-fg' : 'border-line text-fg-3')}
          >
            {m === 'ally' ? 'Ally' : 'Sergeant'}
          </button>
        ))}
      </div>
      {current?.pending && (
        <p className="mt-2 text-[11px] text-fg-3">From {new Date(current.pending.effectiveAt).toLocaleString('en-GB')}</p>
      )}
      {refused && <p className="mt-2 text-[11px] text-fg-3">Not during a block.</p>}
    </div>
  )
}
