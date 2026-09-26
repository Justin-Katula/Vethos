import { useCallback, useEffect, useRef, useState } from 'react'
import { Square } from 'lucide-react'
import { STOP_REASONS, type StopReason } from '@shared/schemas'
import { RAISONS } from '@shared/planning/arrets'
import type { OptionRattrapage, TrustView } from '@shared/planning/trust'
import { nexus } from '@/lib/ipc'
import { Modal } from '@/components/ui/Modal'

type Step =
  | { s: 'closed' }
  | { s: 'delay'; until: number }
  | { s: 'reason' }
  | { s: 'counter'; reason: StopReason; message: string }
  | { s: 'message'; text: string }
  | { s: 'promise'; options: OptionRattrapage[]; minutes: number; source: { kind: 'task' | 'objective' | 'ancre'; refId: string; blockId: string } }
  | { s: 'pause' }
  | { s: 'emergency' }

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const dayLabel = (date: string, today: string) =>
  date === today ? 'Today' : new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short' })
const localKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const choice = 'pressable rounded border border-line bg-surface-2 px-3 py-3 text-left text-[13.5px] text-fg hover:border-line-strong'
const primary = 'pressable w-full rounded bg-fg px-4 py-3.5 text-[14px] font-medium text-bg'

/**
 * « Stop » pendant une séance (spec « Stop, promesses et confiance »). Le
 * délai dépend du niveau de confiance, avec « Je continue » en gros et rien à
 * lire ; la raison en un tap ; la contre-offre aux niveaux 3-4 quand la raison
 * ne colle pas ; puis le rattrapage, qui devient une promesse. Toujours monté
 * (`showButton`) : la feuille du rattrapage survit à la fin de la séance.
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

  useEffect(() => {
    if (step.s !== 'delay') return
    const t = setInterval(() => {
      const n = Date.now()
      setNow(n)
      if (n >= step.until) {
        shownAt.current = performance.now()
        setStep({ s: 'reason' })
      }
    }, 250)
    return () => clearInterval(t)
  }, [step])

  const close = () => (setStep({ s: 'closed' }), setText(''), setPicked([]))

  const decide = async (reason: StopReason | null, counterOfferRefused?: boolean) => {
    if (busy) return
    setBusy(true)
    try {
      const r = await nexus.planning.stopBlock({
        reason,
        ...(text.trim() ? { text: text.trim() } : {}),
        answerMs: Math.round(performance.now() - shownAt.current),
        ...(counterOfferRefused !== undefined ? { counterOfferRefused } : {}),
      })
      setText('')
      if (!r.ok) setStep({ s: 'message', text: r.reason })
      else if (r.step === 'counter-offer' && reason) setStep({ s: 'counter', reason, message: r.message })
      else if (r.step === 'no-room') setStep({ s: 'message', text: r.message })
      else if (r.step === 'stopped' && r.help) setStep({ s: 'message', text: r.help })
      else if (r.step === 'stopped' && r.options.length) setStep({ s: 'promise', options: r.options, minutes: r.minutes, source: r.source })
      else close()
    } catch {
      setStep({ s: 'message', text: 'Could not stop. Try again.' })
    } finally {
      setBusy(false)
      refresh()
    }
  }

  const open = () => {
    shownAt.current = performance.now()
    // Dans la prolongation, le bloc prévu est fait : « Stop » est la fin.
    if (inExtension) return void decide(null)
    if (trust && !trust.stopAllowed) return setStep({ s: 'pause' })
    const delay = trust?.delaySeconds ?? 60
    // Niveau 1 : un tap, puis le rattrapage.
    if (delay === 0) return void decide(null)
    setNow(Date.now())
    setStep({ s: 'delay', until: Date.now() + delay * 1000 })
  }

  const keepGoing = () => {
    void nexus.planning.waiveStop()
    close()
  }

  const somethingCameUp = () => {
    // Au-delà d'un arrêt sur trois en urgence, l'urgence compte comme un abandon.
    if (trust?.emergencyAsAbandon && trust.stopAllowed) {
      shownAt.current = performance.now()
      return void decide('real-event', true)
    }
    setPicked([])
    setStep({ s: 'emergency' })
  }

  const left = step.s === 'delay' ? Math.max(0, Math.ceil((step.until - now) / 1000)) : 0
  const paused = showButton && (trust?.pause || trust?.awaitingReturn)
  const title =
    step.s === 'reason' ? `Stop ${label}?` : step.s === 'promise' ? `Make up ${step.minutes} min` : step.s === 'emergency' ? '15 min' : label

  return (
    <>
      {paused ? (
        <button
          type="button"
          className="pressable inline-flex items-center gap-2 rounded bg-fg px-3 py-1.5 text-[12.5px] font-medium text-bg"
          onClick={() => void nexus.planning.resume().then(refresh)}
        >
          {trust?.pause ? `Back · ${hhmm(trust.pause.endMinute)}` : 'I’m back'}
        </button>
      ) : showButton ? (
        <button
          type="button"
          className="pressable inline-flex items-center gap-2 rounded border border-line px-3 py-1.5 text-[12.5px] text-fg-2 hover:text-fg"
          onClick={open}
        >
          <Square size={12} strokeWidth={2.4} />
          {trust && !trust.stopAllowed && !inExtension ? 'Pause' : 'Stop'}
        </button>
      ) : null}
      <Modal
        open={step.s !== 'closed'}
        title={title}
        // Fermer pendant le délai, c'est continuer. Une promesse se choisit.
        onClose={() => (step.s === 'delay' ? keepGoing() : step.s === 'promise' ? undefined : close())}
      >
        {step.s === 'delay' && (
          <div className="space-y-3">
            <p className="text-center font-mono text-[13px] tabular-nums text-fg-3" aria-live="polite">
              {`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}
            </p>
            <button type="button" className={`${primary} py-5 text-[16px]`} onClick={keepGoing} autoFocus>
              I’ll continue
            </button>
            <button type="button" className="pressable w-full py-2 text-[13px] text-fg-2 hover:text-fg" onClick={somethingCameUp}>
              Something real came up
            </button>
          </div>
        )}

        {step.s === 'reason' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              {STOP_REASONS.filter((r) => r !== 'real-event').map((r) => (
                <button key={r} type="button" disabled={busy} onClick={() => void decide(r)} className={choice}>
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

        {step.s === 'counter' && (
          <div className="space-y-3">
            <p className="text-[14px] leading-relaxed text-fg" aria-live="polite">{step.message}</p>
            <button type="button" className={primary} onClick={keepGoing}>10 more minutes</button>
            <button type="button" disabled={busy} className={`${choice} w-full text-center`} onClick={() => void decide(step.reason, true)}>
              Stop anyway
            </button>
          </div>
        )}

        {step.s === 'message' && (
          <div className="space-y-3">
            <p className="text-[14px] leading-relaxed text-fg" aria-live="polite">{step.text}</p>
            <button type="button" className={primary} onClick={close}>OK</button>
          </div>
        )}

        {step.s === 'promise' && (
          <div className="space-y-2">
            {step.options.map((o) => (
              <button
                key={`${o.date}-${o.startMinute}`}
                type="button"
                disabled={busy}
                className={`${choice} flex w-full items-center justify-between`}
                onClick={async () => {
                  setBusy(true)
                  await nexus.planning.promise(o, step.minutes, step.source)
                  setBusy(false)
                  close()
                }}
              >
                <span>{dayLabel(o.date, localKey())}</span>
                <span className="font-mono tabular-nums">{hhmm(o.startMinute)}</span>
              </button>
            ))}
          </div>
        )}

        {step.s === 'pause' && (
          <div className="space-y-2">
            {trust?.breatherNow && (
              <button type="button" className={primary} onClick={() => void nexus.planning.breather().then(() => (close(), refresh()))}>
                I need 15 min
              </button>
            )}
            <button type="button" className={`${choice} w-full text-center`} onClick={somethingCameUp}>
              Something real came up
            </button>
          </div>
        )}

        {step.s === 'emergency' && (
          <div className="space-y-2">
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
                  className={`${choice} flex w-full items-center justify-between disabled:opacity-40`}
                >
                  <span>{a.name}</span>
                  <span className="text-fg-3">{on ? '✓' : ''}</span>
                </button>
              )
            })}
            <button
              type="button"
              className={primary}
              onClick={() => void nexus.planning.emergency(picked).then(() => (close(), refresh()))}
            >
              {picked.length ? `Pause · ${picked.length} app${picked.length > 1 ? 's' : ''}` : 'Pause'}
            </button>
          </div>
        )}
      </Modal>
    </>
  )
}
