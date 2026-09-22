import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { nexus } from '@/lib/ipc'
import { ShieldAlert, ShieldCheck, FileText, Loader2, AlertCircle, Search, X, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface BlockedDecisionItem {
  identifiant: string
  nom_affiche: string
  raison: string
  iconDataUrl?: string
}

export type AppDecisionItem = BlockedDecisionItem

interface IntelligentBlockingReviewModalProps {
  open: boolean
  title: string
  plan: string
  kindLabel?: string // 'task' | 'goal' | 'anchor'
  onConfirm: (blockedApps: string[]) => void
  onCancel: () => void
}

export function IntelligentBlockingReviewModal({
  open,
  title,
  plan,
  kindLabel = 'task',
  onConfirm,
  onCancel,
}: IntelligentBlockingReviewModalProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [blockedApps, setBlockedApps] = useState<AppDecisionItem[]>([])
  const [allowedApps, setAllowedApps] = useState<AppDecisionItem[]>([])
  const [activeTab, setActiveTab] = useState<'blocked' | 'allowed'>('blocked')
  const [activeActionId, setActiveActionId] = useState<{ id: string; action: 'remove' | 'add' } | null>(null)
  const [justification, setJustification] = useState('')
  const [isReviewing, setIsReviewing] = useState(false)
  const [reviewFeedback, setReviewFeedback] = useState<{
    id: string
    accepted: boolean
    reason: string
  } | null>(null)
  const [streamProgress, setStreamProgress] = useState<{
    processedCount: number
    totalCount: number
    currentCategory: string
  } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const currentList = activeTab === 'blocked' ? blockedApps : allowedApps

  const filteredApps = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return currentList
    return currentList.filter(
      (app) =>
        app.nom_affiche.toLowerCase().includes(q) ||
        app.identifiant.toLowerCase().includes(q) ||
        app.raison.toLowerCase().includes(q),
    )
  }, [currentList, searchQuery])

  // Écoute les arrivées en temps réel des applications bloquées et autorisées par lots
  useEffect(() => {
    if (!open || !plan.trim()) return

    let isMounted = true
    setIsAnalyzing(true)
    setAnalysisError(null)
    setBlockedApps([])
    setAllowedApps([])
    setReviewFeedback(null)
    setActiveActionId(null)
    setStreamProgress(null)
    setSearchQuery('')
    setActiveTab('blocked')

    const unsub = nexus.blocking.onProgress((prog) => {
      if (!isMounted) return
      setStreamProgress({
        processedCount: prog.processedCount,
        totalCount: prog.totalCount,
        currentCategory: prog.currentCategory,
      })
      if (prog.newBlockedApps && prog.newBlockedApps.length > 0) {
        setBlockedApps((prev) => {
          const existingKeys = new Set(prev.map((b) => `${b.identifiant.toLowerCase()}:${b.nom_affiche.toLowerCase()}`))
          const existingNames = new Set(prev.map((b) => b.nom_affiche.trim().toLowerCase()))
          const additions = prog.newBlockedApps.filter(
            (b) =>
              !existingKeys.has(`${b.identifiant.toLowerCase()}:${b.nom_affiche.toLowerCase()}`) &&
              !existingNames.has(b.nom_affiche.trim().toLowerCase()),
          )
          return additions.length > 0 ? [...prev, ...additions] : prev
        })
      }
      const nouvellesAutorisees = prog.newAllowedApps
      if (nouvellesAutorisees && nouvellesAutorisees.length > 0) {
        setAllowedApps((prev) => {
          const existingKeys = new Set(prev.map((b) => `${b.identifiant.toLowerCase()}:${b.nom_affiche.toLowerCase()}`))
          const existingNames = new Set(prev.map((b) => b.nom_affiche.trim().toLowerCase()))
          const additions = nouvellesAutorisees.filter(
            (b) =>
              !existingKeys.has(`${b.identifiant.toLowerCase()}:${b.nom_affiche.toLowerCase()}`) &&
              !existingNames.has(b.nom_affiche.trim().toLowerCase()),
          )
          return additions.length > 0 ? [...prev, ...additions] : prev
        })
      }
    })

    nexus.blocking
      .decideIntelligentBlocking({
        title: title.trim() || 'Untitled',
        plan: plan.trim(),
      })
      .then((res) => {
        if (!isMounted) return
        if (res.decisionState === 'BLOCK_DECISION_AI_FAILED') {
          setAnalysisError('Your app list could not be built. Try again.')
          return
        }
        if (res.blockedApps) {
          setBlockedApps((prev) => {
            const existingKeys = new Set(prev.map((b) => `${b.identifiant.toLowerCase()}:${b.nom_affiche.toLowerCase()}`))
            const existingNames = new Set(prev.map((b) => b.nom_affiche.trim().toLowerCase()))
            const additions = res.blockedApps.filter(
              (b) =>
                !existingKeys.has(`${b.identifiant.toLowerCase()}:${b.nom_affiche.toLowerCase()}`) &&
                !existingNames.has(b.nom_affiche.trim().toLowerCase()),
            )
            return additions.length > 0 ? [...prev, ...additions] : prev
          })
        }
        const autorisees = res.allowedApps
        if (autorisees) {
          setAllowedApps((prev) => {
            const existingKeys = new Set(prev.map((b) => `${b.identifiant.toLowerCase()}:${b.nom_affiche.toLowerCase()}`))
            const existingNames = new Set(prev.map((b) => b.nom_affiche.trim().toLowerCase()))
            const additions = autorisees.filter(
              (b) =>
                !existingKeys.has(`${b.identifiant.toLowerCase()}:${b.nom_affiche.toLowerCase()}`) &&
                !existingNames.has(b.nom_affiche.trim().toLowerCase()),
            )
            return additions.length > 0 ? [...prev, ...additions] : prev
          })
        }
      })
      .catch((err) => {
        console.error('[intelligent-blocking] decision error:', err)
        if (isMounted) {
          setAnalysisError(err instanceof Error ? err.message : "Erreur lors de l'analyse.")
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsAnalyzing(false)
        }
      })

    return () => {
      isMounted = false
      unsub()
    }
  }, [open, title, plan, reloadKey])

  // On atterrit sur l'onglet où il y a quelque chose à faire. Rien n'étant bloqué
  // d'office, ouvrir sur une liste vide obligerait l'utilisateur à deviner que
  // l'action se trouve sur l'autre onglet.
  //
  // Une seule fois, à la fin de la lecture : ensuite l'onglet appartient à
  // l'utilisateur, et le lui reprendre parce qu'il vient de tout débloquer serait
  // le déplacer sous ses doigts.
  const ongletDejaChoisi = useRef(false)
  useEffect(() => {
    if (!open) {
      ongletDejaChoisi.current = false
      return
    }
    if (isAnalyzing || ongletDejaChoisi.current) return
    ongletDejaChoisi.current = true
    if (blockedApps.length === 0 && allowedApps.length > 0) setActiveTab('allowed')
  }, [open, isAnalyzing, blockedApps.length, allowedApps.length])

  // Débloquer une application bloquée (action: remove)
  const handleRequestRemoval = async (app: AppDecisionItem) => {
    setIsReviewing(true)
    setReviewFeedback(null)

    try {
      const res = await nexus.blocking.reviewBlockModification({
        title: title.trim() || 'Untitled',
        plan: plan.trim(),
        identifiant: app.identifiant,
        action: 'remove',
        userJustification: justification.trim() || undefined,
      })

      setReviewFeedback({
        id: app.identifiant,
        accepted: res.accepted,
        reason: res.reason,
      })

      if (res.accepted) {
        setBlockedApps((prev) => prev.filter((b) => b.identifiant !== app.identifiant))
        setAllowedApps((prev) => {
          const exists = prev.some((a) => a.identifiant.toLowerCase() === app.identifiant.toLowerCase())
          if (exists) return prev
          return [...prev, { ...app, raison: res.reason || 'Unblocked after re-evaluation.' }]
        })
        setActiveActionId(null)
        setJustification('')
      }
    } catch (err) {
      setReviewFeedback({
        id: app.identifiant,
        accepted: false,
        reason: err instanceof Error ? err.message : 'Error during re-evaluation.',
      })
    } finally {
      setIsReviewing(false)
    }
  }

  // Bloquer une application initialement autorisée (action: add)
  const handleRequestAddBlock = async (app: AppDecisionItem) => {
    setIsReviewing(true)
    setReviewFeedback(null)

    try {
      const res = await nexus.blocking.reviewBlockModification({
        title: title.trim() || 'Untitled',
        plan: plan.trim(),
        identifiant: app.identifiant,
        action: 'add',
        userJustification: justification.trim() || undefined,
      })

      setReviewFeedback({
        id: app.identifiant,
        accepted: res.accepted,
        reason: res.reason,
      })

      if (res.accepted) {
        setAllowedApps((prev) => prev.filter((a) => a.identifiant !== app.identifiant))
        setBlockedApps((prev) => {
          const exists = prev.some((b) => b.identifiant.toLowerCase() === app.identifiant.toLowerCase())
          if (exists) return prev
          return [...prev, { ...app, raison: res.reason || 'Blocked after re-evaluation.' }]
        })
        setActiveActionId(null)
        setJustification('')
      }
    } catch (err) {
      setReviewFeedback({
        id: app.identifiant,
        accepted: false,
        reason: err instanceof Error ? err.message : 'Error during re-evaluation.',
      })
    } finally {
      setIsReviewing(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="Blocage intelligent"
      description="Your installed apps — pick the ones that would pull you away from this task. Nothing is blocked without your say-so."
    >
      <div className="space-y-4">
        {/* Rappel du plan */}
        <div className="rounded border border-line bg-surface-2 p-3 text-xs">
          <div className="flex items-center gap-1.5 font-medium text-fg">
            <FileText size={14} className="text-accent" />
            <span>Plan d{"'"}action de la {kindLabel}</span>
          </div>
          <p className="mt-1 font-semibold text-fg-2">{title || 'Untitled'}</p>
          <p className="mt-0.5 italic text-fg-3">« {plan} »</p>
        </div>

        {/* Bannière d'analyse en direct si des cartes sont déjà affichées */}
        {isAnalyzing && (
          <div className="flex items-center justify-between rounded border border-accent/30 bg-accent-soft px-3 py-2 text-xs">
            <div className="flex items-center gap-2 text-fg">
              <Loader2 size={13} className="animate-spin text-accent" />
              <span>
                {streamProgress?.currentCategory
                  ? `Analyse en cours : ${streamProgress.currentCategory}`
                  : 'Reading your installed apps...'}
              </span>
            </div>
            {streamProgress && (
              <span className="font-mono text-[11px] font-semibold text-accent">
                {streamProgress.processedCount} / {streamProgress.totalCount}
              </span>
            )}
          </div>
        )}

        {/* État de chargement initial (aucune carte reçue pour le moment) */}
        {isAnalyzing && blockedApps.length === 0 && allowedApps.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Loader2 size={32} className="animate-spin text-accent" />
            <p className="mt-3 text-sm font-medium text-fg">Reading your installed apps...</p>
            <p className="mt-1 text-xs text-fg-3">
              Nothing is blocked by default: it is up to you to name what distracts you.
            </p>
          </div>
        )}

        {/* Erreur de lecture du catalogue */}
        {analysisError && !isAnalyzing && (
          <div className="rounded border border-red-500/30 bg-red-500/10 p-3.5 text-xs">
            <div className="flex items-start gap-2.5 text-red-700 dark:text-red-400">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">The list could not be built</p>
                <p className="text-fg-2">{analysisError}</p>
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="pressable inline-flex items-center gap-1.5 rounded border border-line bg-surface px-3 py-1.5 text-xs font-medium text-fg hover:border-fg-3"
              >
                <RotateCcw size={12} />
                <span>Run the analysis again</span>
              </button>
            </div>
          </div>
        )}

        {/* Résultats de l'analyse avec onglets segmentés (Bloquées / Débloquées) */}
        {!analysisError && (blockedApps.length > 0 || allowedApps.length > 0 || !isAnalyzing) && (
          <div className="space-y-3">
            {/* Contrôle segmenté des onglets */}
            <div className="flex rounded border border-line bg-surface-2/40 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('blocked')
                  setSearchQuery('')
                  setActiveActionId(null)
                  setReviewFeedback(null)
                }}
                className={cn(
                  'pressable flex flex-1 items-center justify-center gap-1.5 rounded py-1.5 font-medium transition',
                  activeTab === 'blocked'
                    ? 'bg-surface text-fg shadow-sm border border-line/60'
                    : 'text-fg-3 hover:text-fg',
                )}
              >
                <ShieldAlert size={13} className={activeTab === 'blocked' ? 'text-warn' : 'text-fg-3'} />
                <span>Blocked distractions</span>
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[10.5px] font-mono font-semibold',
                    activeTab === 'blocked' ? 'bg-warn/15 text-warn' : 'bg-surface-2 text-fg-3',
                  )}
                >
                  {blockedApps.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('allowed')
                  setSearchQuery('')
                  setActiveActionId(null)
                  setReviewFeedback(null)
                }}
                className={cn(
                  'pressable flex flex-1 items-center justify-center gap-1.5 rounded py-1.5 font-medium transition',
                  activeTab === 'allowed'
                    ? 'bg-surface text-fg shadow-sm border border-line/60'
                    : 'text-fg-3 hover:text-fg',
                )}
              >
                <ShieldCheck
                  size={13}
                  className={activeTab === 'allowed' ? 'text-emerald-700 dark:text-emerald-400' : 'text-fg-3'}
                />
                <span>Unblocked apps</span>
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[10.5px] font-mono font-semibold',
                    activeTab === 'allowed'
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                      : 'bg-surface-2 text-fg-3',
                  )}
                >
                  {allowedApps.length}
                </span>
              </button>
            </div>

            {/* Barre de recherche directe */}
            {currentList.length > 0 && (
              <div className="relative">
                <Search
                  size={13}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3"
                />
                <input
                  type="text"
                  value={searchQuery}
                  name="app-decision-search"
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={
                    activeTab === 'blocked'
                      ? 'Search for an app to unblock...'
                      : 'Search an allowed app...'
                  }
                  className="field w-full py-2 pl-9 pr-8 text-xs placeholder:text-fg-3"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear the search"
                    className="pressable absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-fg-3 hover:text-fg"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            )}

            {/* Liste vide si aucune application dans l'onglet */}
            {currentList.length === 0 && !isAnalyzing ? (
              <div className="flex items-center gap-2.5 rounded border border-line bg-surface-2 p-4 text-xs text-fg-2">
                {activeTab === 'blocked' ? (
                  <>
                    <ShieldCheck size={20} className="shrink-0 text-emerald-700 dark:text-emerald-400" />
                    <div>
                      <p className="font-medium text-fg">No distraction identified</p>
                      <p className="mt-0.5 text-fg-3">
                        No app is blocked yet. Switch to the “allowed” tab to name what distracts you.
                      </p>
                      {allowedApps.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setActiveTab('allowed')}
                          className="pressable mt-2 text-xs font-medium text-accent hover:underline"
                        >
                          See the {allowedApps.length} unblocked app(s) →
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <ShieldAlert size={20} className="shrink-0 text-warn" />
                    <div>
                      <p className="font-medium text-fg">No app unblocked</p>
                      <p className="mt-0.5 text-fg-3">
                        Every analysed app is currently on the blocking list.
                      </p>
                      {blockedApps.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setActiveTab('blocked')}
                          className="pressable mt-2 text-xs font-medium text-accent hover:underline"
                        >
                          See the {blockedApps.length} blocked distraction(s) →
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : filteredApps.length === 0 && searchQuery ? (
              <div className="rounded border border-dashed border-line p-6 text-center text-xs text-fg-3">
                No {activeTab === 'blocked' ? 'blocked' : 'unblocked'} app matches “{searchQuery}”.
              </div>
            ) : (
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {filteredApps.map((app) => {
                  const isBlockedView = activeTab === 'blocked'
                  const isCurrentActionOpen =
                    activeActionId?.id === app.identifiant &&
                    activeActionId?.action === (isBlockedView ? 'remove' : 'add')

                  return (
                    <div
                      key={app.identifiant}
                      className="rounded border border-line bg-surface p-3 text-xs transition-colors hover:border-line-strong"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          {/* Logo ou icône de l'application avec pastille de statut */}
                          {app.iconDataUrl ? (
                            <div className="relative shrink-0 mt-0.5">
                              <img
                                src={app.iconDataUrl}
                                alt=""
                                className="h-8 w-8 rounded object-contain bg-surface-2 p-0.5 shadow-sm border border-line/60"
                              />
                              <span
                                className={cn(
                                  'absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-sm bg-surface border border-line shadow-sm',
                                )}
                              >
                                {isBlockedView ? (
                                  <ShieldAlert size={9} className="text-warn" />
                                ) : (
                                  <ShieldCheck size={9} className="text-emerald-700 dark:text-emerald-400" />
                                )}
                              </span>
                            </div>
                          ) : (
                            <div className="relative flex h-8 w-8 shrink-0 mt-0.5 items-center justify-center rounded bg-surface-2 border border-line/60 text-xs font-semibold text-fg-2">
                              {app.nom_affiche.trim().charAt(0).toUpperCase() || '?'}
                              <span
                                className={cn(
                                  'absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-sm bg-surface border border-line shadow-sm',
                                )}
                              >
                                {isBlockedView ? (
                                  <ShieldAlert size={9} className="text-warn" />
                                ) : (
                                  <ShieldCheck size={9} className="text-emerald-700 dark:text-emerald-400" />
                                )}
                              </span>
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-fg truncate">{app.nom_affiche}</p>
                            <p className="mt-0.5 text-fg-3 leading-relaxed text-[11px]">{app.raison}</p>
                          </div>
                        </div>

                        {!isCurrentActionOpen && (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveActionId({ id: app.identifiant, action: isBlockedView ? 'remove' : 'add' })
                              setJustification('')
                              setReviewFeedback(null)
                            }}
                            className={cn(
                              'pressable shrink-0 rounded border px-2.5 py-1 text-[11px] font-medium transition',
                              isBlockedView
                                ? 'border-line text-fg-2 hover:border-fg-3 hover:text-fg'
                                : 'border-line text-fg-2 hover:border-warn hover:text-warn',
                            )}
                          >
                            {isBlockedView ? 'Unblock' : 'Block'}
                          </button>
                        )}
                      </div>

                      {/* Formulaire de demande de déblocage ou blocage */}
                      {isCurrentActionOpen && (
                        <div className="mt-3 border-t border-line pt-2.5">
                          <p className="text-[11px] text-fg-2">
                            {isBlockedView ? (
                              <>
                                Why do you need <strong>{app.nom_affiche}</strong> for this task?
                              </>
                            ) : (
                              <>
                                Pourquoi souhaites-tu bloquer <strong>{app.nom_affiche}</strong> pendant ce travail ?
                              </>
                            )}
                          </p>
                          <input
                            type="text"
                            autoFocus
                            name="blocking-modification-justification"
                            value={justification}
                            onChange={(e) => setJustification(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                if (isBlockedView) {
                                  void handleRequestRemoval(app)
                                } else {
                                  void handleRequestAddBlock(app)
                                }
                              }
                            }}
                            placeholder={
                              isBlockedView
                                ? "Ex: J'en ai besoin pour contacter mon tuteur..."
                                : "Ex: Je risque de m'y disperser..."
                            }
                            className="field mt-1.5 w-full text-xs"
                          />
                          <div className="mt-2 flex items-center justify-end gap-2">
                            <button
                              type="button"
                              disabled={isReviewing}
                              onClick={() => setActiveActionId(null)}
                              className="pressable rounded px-2 py-1 text-[11px] text-fg-3 hover:text-fg"
                            >
                              Annuler
                            </button>
                            <button
                              type="button"
                              disabled={isReviewing}
                              onClick={() => {
                                if (isBlockedView) {
                                  void handleRequestRemoval(app)
                                } else {
                                  void handleRequestAddBlock(app)
                                }
                              }}
                              className="btn-iris pressable rounded px-2.5 py-1 text-[11px]"
                            >
                              {isReviewing ? 'Enregistrement…' : 'Confirmer'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Retour apres la decision de l'utilisateur */}
                      {reviewFeedback && reviewFeedback.id === app.identifiant && (
                        <div
                          className={cn(
                            'mt-2.5 flex items-start gap-1.5 rounded p-2 text-[11px]',
                            reviewFeedback.accepted
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                              : 'bg-amber-500/10 text-amber-800 dark:text-amber-300',
                          )}
                        >
                          <AlertCircle size={14} className="mt-0.5 shrink-0" />
                          <p>{reviewFeedback.reason}</p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Boutons d'action et résumé */}
        <div className="flex items-center justify-between border-t border-line pt-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="pressable rounded border border-line px-3 py-1.5 text-xs text-fg-3 hover:text-fg"
            >
              Annuler
            </button>
            <span className="text-[11px] text-fg-3">
              {blockedApps.length} blocked · {allowedApps.length} unblocked
            </span>
          </div>

          <button
            type="button"
            disabled={isAnalyzing || (!!analysisError && blockedApps.length === 0 && allowedApps.length === 0)}
            onClick={() => onConfirm(blockedApps.map((b) => b.identifiant))}
            className="btn-iris pressable flex items-center gap-1.5 rounded px-4 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            Confirmer et enregistrer
          </button>
        </div>
      </div>
    </Modal>
  )
}
