import { useRef, useState } from 'react'
import { Square } from 'lucide-react'
import { STOP_REASONS, type StopReason } from '@shared/schemas'
import { RAISONS } from '@shared/planning/arrets'
import { nexus } from '@/lib/ipc'
import { Modal } from '@/components/ui/Modal'

/**
 * « Stop » pendant une séance (spec moteur 2026-09-25). Une raison en un
 * seul tap — sinon on choisit la réponse la plus rapide et la donnée ment —
 * et un texte optionnel. Le temps de réponse est mesuré : une réponse
 * mécanique compte comme un signal plus faible.
 */
export function StopSession({ label }: { label: string }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const openedAt = useRef(0)

  const stop = async (reason: StopReason | null) => {
    if (busy) return
    setBusy(true)
    try {
      const r = await nexus.planning.stopBlock({
        reason,
        ...(text.trim() ? { text: text.trim() } : {}),
        answerMs: Math.round(performance.now() - openedAt.current),
      })
      setText('')
      if (!r.ok) setMessage(r.reason)
      else if (r.help) setMessage(r.help)
      else setOpen(false)
    } catch {
      setMessage('Could not stop. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="pressable inline-flex items-center gap-2 rounded border border-line px-3 py-1.5 text-[12.5px] text-fg-2 hover:text-fg"
        onClick={() => {
          openedAt.current = performance.now()
          setOpen(true)
        }}
      >
        <Square size={12} strokeWidth={2.4} />
        Stop
      </button>
      <Modal open={open} title={`Stop ${label}?`} onClose={() => (setOpen(false), setMessage(null))}>
        {message && <p className="mb-3 text-[13.5px] leading-relaxed text-fg">{message}</p>}
        <div className="grid grid-cols-2 gap-2">
          {STOP_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              disabled={busy}
              onClick={() => void stop(r)}
              className="pressable rounded border border-line bg-surface-2 px-3 py-3 text-left text-[13.5px] text-fg hover:border-line-strong"
            >
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
      </Modal>
    </>
  )
}
