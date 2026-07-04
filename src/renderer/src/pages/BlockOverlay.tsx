import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, FileText, Minus, Timer, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { vethos } from '@/lib/ipc'
import type { ActiveSession } from '@shared/schemas'
import type { SessionPlan } from '@shared/engine-results'
import { explainAppAccess, explainSiteAccess } from '@/lib/access-explanation'

function countWords(value: string): number {
  const trimmed = value.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/u).length
}

function formatCooldown(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function closeOverlay(): void {
  window.close()
}

const SKIP_APP_CLOSE_WARNING_KEY = 'vethos:block-overlay:skip-close-warning'

export default function BlockOverlay(): JSX.Element {
  const [params] = useSearchParams()
  const targetName = params.get('app') ?? params.get('target') ?? 'cette application'
  const blockType = params.get('type') ?? 'app'
  const mode = params.get('mode') ?? 'work'
  const attemptToken = params.get('token') ?? ''
  const targetWindowId = params.get('window') ?? ''
  const focusLabel = params.get('focus') ?? 'ta priorité actuelle'
  const taskTitle = params.get('task')
  const objectiveName = params.get('objective')
  const targetLabel = targetName.replace(/\.exe$/iu, '')

  const [active, setActive] = useState<ActiveSession | null>(null)
  const [text, setText] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [closeWarningOpen, setCloseWarningOpen] = useState(false)
  const [skipFutureCloseWarnings, setSkipFutureCloseWarnings] = useState(false)
  const [closingApp, setClosingApp] = useState(false)
  const [appDecision, setAppDecision] = useState<{
    allowed: boolean
    reason: string
    allowMinutes: number
  } | null>(null)

  useEffect(() => {
    let mounted = true
    void vethos.blocking
      .getInitialState()
      .then((state) => {
        if (mounted) setActive(state.active)
      })
      .catch(() => {
        if (mounted) setActive(null)
      })
    const offSession = vethos.blocking.onSessionChanged((session) => {
      setActive(session)
    })
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      mounted = false
      offSession()
      clearInterval(tick)
    }
  }, [blockType])

  const policy = active?.profileSnapshot.unlockPolicy
  const unlockState = active?.unlockState

  const cooldownMinutes =
    policy?.type === 'cooldown' || policy?.type === 'cooldown_and_justification'
      ? policy.minutes
      : 0
  const minWords =
    policy?.type === 'justification' || policy?.type === 'cooldown_and_justification'
      ? policy.minWords
      : 0

  const cooldownStartedAt =
    unlockState?.phase === 'cooldown' ? Date.parse(unlockState.startedAt) : null
  const cooldownEndsAt = cooldownStartedAt ? cooldownStartedAt + cooldownMinutes * 60_000 : null
  const cooldownRemaining = cooldownEndsAt ? Math.max(0, cooldownEndsAt - now) : 0
  const cooldownReady = cooldownEndsAt ? now >= cooldownEndsAt : true
  const hasCooldown = cooldownMinutes > 0
  const hasJustification = minWords > 0
  const words = countWords(text)
  const wordsReady = words >= minWords
  const canSubmit =
    Boolean(active) &&
    cooldownReady &&
    (!hasJustification || wordsReady) &&
    policy?.type !== 'none' &&
    !busy

  const blockedMessage = useMemo(() => {
    if (blockType === 'site') return `Le site ${targetName} n'est pas autorisé actuellement.`
    return `L'application ${targetName} n'est pas autorisée actuellement.`
  }, [blockType, targetName])

  const accessExplanation = useMemo(() => {
    if (!active) return null
    const profile = active.profileSnapshot
    const isAllowlist = profile.mode === 'allowlist'
    const sessionPlan: SessionPlan = {
      targetType: 'session', targetId: active.id,
      durationMinutes: active.durationMinutes ?? Math.max(1, Math.round((Date.parse(active.endsAt) - Date.parse(active.startedAt)) / 60_000)),
      protectionLevel: isAllowlist ? 90 : 65,
      mode: profile.mode,
      allowedApps: isAllowlist ? profile.blockedProcesses : [],
      allowedSites: isAllowlist ? profile.blockedSites : [],
      blockedApps: isAllowlist ? [] : profile.blockedProcesses,
      blockedSites: isAllowlist ? [] : profile.blockedSites,
      unlockPolicy: profile.unlockPolicy,
      reasons: [`Session protégée : ${focusLabel}.`],
      confidence: 90,
    }
    return blockType === 'site'
      ? explainSiteAccess(targetName, sessionPlan)
      : explainAppAccess(targetName, sessionPlan)
  }, [active, blockType, focusLabel, targetName])

  const handleRequestUnlock = async (): Promise<void> => {
    if (!active) return
    setBusy(true)
    setError(null)
    try {
      const nextUnlockState = await vethos.blocking.requestUnlock()
      if (nextUnlockState.phase === 'unlocked') {
        closeOverlay()
        return
      }
      setActive({ ...active, unlockState: nextUnlockState })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const handleSubmit = async (): Promise<void> => {
    if (!active || !policy || policy.type === 'none') return
    setBusy(true)
    setError(null)
    try {
      if (policy.type === 'cooldown' && active.unlockState.phase === 'locked') {
        const nextUnlockState = await vethos.blocking.requestUnlock()
        setActive({ ...active, unlockState: nextUnlockState })
        return
      }
      const result = await vethos.blocking.submitJustification(text)
      if (result.ok) {
        closeOverlay()
      } else {
        setError(result.reason)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const handleAppExplanation = async (): Promise<void> => {
    if (!attemptToken || !text.trim() || busy) return
    setBusy(true)
    setError(null)
    setAppDecision(null)
    try {
      const result = await vethos.blocking.submitAppExplanation({
        token: attemptToken,
        text,
      })
      setAppDecision(result)
      if (result.allowed) {
        setTimeout(closeOverlay, 1400)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const handleMinimizeApp = async (): Promise<void> => {
    if (!attemptToken || !targetWindowId) return
    setError(null)
    try {
      const minimized = await vethos.blocking.minimizeAppWindow({
        token: attemptToken,
        windowId: targetWindowId,
      })
      if (!minimized) setError(`Impossible de minimiser ${targetLabel} pour le moment.`)
    } catch {
      setError(`Impossible de minimiser ${targetLabel} pour le moment.`)
    }
  }

  const handleConfirmedAppClose = async (): Promise<void> => {
    if (!attemptToken || !targetWindowId || closingApp) return
    setClosingApp(true)
    setError(null)
    try {
      if (skipFutureCloseWarnings) {
        window.localStorage.setItem(SKIP_APP_CLOSE_WARNING_KEY, '1')
      }
      const closed = await vethos.blocking.closeAppWindow({
        token: attemptToken,
        windowId: targetWindowId,
      })
      if (!closed) {
        setCloseWarningOpen(false)
        setError(`Impossible de fermer ${targetLabel} pour le moment.`)
      }
    } catch {
      setCloseWarningOpen(false)
      setError(`Impossible de fermer ${targetLabel} pour le moment.`)
    } finally {
      setClosingApp(false)
    }
  }

  const handleRequestAppClose = (): void => {
    setError(null)
    if (window.localStorage.getItem(SKIP_APP_CLOSE_WARNING_KEY) === '1') {
      void handleConfirmedAppClose()
      return
    }
    setSkipFutureCloseWarnings(false)
    setCloseWarningOpen(true)
  }

  if (blockType === 'app') {
    return (
      <main className="flex h-screen w-screen items-center justify-center bg-bg-base px-7 py-6 text-text-primary">
        <div className="fixed right-0 top-0 z-50 flex h-10">
          <button
            type="button"
            onClick={() => void handleMinimizeApp()}
            aria-label={`Minimiser ${targetLabel}`}
            title={`Minimiser ${targetLabel}`}
            className={cn(
              'flex h-10 w-14 items-center justify-center',
              'text-text-secondary transition-colors hover:bg-white/10 hover:text-text-primary',
              'focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/60',
            )}
          >
            <Minus size={18} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={handleRequestAppClose}
            disabled={closingApp}
            aria-label={`Fermer ${targetLabel}`}
            title={`Fermer ${targetLabel}`}
            className={cn(
              'flex h-10 w-14 items-center justify-center',
              'text-text-secondary transition-colors hover:bg-red-600 hover:text-white',
              'focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/60',
              'disabled:pointer-events-none disabled:opacity-50',
            )}
          >
            <X size={17} strokeWidth={1.75} />
          </button>
        </div>
        <section className="w-full max-w-[520px] border border-border-subtle bg-[#080808] shadow-elevated">
          <header className="flex items-start gap-4 border-b border-border-subtle px-7 py-6">
            <div className="flex h-10 w-10 flex-none items-center justify-center border border-border-subtle bg-[#111] text-text-secondary">
              <AlertTriangle size={20} strokeWidth={2.25} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase text-text-muted">Rappel Vethos</p>
              <h1 className="mt-2 text-balance text-2xl font-semibold leading-tight text-text-primary">
                Tu as ouvert {targetLabel}.
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                Cette application restera inaccessible tant que tu ne la fermes pas toi-même.
                Coach peut exceptionnellement accorder quelques minutes si ton besoin est réellement
                indispensable.
              </p>
            </div>
          </header>

          {accessExplanation && <AccessReason reasons={accessExplanation.reasons} />}

          <div className="space-y-5 px-7 py-6">
            <div className="border border-border-subtle bg-[#101010] px-4 py-3">
              <p className="text-xs font-medium uppercase text-text-muted">Priorité protégée</p>
              <p className="mt-2 text-sm font-medium text-text-primary">{focusLabel}</p>
              {taskTitle && objectiveName && (
                <p className="mt-1 text-xs text-text-muted">{taskTitle} · {objectiveName}</p>
              )}
            </div>

            <label className="flex items-center gap-2 text-xs font-medium uppercase text-text-muted">
              <FileText size={14} strokeWidth={2.25} />
              Ton explication
            </label>
            <textarea
              autoFocus
              value={text}
              onChange={(event) => {
                setText(event.target.value)
                setAppDecision(null)
              }}
              maxLength={2000}
              disabled={busy || Boolean(appDecision?.allowed)}
              rows={7}
              placeholder="Écris en quelques mots pourquoi tu veux utiliser cette application maintenant."
              className={cn(
                'mt-3 w-full resize-none border border-border-subtle bg-[#050505] px-4 py-3',
                'text-sm leading-relaxed text-text-primary outline-none transition-colors',
                'focus:border-border-strong disabled:opacity-60',
              )}
            />

            {appDecision && (
              <div
                className={cn(
                  'border px-4 py-3 text-sm leading-relaxed',
                  appDecision.allowed
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                    : 'border-red-500/40 bg-red-500/10 text-red-200',
                )}
              >
                <p className="font-medium">
                  {appDecision.allowed
                    ? `Accès accordé pour ${appDecision.allowMinutes} minutes`
                    : 'Dérogation refusée'}
                </p>
                <p className="mt-1 text-xs opacity-85">{appDecision.reason}</p>
              </div>
            )}

            {error && (
              <div className="border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <Button
              type="button"
              variant="solid"
              onClick={handleAppExplanation}
              disabled={!attemptToken || !text.trim() || busy || Boolean(appDecision?.allowed)}
              className="w-full rounded-none"
            >
              {busy ? 'Coach analyse…' : 'Demander quelques minutes à Coach'}
            </Button>

            <p className="text-xs leading-relaxed text-text-muted">
              Utilise − pour mettre {targetLabel} de côté, ou × pour la fermer. Ce rappel disparaîtra
              automatiquement dès que l&apos;application sera réellement fermée. Chaque explication est
              conservée avec sa date, son heure et la priorité concernée.
            </p>
          </div>
        </section>

        {closeWarningOpen && (
          <div
            role="presentation"
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 px-6"
            onMouseDown={(event) => {
              if (event.currentTarget === event.target && !closingApp) setCloseWarningOpen(false)
            }}
          >
            <section
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="close-warning-title"
              aria-describedby="close-warning-description"
              className="w-full max-w-[460px] rounded-xl border border-border-strong bg-[#0b0b0b] p-6 shadow-elevated"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg border border-red-500/35 bg-red-500/10 text-red-300">
                  <AlertTriangle size={20} strokeWidth={2.25} />
                </div>
                <div>
                  <h2 id="close-warning-title" className="text-lg font-semibold text-text-primary">
                    Fermer complètement {targetLabel} ?
                  </h2>
                  <p
                    id="close-warning-description"
                    className="mt-2 text-sm leading-relaxed text-text-secondary"
                  >
                    Tous les changements non sauvegardés dans cette application seront perdus. Cette
                    action ne pourra pas être annulée.
                  </p>
                </div>
              </div>

              <label className="mt-6 flex cursor-pointer items-center gap-3 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={skipFutureCloseWarnings}
                  onChange={(event) => setSkipFutureCloseWarnings(event.target.checked)}
                  disabled={closingApp}
                  className="h-4 w-4 accent-white"
                />
                Ne plus me demander
              </label>

              <div className="mt-6 flex justify-end gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setCloseWarningOpen(false)}
                  disabled={closingApp}
                >
                  Annuler
                </Button>
                <Button
                  type="button"
                  variant="solid"
                  onClick={() => void handleConfirmedAppClose()}
                  disabled={closingApp}
                  className="bg-red-600 text-white hover:bg-red-500"
                >
                  {closingApp ? 'Fermeture…' : 'Fermer quand même'}
                </Button>
              </div>
            </section>
          </div>
        )}
      </main>
    )
  }

  return (
    <main className="flex h-screen w-screen items-center justify-center bg-bg-base px-7 py-6 text-text-primary">
      <section className="w-full max-w-[520px] border border-border-subtle bg-[#080808] shadow-elevated">
        <header className="flex items-start gap-4 border-b border-border-subtle px-7 py-6">
          <div className="flex h-10 w-10 flex-none items-center justify-center border border-border-subtle bg-[#111] text-text-secondary">
            <AlertTriangle size={20} strokeWidth={2.25} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase text-text-muted">
              {mode === 'sleep' ? 'Blocage sommeil' : 'Blocage Vethos'}
            </p>
            <h1 className="mt-2 text-balance text-2xl font-semibold leading-tight text-text-primary">
              {blockedMessage}
            </h1>
            <p className="mt-3 text-sm font-medium text-text-secondary">
              Retourne à ce que tu devrais être en train de faire.
            </p>
          </div>
        </header>

        {accessExplanation && <AccessReason reasons={accessExplanation.reasons} />}

        <div className="space-y-5 px-7 py-6">
          {!active && (
            <div className="border border-border-subtle bg-[#101010] px-4 py-3 text-sm text-text-secondary">
              Aucune session active n&apos;est joignable pour demander un déblocage.
            </div>
          )}

          {active && policy?.type === 'none' && (
            <div className="border border-border-subtle bg-[#101010] px-4 py-3 text-sm text-text-secondary">
              Aucun déblocage temporaire n&apos;est configuré pour cette session.
            </div>
          )}

          {active && hasCooldown && active.unlockState.phase === 'locked' && (
            <Button
              type="button"
              variant="default"
              onClick={handleRequestUnlock}
              disabled={busy}
              className="w-full rounded-none"
            >
              <Timer size={16} strokeWidth={2.25} />
              {busy ? 'Demande en cours' : 'Démarrer le cooldown'}
            </Button>
          )}

          {active && hasCooldown && active.unlockState.phase === 'cooldown' && (
            <div className="border border-border-subtle bg-[#101010] px-5 py-5">
              <div className="flex items-center gap-2 text-xs font-medium uppercase text-text-muted">
                <Timer size={14} strokeWidth={2.25} />
                Cooldown
              </div>
              <div className="mt-4 font-mono text-5xl font-light tabular-nums text-text-primary">
                {formatCooldown(cooldownRemaining)}
              </div>
              <p className="mt-3 text-sm text-text-secondary">
                La demande se débloque à la fin du compte à rebours.
              </p>
            </div>
          )}

          {active && hasJustification && (cooldownReady || active.unlockState.phase !== 'locked') && (
            <div>
              <label className="flex items-center gap-2 text-xs font-medium uppercase text-text-muted">
                <FileText size={14} strokeWidth={2.25} />
                Justification
              </label>
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                disabled={!cooldownReady || busy}
                rows={5}
                placeholder="Explique pourquoi ce déblocage est nécessaire maintenant."
                className={cn(
                  'mt-3 w-full resize-none border border-border-subtle bg-[#050505] px-4 py-3',
                  'text-sm leading-relaxed text-text-primary outline-none transition-colors',
                  'focus:border-border-strong disabled:cursor-not-allowed disabled:opacity-50',
                )}
              />
              <div className="mt-2 flex items-center justify-between gap-3 text-xs text-text-muted">
                <span>
                  {words} / {minWords} mots
                </span>
                <span className={wordsReady ? 'text-text-secondary' : undefined}>
                  {wordsReady ? 'Minimum atteint' : `${minWords - words} restants`}
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className="border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-border-subtle px-7 py-4">
          <Button type="button" variant="ghost" onClick={closeOverlay} className="rounded-none">
            <X size={15} strokeWidth={2.25} />
            Fermer
          </Button>
          {active && policy?.type !== 'none' && (
            <Button
              type="button"
              variant="solid"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="rounded-none"
            >
              {busy ? 'Validation' : 'Demander le déblocage'}
            </Button>
          )}
        </footer>
      </section>
    </main>
  )
}

function AccessReason({ reasons }: { reasons: string[] }): JSX.Element {
  return (
    <div className="border-b border-border-subtle bg-[#0d0d0d] px-7 py-4">
      <div className="text-xs font-medium uppercase text-text-muted">Pourquoi cet accès est bloqué</div>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-sm leading-relaxed text-text-secondary">
        {reasons.map((reason) => <li key={reason}>{reason}</li>)}
      </ul>
    </div>
  )
}
