import { TOLERANCE_DEPART_MINUTES } from '@shared/planning/habitudes'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Play, ShieldBan } from 'lucide-react'
import { nexus } from '@/lib/ipc'
import { cn } from '@/lib/cn'

/**
 * L'overlay « Je commence » — D.7/D.8.
 *
 * Vit dans sa propre fenêtre plein écran, sans cadre, toujours au-dessus.
 * Contrairement à BlockOverlay (qui recouvre une application bloquée sans lui
 * voler le focus), celui-ci EST la friction : la question qu'il pose n'a de
 * sens que si elle interrompt vraiment ce qui se passait avant.
 *
 * Le retard s'affiche en direct, calculé depuis `startMinute` — jamais figé au
 * chargement. C'est la même mesure que D.7 : retard = maintenant − T0, sans
 * fenêtre de grâce.
 *
 * C'EST LE BOUTON LE PLUS IMPORTANT DE L'APPLICATION. Tout le reste de
 * l'interface peut être consulté ; celui-ci est le seul qui engage. Il porte
 * donc l'action rouge à pleine force et reste le seul objet de son écran.
 */

const KIND_LABEL: Record<string, string> = {
  task: 'Task',
  objective: 'Goal',
  ancre: 'Anchor',
}

function hhmm(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}

export default function SessionStartOverlay(): JSX.Element {
  const [params] = useSearchParams()
  const blockId = params.get('blockId') ?? ''
  const kind = params.get('kind') ?? 'task'
  const label = params.get('label') ?? 'Ce bloc'
  const startMinute = Number(params.get('startMinute') ?? 0)
  const apps = (params.get('apps') ?? '').split(',').filter((a) => a.length > 0)

  const [now, setNow] = useState(() => new Date())
  const [confirming, setConfirming] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    document.body.style.backgroundColor = '#000000'
    return () => {
      document.body.style.backgroundColor = ''
    }
  }, [])

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(id)
  }, [])

  const nowMinute = now.getHours() * 60 + now.getMinutes()
  // Quelques minutes, c'est être à l'heure : le retard ne s'affiche qu'au-delà.
  const delayMinutes = Math.max(0, nowMinute - startMinute)
  const late = delayMinutes > TOLERANCE_DEPART_MINUTES

  async function confirmer(): Promise<void> {
    if (blockId === '') return
    setErreur(null)
    setConfirming(true)
    try {
      const result = await nexus.planning.confirmBlock(blockId)
      if (!result.ok) setErreur(result.reason)
      // Sur succès, l'overlay se ferme depuis le processus principal — rien à
      // faire ici : fermer la fenêtre soi-même dupliquerait cette décision.
    } catch {
      setErreur('Could not start. Try again.')
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div className="relative flex h-[100dvh] w-screen select-none flex-col items-center justify-center bg-[#000000] px-10 text-center text-white">
      <div className="relative flex items-center justify-center">
        <div className="flex h-[72px] w-[72px] items-center justify-center rounded border border-white/20 bg-white/[0.04]">
          <Play size={26} className="ml-1 text-accent" fill="currentColor" />
        </div>
      </div>

      <p className="mt-8 font-mono text-[12.5px] text-white/50">
        {KIND_LABEL[kind] ?? 'Block'} · planned for {hhmm(startMinute)}
      </p>
      <h1 className="mt-3 max-w-2xl text-[30px] font-medium leading-tight text-white">{label}</h1>

      <p
        className={cn(
          'mt-4 text-[13.5px] tabular-nums',
          late ? 'text-warn' : 'text-accent',
        )}
      >
        {late ? (
          <>
            <span className="num text-[17px]">{delayMinutes}</span> min late
          </>
        ) : (
          'It’s time'
        )}
      </p>

      {apps.length > 0 && (
        <div className="mt-7 flex items-center gap-2 rounded border border-white/20 px-4 py-2 text-[12.5px] text-white/70">
          <ShieldBan size={14} className="shrink-0 text-white/50" />
          <span>
            {apps.length === 1 ? apps[0] : `${apps.length} apps`} blocked
            {apps.length > 1 ? '' : ''} during this session
          </span>
        </div>
      )}

      <button
        type="button"
        onClick={() => void confirmer()}
        disabled={confirming || blockId === ''}
        className="pressable mt-10 min-w-[260px] rounded border border-accent bg-accent px-10 py-4 text-[16px] font-semibold text-white hover:brightness-110 disabled:bg-accent/35 disabled:text-white/70"
      >
        {confirming ? 'Starting…' : 'I’m starting'}
      </button>

      {erreur !== null && <p className="mt-5 text-[12.5px] text-warn">{erreur}</p>}
    </div>
  )
}
