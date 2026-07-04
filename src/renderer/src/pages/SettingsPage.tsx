import { useEffect, useState, type ComponentType } from 'react'
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Save,
  RefreshCw,
  Moon,
  Clock,
  FileText,
  History,
  Play,
  ShieldCheck,
  Shield,
  Check,
  type LucideProps,
} from 'lucide-react'
import { PageTransition } from '@/components/PageTransition'
import { Button } from '@/components/ui/Button'
import { useSettingsStore } from '@/store/settings.store'
import { useBlockingStore } from '@/store/blocking.store'
import { useOnboardingStore } from '@/store/onboarding.store'
import { cn } from '@/lib/cn'
import { useShortcut } from '@/lib/use-shortcut'
import { useToast } from '@/lib/use-toast'
import { vethos } from '@/lib/ipc'
import type { UpdaterCheckResult } from '@shared/updater'
import { ExecutionPreviewUiFlags } from '@shared/execution-preview-ui-flags'
import { ExecutionPreviewDataConnectorFlags } from '@shared/execution-preview-data-connector-flags'
import { ExecutionPreviewDataConnectorPanel } from '@/components/execution-preview/ExecutionPreviewDataConnectorPanel'
import { Eye, EyeOff } from 'lucide-react'
import { UserModelPanel } from '@/components/user-model/UserModelPanel'
import { RuntimeCoordinatorPanel } from '@/components/runtime-coordinator/RuntimeCoordinatorPanel'

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
    <div className="info-panel flex items-center justify-between gap-4 rounded-lg px-5 py-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Icon size={18} />
        </div>
        <div>
          <div className="text-sm font-medium text-text-primary">{label}</div>
          <div className="text-xs text-text-muted">{description}</div>
        </div>
      </div>
      <Button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        variant="ghost"
        size="sm"
        className={cn(
          'relative h-6 w-11 rounded-2xl p-0 shadow-none hover:-translate-y-0',
          value
            ? 'border-accent/40 bg-accent hover:bg-accent-hover'
            : 'border-border-subtle bg-bg-base hover:bg-bg-card-hover',
        )}
        contentClassName="absolute inset-0"
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 h-5 w-5 rounded-2xl bg-white shadow transition-transform duration-200',
            value && 'translate-x-5',
          )}
        />
        <span className="sr-only">{value ? 'Actif' : 'Inactif'}</span>
      </Button>
    </div>
  )
}

