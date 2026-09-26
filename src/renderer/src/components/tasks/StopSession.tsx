import { useCallback, useEffect, useRef, useState } from 'react'
import { Square } from 'lucide-react'
import { STOP_REASONS, type StopReason } from '@shared/schemas'
import { RAISONS } from '@shared/planning/arrets'
import type { OptionRattrapage, TrustView } from '@shared/planning/trust'
import { nexus } from '@/lib/ipc'
import { Modal } from '@/components/ui/Modal'

type Step =
  | { s: 'closed' }
  | { s: 'reason' }
  | { s: 'reaction'; reason: StopReason; lines: string[]; tenMinutes: boolean; waitMinutes: number }
  | { s: 'message'; text: string }
  | { s: 'urgent'; options: OptionRattrapage[]; minutes: number }
  | { s: 'apps'; option: OptionRattrapage | null; minutes: number }
  | { s: 'pause' }

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const localKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const dayLabel = (date: string) =>
  date === localKey() ? 'Today' : new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short' })
const hm = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}`)

const choice = 'pressable rounded border border-line bg-surface-2 px-3 py-3 text-left text-[13.5px] text-fg hover:border-line-strong disabled:opacity-40'
const primary = 'pressable w-full rounded bg-fg px-4 py-3.5 text-[14px] font-medium text-bg disabled:opacity-40'

/**
 * « Stop » pendant une séance. La raison d'abord ; puis, si l'app a la place
 * de repousser, sa réaction propre à la raison et « Stop ? ». Oui : la séance
 * reste bloquée pendant l'attente (5 min et plus), « I'll continue » reste à
 * portée, puis elle s'arrête et le rattrapage se choisit — il n'y a pas
 * d'abandon. L'urgence saute l'attente : jusqu'à quand repousser, puis tout
 * bloqué sauf 3 apps. Toujours monté (`showButton`) : le choix du rattrapage
 * survit à la fin de la séance.
 */
export function StopSession({ label, inExtension = false, showButton = true }: { label: string; inExtension?: boolean; showButton?: boolean }) {
  const [step, setStep] = useState<Step>({ s: 'closed' })
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [trust, setTrust] = useState<TrustView | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const shownAt = useRef(0)

  const refresh = useCallback(() => void nexus.planning.trust().then(setTrust).catch(() => undefined), [])
  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 5000)
    const off = nexus.planning.onChanged(refresh)
    return () => (clearInterval(t), off())
  }, [refresh, showButton])

  // Le compte à rebours de l'attente.
  const pending = trust?.stopPending ?? null
  useEffect(() => {
    if (!pending) return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [pending])

  const close = () => (setStep({ s: 'closed' }), setText(''), setPicked([]))

  const reasonPicked = async (reason: StopReason) => {
    if (busy) return
    // L'urgence n'attend pas — sauf quand elle est devenue trop fréquente.
    if (reason === 'real-event' && !trust?.urgentTooOften) {
      setBusy(true)
      const u = await nexus.planning.urgentOptions().catch(() => null)
      setBusy(false)
      if (!u) return setStep({ s: 'message', text: 'Could not stop. Try again.' })
      if (!u.options.length) return setStep({ s: 'apps', option: null, minutes: u.minutes })
      return setStep({ s: 'urgent', options: u.options, minutes: u.minutes })
    }
    setBusy(true)
    try {
      const r = await nexus.planning.stopBlock({
        reason,
        ...(text.trim() ? { text: text.trim() } : {}),
        answerMs: Math.round(performance.now() - shownAt.current),
      })
      if (!r.ok) setStep({ s: 'message', text: r.reason })
      else if (r.step === 'reaction') setStep({ s: 'reaction', reason, lines: r.lines, tenMinutes: r.tenMinutes, waitMinutes: r.waitMinutes })
      else if (r.step === 'no-room' || r.step === 'help') setStep({ s: 'message', text: r.message })
      else close()
    } catch {
      setStep({ s: 'message', text: 'Could not stop. Try again.' })
    } finally {
      setBusy(false)
      refresh()
    }
  }

  const confirm = async (reason: StopReason) => {
    setBusy(true)
    const r = await nexus.planning.confirmStop({ reason, ...(text.trim() ? { text: text.trim() } : {}), answerMs: Math.round(performance.now() - shownAt.current) })
    setBusy(false)
    if (r && !r.ok) setStep({ s: 'message', text: r.reason })
    else close()
    refresh()
  }

  const keepGoing = () => {
    void nexus.planning.waiveStop().then(refresh)
    close()
  }

  const open = () => {
    shownAt.current = performance.now()
    // Dans la prolongation, le bloc prévu est fait : « Stop » est la fin.
    if (inExtension) return void nexus.planning.stopBlock({ reason: null }).then(refresh)
    if (trust && !trust.stopAllowed) return setStep({ s: 'pause' })
    setStep({ s: 'reason' })
  }

  const applyApps = async () => {
    if (step.s !== 'apps') return
    setBusy(true)
    if (step.option) await nexus.planning.urgent(step.option, step.minutes, picked)
    else await nexus.planning.emergency(picked)
    setBusy(false)
    close()
    refresh()
  }

  const left = pending ? Math.max(0, Math.ceil((pending.untilMs - now) / 1000)) : 0
  const promiseChoice = trust?.promiseChoice ?? null
  const title =
    step.s === 'reason' || step.s === 'reaction'
      ? `Stop ${label}?`
      : step.s === 'urgent'
        ? 'Push back until'
        : step.s === 'apps'
          ? step.option ? `${dayLabel(step.option.date)} ${hhmm(step.option.startMinute)}` : '15 min'
          : label

  return (
    <>
      {showButton && (trust?.pause || trust?.awaitingReturn) ? (
        <button type="button" className="pressable inline-flex items-center gap-2 rounded bg-fg px-3 py-1.5 text-[12.5px] font-medium text-bg" onClick={() => void nexus.planning.resume().then(refresh)}>
          {trust?.pause ? `Back · ${hhmm(trust.pause.endMinute)}` : 'I’m back'}
        </button>
      ) : showButton && pending ? (
        // L'attente : la séance est encore bloquée ; on peut toujours continuer.
        <button type="button" className="pressable inline-flex items-center gap-2 rounded bg-fg px-3 py-1.5 text-[12.5px] font-medium text-bg" onClick={keepGoing}>
          I’ll continue <span className="font-mono tabular-nums opacity-60">{`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}</span>
        </button>
      ) : showButton ? (
        <button type="button" className="pressable inline-flex items-center gap-2 rounded border border-line px-3 py-1.5 text-[12.5px] text-fg-2 hover:text-fg" onClick={open}>
          <Square size={12} strokeWidth={2.4} />
          {trust && !trust.stopAllowed && !inExtension ? 'Pause' : 'Stop'}
        </button>
      ) : null}

      {/* Le rattrapage à choisir : il n'y a pas d'autre sortie. */}
      <Modal open={!!promiseChoice && step.s === 'closed'} title={promiseChoice ? `Make up ${hm(promiseChoice.minutes)}` : ''} onClose={() => undefined}>
        <div className="space-y-2">
          {(promiseChoice?.options ?? []).map((o) => (
            <button
              key={`${o.date}-${o.startMinute}`}
              type="button"
              disabled={busy}
              className={`${choice} flex w-full items-center justify-between`}
              onClick={async () => {
                setBusy(true)
                await nexus.planning.choosePromise(o)
                setBusy(false)
                refresh()
              }}
            >
              <span>{dayLabel(o.date)}</span>
              <span className="font-mono tabular-nums">{hhmm(o.startMinute)}</span>
            </button>
          ))}
        </div>
      </Modal>

      <Modal open={step.s !== 'closed'} title={title} onClose={close}>
        {step.s === 'reason' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              {STOP_REASONS.map((r) => (
                <button key={r} type="button" disabled={busy} onClick={() => void reasonPicked(r)} className={choice}>
                  {RAISONS[r].libelle}
                </button>
              ))}
            </div>
            <input
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 500))}
              placeholder="Anything else? (optional)"
              className="mt-3 w-full rounded border border-line bg-surface-2 px-3 py-2 text-[13px] text-fg"
            />
          </>
        )}

        {step.s === 'reaction' && (
          <div className="space-y-3">
            {step.lines.map((l) => (
              <p key={l} className="text-[14px] leading-relaxed text-fg" aria-live="polite">{l}</p>
            ))}
            <button type="button" className={primary} onClick={keepGoing} autoFocus>
              {step.tenMinutes ? '10 more minutes' : 'I’ll continue'}
            </button>
            <button type="button" disabled={busy} className={`${choice} w-full text-center`} onClick={() => void confirm(step.reason)}>
              {`Yes, stop in ${step.waitMinutes} min`}
            </button>
          </div>
        )}

        {step.s === 'message' && (
          <div className="space-y-3">
            <p className="text-[14px] leading-relaxed text-fg" aria-live="polite">{step.text}</p>
            <button type="button" className={primary} onClick={close}>OK</button>
          </div>
        )}

        {step.s === 'urgent' && (
          <div className="space-y-2">
            {step.options.map((o) => (
              <button
                key={`${o.date}-${o.startMinute}`}
                type="button"
                className={`${choice} flex w-full items-center justify-between`}
                onClick={() => (setPicked([]), setStep({ s: 'apps', option: o, minutes: step.minutes }))}
              >
                <span>{dayLabel(o.date)}</span>
                <span className="font-mono tabular-nums">{hhmm(o.startMinute)}</span>
              </button>
            ))}
          </div>
        )}

        {step.s === 'apps' && (
          <div className="space-y-2">
            {!step.option && step.minutes > 0 && <p className="text-[14px] leading-relaxed text-fg">No room to push this back. 15 minutes, then you finish.</p>}
            {(trust?.sessionApps ?? []).map((a) => {
              const on = picked.includes(a.id)
              return (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={on}
                  // Une 4e app est refusée.
                  disabled={!on && picked.length >= 3}
                  onClick={() => setPicked((p) => (on ? p.filter((x) => x !== a.id) : [...p, a.id]))}
                  className={`${choice} flex w-full items-center justify-between`}
                >
                  <span>{a.name}</span>
                  <span className="text-fg-3">{on ? '✓' : ''}</span>
                </button>
              )
            })}
            <button type="button" disabled={busy} className={primary} onClick={() => void applyApps()}>
              {picked.length ? `Keep ${picked.length} app${picked.length > 1 ? 's' : ''} open` : 'Keep everything blocked'}
            </button>
          </div>
        )}

        {step.s === 'pause' && (
          <div className="space-y-2">
            {trust?.breatherNow && (
              <button type="button" className={primary} onClick={() => void nexus.planning.breather().then(() => (close(), refresh()))}>
                I need 15 min
              </button>
            )}
            <button type="button" className={`${choice} w-full text-center`} onClick={() => (setPicked([]), setStep({ s: 'apps', option: null, minutes: 0 }))}>
              Something real came up
            </button>
          </div>
        )}
      </Modal>
    </>
  )
}
