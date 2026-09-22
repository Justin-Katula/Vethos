import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Minus, X } from 'lucide-react'
import { nexus } from '@/lib/ipc'
import { NexusLogo } from '@/components/NexusLogo'

/**
 * Page affichée par-dessus une application bloquée.
 *
 * Elle vit dans une fenêtre Electron sans cadre, collée sur la fenêtre cible.
 * L'utilisateur ne voit qu'elle — jamais l'application en dessous — mais
 * l'application, elle, tourne normalement : rien ne l'a empêchée de se lancer,
 * rien ne la tuera.
 *
 * Les trois contrôles agissent sur la **paire** overlay + fenêtre cible, jamais
 * sur l'overlay seul. Masquer l'overlay sans toucher à la cible la rendrait
 * visible, ce qui viderait le blocage de son sens.
 *
 * CE QUE CET ÉCRAN DOIT FAIRE RESSENTIR : pas une porte claquée, une pièce
 * calme. C'est le seul écran que l'utilisateur verra quand il aura le plus
 * envie d'être ailleurs ; s'il ressemble à une erreur système, il donne envie
 * de se battre contre l'application. Le logo posé au centre dit la seule chose
 * vraie : ce n'est pas une panne, c'est toi qui l'as demandé.
 */

/** Bandeau d'avertissement avant de fermer une application préexistante. */
type EtatFermeture = 'inactif' | 'confirmation'

export default function BlockOverlay(): JSX.Element {
  const [params] = useSearchParams()
  const appName = params.get('app') ?? 'this app'
  const type = params.get('type') ?? 'app'
  const token = params.get('token') ?? ''
  const windowId = params.get('window') ?? ''
  const focusLabel = params.get('focus')

  const [fermeture, setFermeture] = useState<EtatFermeture>('inactif')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  // Le fond de la fenêtre est opaque côté Electron ; on s'assure que le corps
  // du document l'est aussi, sinon un liseré transparent laisse voir la cible.
  useEffect(() => {
    document.body.style.backgroundColor = '#000000'
    return () => {
      document.body.style.backgroundColor = ''
    }
  }, [])

  async function minimiser(): Promise<void> {
    setErreur(null)
    setEnCours(true)
    try {
      const ok = await nexus.blocking.minimizeAppWindow({ token, windowId })
      if (!ok) setErreur('Windows refused to minimise this window.')
    } catch {
      setErreur('Minimising failed.')
    } finally {
      setEnCours(false)
    }
  }

  async function fermer(): Promise<void> {
    setErreur(null)
    setEnCours(true)
    try {
      const ok = await nexus.blocking.closeAppWindow({ token, windowId })
      if (!ok) setErreur('Windows refused to close this window.')
    } catch {
      setErreur('Closing failed.')
    } finally {
      setEnCours(false)
      setFermeture('inactif')
    }
  }

  return (
    <div className="relative flex h-[100dvh] w-screen select-none flex-col bg-[#000000] text-white">
      <div className="flex items-center justify-end gap-2 p-4">
        <button
          type="button"
          onClick={() => void minimiser()}
          disabled={enCours || windowId === ''}
          aria-label="Minimise"
          className="pressable flex h-9 w-9 items-center justify-center rounded border border-white/20 text-white/60 transition hover:border-white/40 hover:text-white disabled:opacity-30"
        >
          <Minus size={16} />
        </button>
        <button
          type="button"
          onClick={() => setFermeture('confirmation')}
          disabled={enCours || windowId === ''}
          aria-label="Fermer"
          className="pressable flex h-9 w-9 items-center justify-center rounded border border-white/20 text-white/60 transition hover:border-warn/50 hover:text-warn disabled:opacity-30"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-7 px-10 pb-20 text-center">
        <div className="relative flex flex-col items-center justify-center gap-5">
          <div className="h-[2px] w-32 bg-accent" />
          <NexusLogo size={72} withWordmark={false} />
        </div>

        <div className="max-w-md">
          <h1 className="text-[26px] font-medium leading-tight text-white">
            {type === 'site' ? 'This site is blocked' : `${appName} is blocked`}
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-white/70">
            {focusLabel !== null && focusLabel.length > 0
              ? `A “${focusLabel}” session is running.`
              : 'A blocking session is running.'}{' '}
            {type === 'site'
              ? 'The rest of your browser stays usable.'
              : 'The app is still running. It was not force-closed.'}
          </p>
        </div>

        {fermeture === 'confirmation' && (
          <div className="w-full max-w-md rounded border border-warn/40 bg-white/[0.04] p-5 text-left">
            <p className="text-[14px] font-medium text-warn">Fermer {appName} ?</p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-white/60">
              You cannot see the real window, so you would not see its own save prompt
              either. Unsaved work could be lost.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFermeture('inactif')}
                className="pressable rounded px-4 py-2 text-[12.5px] text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void fermer()}
                disabled={enCours}
                className="pressable rounded bg-warn px-4 py-2 text-[12.5px] font-medium text-black transition hover:brightness-110 disabled:opacity-50"
              >
                Close anyway
              </button>
            </div>
          </div>
        )}

        {erreur !== null && <p className="text-[12.5px] text-warn">{erreur}</p>}
      </div>
    </div>
  )
}