export default function SettingsPage() {
  const {
    userId,
    username,
    savedAt,
    sleepStart,
    sleepEnd,
    sessionRulesEnabled,
    browserHistoryScanEnabled,
    classificationMode,
    engineV2Placement,
    engineV2Blocking,
    engineV2Priority,
    engineV2Completion,
    engineV2Execution,
    loaded,
    load,
    save,
    updateSettings,
  } = useSettingsStore()

  const restartOnboarding = useOnboardingStore((s) => s.restart)
  const blockingActive = useBlockingStore((s) => s.active)
  const blockingServiceStatus = useBlockingStore((s) => s.serviceStatus)
  const startBlockingTest = useBlockingStore((s) => s.startTest)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [checkingAi, setCheckingAi] = useState(false)
  const [aiStatus, setAiStatus] = useState<{
    ok: boolean
    message: string
  } | null>(null)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [testingBlocking, setTestingBlocking] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<UpdaterCheckResult | null>(null)
  const [showExecutionPreview, setShowExecutionPreview] = useState(false)
  const toast = useToast()

  useEffect(() => {
    if (!userId) return
    void load(userId)
  }, [load, userId])

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

  const handleAiCheck = async () => {
    setCheckingAi(true)
    setAiStatus(null)
    try {
      const result = await vethos.deepseek.chat({
        prompt: 'Reponds uniquement par OK si tu es connecte.',
        thinking: { type: 'disabled' },
        temperature: 0,
        maxTokens: 12,
      })
      const message = result.content || result.reasoningContent || 'Réponse reçue.'
      setAiStatus({ ok: true, message: `IA connectée : ${message}` })
      toast.success({
        title: 'IA connectée',
        description: 'DeepSeek répond depuis le main process.',
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setAiStatus({ ok: false, message })
      toast.error({
        title: 'IA non disponible',
        description: message,
      })
    } finally {
      setCheckingAi(false)
    }
  }

  const handleUpdateCheck = async () => {
    setCheckingUpdate(true)
    setUpdateStatus(null)
    try {
      const result = await vethos.app.checkForUpdates()
      setUpdateStatus(result)
      if (result.status === 'available') {
        toast.info({
          title: 'Mise à jour trouvée',
          description: `Vethos ${result.version} est disponible.`,
        })
      } else if (result.status === 'not-available') {
        toast.success({
          title: 'Vethos est à jour',
          description: `Version installée : ${result.currentVersion}.`,
        })
      } else if (result.status === 'skipped') {
        toast.info({
          title: 'Vérification reportée',
          description: result.message,
        })
      } else if (result.status === 'disabled') {
        toast.info({
          title: 'Updater inactif',
          description: result.message,
        })
      } else {
        toast.error({
          title: 'Vérification impossible',
          description: result.message,
        })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setUpdateStatus({
        status: 'error',
        currentVersion: 'unknown',
        message,
      })
      toast.error({
        title: 'Vérification impossible',
        description: message,
      })
    } finally {
      setCheckingUpdate(false)
    }
  }

  const handleBlockingTest = async () => {
    setTestingBlocking(true)
    try {
      await startBlockingTest()
      toast.info({
        title: 'Test de blocage lancé',
        description:
          'Le Bloc-notes va s’ouvrir. Ferme-le avec sa propre croix ou soumets une explication à Coach.',
      })
    } catch (err) {
      toast.error({
        title: 'Test impossible',
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setTestingBlocking(false)
    }
  }

  return (
    <PageTransition>
      <div className="flex h-full flex-col gap-8 overflow-y-auto px-12 pb-16 pt-16">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">Paramètres</h1>
          <p className="mt-2 text-sm text-text-secondary">
            Configure Vethos selon tes besoins. Toutes les modifications sont sauvegardées
            automatiquement.
          </p>
        </header>

        {/* --- Profil --- */}
        <section className="max-w-lg space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted">Profil</h2>
          <div className="info-panel rounded-lg p-6">
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
              <Button
                variant="solid"
                type="button"
                onClick={handleSave}
                disabled={!dirty || saving}
                className={cn(!dirty && !saving && 'cursor-not-allowed')}
              >
                <Save size={16} strokeWidth={2} />
                {saving ? 'Sauvegarde...' : 'Sauvegarder'}
              </Button>
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
          <div className="info-panel flex items-center gap-4 rounded-lg px-5 py-4">
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
            <span className="ml-auto text-xs text-text-muted">
              {sleepStart} — {sleepEnd}
            </span>
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
                  description:
                    'Sans ces règles, tu risques l’épuisement. Elles sont là pour que tu tiennes sur la durée.',
                })
              }
              void updateSettings({ sessionRulesEnabled: v })
            }}
          />
          <ToggleRow
            icon={History}
            label="Scan historique navigateur"
            description="Propose des domaines visités à bloquer, en local seulement"
            value={browserHistoryScanEnabled}
            onChange={(v) => void updateSettings({ browserHistoryScanEnabled: v })}
          />
        </section>

        {/* --- Moteurs actifs V2 --- */}
        <section className="max-w-lg space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Moteurs V2 (Activation)
          </h2>
          <ToggleRow
            icon={Clock}
            label="Placement V2"
            description="Active le nouveau moteur de planification Circadienne V2"
            value={engineV2Placement}
            onChange={(v) => void updateSettings({ engineV2Placement: v })}
          />
          <ToggleRow
            icon={Shield}
            label="Plan de Session V2"
            description="Active le nouveau système de blocage V2 par tâche"
            value={engineV2Blocking}
            onChange={(v) => void updateSettings({ engineV2Blocking: v })}
          />
          <ToggleRow
            icon={CheckCircle2}
            label="Priorisation V2"
            description="Active le tri V2 des tâches par score d'action"
            value={engineV2Priority}
            onChange={(v) => void updateSettings({ engineV2Priority: v })}
          />
          <ToggleRow
            icon={Check}
            label="Completion Gate V2"
            description="Valide la complétion des tâches via le moteur de confiance V2"
            value={engineV2Completion}
            onChange={(v) => void updateSettings({ engineV2Completion: v })}
          />
          <ToggleRow
            icon={ShieldCheck}
            label="Contrôle d'Exécution V2"
            description="Permet l'activation réelle des sessions V2"
            value={engineV2Execution}
            onChange={(v) => void updateSettings({ engineV2Execution: v })}
          />
        </section>

        {/* --- Mode de classification --- */}
        <section className="max-w-lg space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Mode de classification
          </h2>
          <div className="info-panel space-y-4 rounded-lg p-6">
            <p className="text-xs text-text-muted">
              Déterminez à quelle fréquence Vethos vous invite à classifier les nouvelles ressources détectées.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {([
                ['immediate', 'Immédiat'],
                ['batch_3h', 'Toutes les 3 heures'],
                ['batch_1d', 'Une fois par jour'],
                ['batch_1w', 'Une fois par semaine'],
              ] as const).map(([mode, label]) => {
                const active = classificationMode === mode
                return (
                  <Button
                    key={mode}
                    type="button"
                    variant={active ? 'solid' : 'default'}
                    size="sm"
                    onClick={() => void updateSettings({ classificationMode: mode })}
                    className={cn(
                      'w-full rounded-lg px-2 py-2 text-center text-xs',
                      active
                        ? 'border-accent/60 bg-accent/15 text-accent hover:bg-accent/20'
                        : 'bg-bg-base text-text-secondary hover:text-text-primary'
                    )}
                  >
                    {label}
                  </Button>
                )
              })}
            </div>
          </div>
        </section>

        {/* --- Test du blocage --- */}
        <section className="max-w-lg space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Test du blocage
          </h2>
          <div className="info-panel rounded-lg p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <ShieldCheck size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-text-primary">
                  Tester le blocage de sites web
                </div>
                <div className="mt-1 text-xs leading-relaxed text-text-muted">
                  Démarre une vraie session de blocage de 5 minutes et ouvre instagram.com
                  dans votre navigateur pour tester le blocage.
                </div>
              </div>
            </div>
            <Button
              type="button"
              variant="solid"
              onClick={() => void handleBlockingTest()}
              disabled={
                testingBlocking || Boolean(blockingActive) || blockingServiceStatus !== 'ok'
              }
              className={cn(testingBlocking && 'cursor-wait', 'mt-4')}
            >
              <Play size={14} fill="currentColor" />
              {testingBlocking
                ? 'Lancement…'
                : blockingActive
                  ? 'Une session est déjà active'
                  : 'Lancer le test de blocage'}
            </Button>
            {blockingServiceStatus !== 'ok' && (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>Le service de blocage doit être démarré pour lancer ce test.</span>
              </div>
            )}
          </div>
        </section>

        {/* --- Diagnostic --- */}
        <section className="max-w-lg space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Diagnostic
          </h2>
          <div className="info-panel space-y-4 rounded-lg p-6">
            <div>
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <RefreshCw size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-text-primary">Mises à jour</div>
                  <div className="mt-1 text-xs text-text-muted">
                    Vérifie la dernière release disponible pour cette installation.
                  </div>
                </div>
              </div>
              <Button
                type="button"
                onClick={() => void handleUpdateCheck()}
                disabled={checkingUpdate}
                className={cn(checkingUpdate && 'cursor-wait', 'mt-4')}
              >
                <RefreshCw size={14} className={checkingUpdate ? 'animate-spin' : ''} />
                {checkingUpdate ? 'Vérification...' : 'Vérifier les mises à jour'}
              </Button>
              {updateStatus && (
                <div
                  className={cn(
                    'mt-3 flex items-start gap-2 rounded-md border px-3 py-2 text-xs',
                    updateStatus.status === 'available'
                      ? 'border-accent/30 bg-accent/10 text-accent'
                      : updateStatus.status === 'error'
                        ? 'border-red-500/30 bg-red-500/10 text-red-200'
                        : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
                  )}
                >
                  {updateStatus.status === 'error' ? (
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  ) : (
                    <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
                  )}
                  <span>{updateStatusMessage(updateStatus)}</span>
                </div>
              )}
            </div>
            <div className="border-t border-border-subtle pt-4">
              <div>
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <Bot size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-text-primary">IA DeepSeek</div>
                    <div className="mt-1 text-xs text-text-muted">
                      Vérifie que la clé locale répond depuis le process principal.
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={() => void handleAiCheck()}
                  disabled={checkingAi}
                  className={cn(checkingAi && 'cursor-wait', 'mt-4')}
                >
                  <Bot size={14} />
                  {checkingAi ? 'Test en cours...' : 'Tester AI'}
                </Button>
                {aiStatus && (
                  <div
                    className={cn(
                      'mt-3 flex items-start gap-2 rounded-md border px-3 py-2 text-xs',
                      aiStatus.ok
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                        : 'border-red-500/30 bg-red-500/10 text-red-200',
                    )}
                  >
                    {aiStatus.ok ? (
                      <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
                    ) : (
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    )}
                    <span>{aiStatus.message}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="border-t border-border-subtle pt-4">
              <p className="text-xs text-text-muted">
                Les logs aident à comprendre un blocage, une session interrompue ou une erreur de
                sauvegarde.
              </p>
              <Button type="button" onClick={() => void vethos.app.openLogs()} className="mt-4">
                <FileText size={14} />
                Ouvrir les logs
              </Button>
            </div>
          </div>
        </section>

        {/* --- Onboarding --- */}
        <section className="max-w-lg space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Onboarding
          </h2>
          <div className="info-panel rounded-lg p-6">
            <p className="text-xs text-text-muted">
              {"Réafficher le tour d'introduction. Ne supprime ni tes règles, ni tes objectifs."}
            </p>
            <Button
              type="button"
              onClick={() => void handleRestart()}
              disabled={restarting}
              className={cn(restarting && 'cursor-wait', 'mt-4')}
            >
              <RefreshCw size={14} className={restarting ? 'animate-spin' : ''} />
              {restarting ? 'Lancement…' : "Relancer l'onboarding"}
            </Button>
          </div>
        </section>

        {import.meta.env.DEV && <UserModelPanel />}
        {import.meta.env.DEV && <RuntimeCoordinatorPanel />}

        {/* --- Aperçu de l’orchestrateur --- */}
        {import.meta.env.DEV &&
          ExecutionPreviewUiFlags.executionPreviewUiEnabled &&
          ExecutionPreviewDataConnectorFlags.executionPreviewDataConnectorEnabled && (
          <section className="max-w-4xl space-y-3 pt-8 border-t border-border-subtle mt-8">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Développeur : aperçu Orchestrator V2
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowExecutionPreview(prev => !prev)}
              >
                {showExecutionPreview ? <EyeOff size={14} /> : <Eye size={14} />}
                {showExecutionPreview ? 'Masquer la Preview' : 'Afficher la Preview'}
              </Button>
            </div>
            
            {showExecutionPreview && (
              <div className="mt-4">
                <ExecutionPreviewDataConnectorPanel />
              </div>
            )}
          </section>
        )}
      </div>

    </PageTransition>
  )
}

function updateStatusMessage(status: UpdaterCheckResult): string {
  if (status.status === 'available') {
    return `Version disponible : ${status.version}. Le téléchargement démarre automatiquement.`
  }
  if (status.status === 'not-available') {
    return `Aucune mise à jour disponible. Version installée : ${status.currentVersion}.`
  }
  if (status.status === 'disabled' || status.status === 'skipped' || status.status === 'error') {
    return status.message
  }
  return 'Statut de mise à jour reçu.'
}
