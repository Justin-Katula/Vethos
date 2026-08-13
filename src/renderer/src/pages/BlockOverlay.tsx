import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Minus, Shield, X } from 'lucide-react'
import { nexus } from '@/lib/ipc'

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
 */

/** Bandeau d'avertissement avant de fermer une application préexistante. */
type EtatFermeture = 'inactif' | 'confirmation'

export default function BlockOverlay(): JSX.Element {
  const [params] = useSearchParams()
  const appName = params.get('app') ?? 'cette application'
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
    document.body.style.backgroundColor = '#0a0a0c'
    return () => {
      document.body.style.backgroundColor = ''
    }
  }, [])

  async function minimiser(): Promise<void> {
    setErreur(null)
    setEnCours(true)
    try {
      const ok = await nexus.blocking.minimizeAppWindow({ token, windowId })
      if (!ok) setErreur("Windows a refusé de minimiser cette fenêtre.")
    } catch {
      setErreur('La minimisation a échoué.')
    } finally {
      setEnCours(false)
    }
  }

  async function fermer(): Promise<void> {
    setErreur(null)
    setEnCours(true)
    try {
      const ok = await nexus.blocking.closeAppWindow({ token, windowId })
      if (!ok) setErreur("Windows a refusé de fermer cette fenêtre.")
    } catch {
      setErreur('La fermeture a échoué.')
    } finally {
      setEnCours(false)
      setFermeture('inactif')
    }
  }

  return (
    <div className="flex h-[100dvh] w-screen select-none flex-col bg-[#0a0a0c] text-text-primary">
      {/* Barre de contrôles : la seule zone où l'overlay accepte un clic utile. */}
      <div className="flex items-center justify-end gap-1 p-2">
        <button
          type="button"
          onClick={() => void minimiser()}
          disabled={enCours || windowId === ''}
          aria-label="Minimiser"
          className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition hover:bg-bg-card-hover hover:text-text-primary disabled:opacity-30"
        >
          <Minus size={16} />
        </button>
        <button
          type="button"
          onClick={() => setFermeture('confirmation')}
          disabled={enCours || windowId === ''}
          aria-label="Fermer"
          className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition hover:bg-red-500/20 hover:text-red-300 disabled:opacity-30"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-10 pb-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10">
          <Shield size={24} className="text-amber-400" />
        </div>

        <div className="max-w-md">
          <h1 className="text-xl font-semibold text-text-primary">
            {type === 'site' ? 'Ce site est bloqué' : `${appName} est bloquée`}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-text-secondary">
            {focusLabel !== null && focusLabel.length > 0
              ? `Une session « ${focusLabel} » est en cours.`
              : 'Une session de blocage est en cours.'}{' '}
            {type === 'site'
              ? 'Le reste de ton navigateur reste utilisable.'
              : "L'application tourne toujours. Elle n'a pas été fermée de force."}
          </p>
        </div>

        {fermeture === 'confirmation' && (
          <div className="w-full max-w-md rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-left">
            <p className="text-sm font-medium text-red-200">Fermer {appName} ?</p>
            <p className="mt-1 text-xs leading-relaxed text-red-200/70">
              Tu ne vois pas la fenêtre réelle, donc tu ne verrais pas non plus son propre
              avertissement de sauvegarde. Du travail non enregistré pourrait être perdu.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFermeture('inactif')}
                className="rounded-lg px-3 py-1.5 text-xs text-text-secondary transition hover:text-text-primary"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void fermer()}
                disabled={enCours}
                className="rounded-lg bg-red-500/80 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-500 disabled:opacity-50"
              >
                Fermer quand même
              </button>
            </div>
          </div>
        )}

        {erreur !== null && <p className="text-xs text-red-400">{erreur}</p>}
      </div>
    </div>
  )
}
