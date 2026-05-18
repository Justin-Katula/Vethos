import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, AlertTriangle, ShieldCheck, Wrench } from 'lucide-react'
import { PageTransition } from '@/components/PageTransition'
import { useBlockingStore } from '@/store/blocking.store'
import { ActiveSessionCard } from '@/components/blocking/ActiveSessionCard'
import { ProfileCard } from '@/components/blocking/ProfileCard'
import { ProfileEditor } from '@/components/blocking/ProfileEditor'
import { UnlockModal } from '@/components/blocking/UnlockModal'
import { HistoryList } from '@/components/blocking/HistoryList'
import { PageSkeleton, SkeletonCard } from '@/components/ui/Skeleton'
import { useToast } from '@/lib/use-toast'
import type { BlockingProfile } from '@shared/schemas'

export default function BlockingPage() {
  const {
    loaded,
    serviceStatus,
    serviceRepairing,
    state,
    active,
    layerStatus,
    load,
    saveProfile,
    deleteProfile,
    startSession,
    requestUnlock,
    submitJustification,
    repairService,
  } = useBlockingStore()

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingProfile, setEditingProfile] = useState<BlockingProfile | null>(null)
  const [unlockOpen, setUnlockOpen] = useState(false)
  const [duration, setDuration] = useState(60)
  const toast = useToast()

  useEffect(() => {
    void load()
  }, [load])

  const sortedProfiles = useMemo(() => state.profiles.slice().reverse(), [state.profiles])

  const openEditor = (p: BlockingProfile | null) => {
    setEditingProfile(p)
    setEditorOpen(true)
  }

  const handleStart = async (p: BlockingProfile) => {
    if (serviceStatus !== 'ok') {
      toast.error({
        title: 'Service indisponible',
        description: 'Répare le service de blocage avant de démarrer une session.',
      })
      return
    }
    await startSession(p.id, duration).catch((err) => {
      toast.error({
        title: 'Démarrage impossible',
        description: (err as Error).message,
      })
    })
  }

  const handleRequestUnlock = async () => {
    await requestUnlock()
    setUnlockOpen(true)
  }

  const handleRepairService = async () => {
    const launched = await repairService()
    if (launched) {
      toast.success({
        title: 'Réparation lancée',
        description: 'Windows peut demander une confirmation administrateur.',
      })
    } else {
      toast.error({
        title: 'Réparation annulée',
        description: "Le service n'a pas pu être relancé avec les droits administrateur.",
      })
    }
  }

  if (!loaded) {
    return (
      <PageTransition>
        <PageSkeleton>
          <div className="space-y-2">
            <div className="h-8 w-40 animate-pulse rounded bg-bg-card" />
            <div className="h-3 w-60 animate-pulse rounded bg-bg-card" />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </PageSkeleton>
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <div className="flex h-full flex-col gap-8 overflow-y-auto px-12 pb-16 pt-16">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">Blocage</h1>
          <p className="mt-2 max-w-2xl text-sm text-text-secondary">
            {
              "Crée des sanctuaires d'attention. Décide à froid pour t'épargner les arbitrages à chaud."
            }
          </p>
        </header>

        {serviceStatus !== 'ok' && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-3 rounded-lg border border-orange/40 bg-orange/10 px-4 py-3 text-sm text-orange"
          >
            <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-medium text-orange">Service de blocage indisponible</div>
              <p className="mt-0.5 text-xs text-orange/80">
                {
                  "Les sessions restent verrouillées tant que le service Windows Nexus n'est pas joignable."
                }
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleRepairService()}
              disabled={serviceRepairing}
              className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-orange/40 px-3 py-1.5 text-xs font-medium text-orange transition-colors hover:border-orange hover:bg-orange/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Wrench size={12} strokeWidth={2.5} />
              {serviceRepairing ? 'Réparation...' : 'Réparer'}
            </button>
          </motion.div>
        )}

        {active ? (
          <ActiveSessionCard
            session={active}
            layerStatus={layerStatus}
            onRequestStop={handleRequestUnlock}
          />
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-3 rounded-lg border border-border-subtle bg-bg-card px-5 py-4 text-sm text-text-secondary"
          >
            <ShieldCheck size={18} className="text-emerald-400" />
            <span>Aucune session active. Choisis un profile pour commencer.</span>
            <div className="ml-auto flex items-center gap-2">
              {state.nextSessionPenaltyMinutes > 0 && (
                <span className="rounded-md border border-orange/30 bg-orange/10 px-2 py-1 text-xs font-medium text-orange">
                  +{state.nextSessionPenaltyMinutes} min prochaine session
                </span>
              )}
              <label className="text-xs text-text-muted">Durée :</label>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="rounded-md border border-border-subtle bg-bg-base px-2 py-1 text-xs text-text-primary"
              >
                <option value={10}>10 min</option>
                <option value={30}>30 min</option>
                <option value={60}>1h</option>
                <option value={90}>1h30</option>
                <option value={120}>2h</option>
                <option value={240}>4h</option>
              </select>
            </div>
          </motion.div>
        )}

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted">
              Profiles
            </h2>
            <button
              type="button"
              onClick={() => openEditor(null)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle bg-bg-card px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
            >
              <Plus size={12} strokeWidth={2.5} />
              Nouveau profile
            </button>
          </div>
          {sortedProfiles.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border-subtle p-12 text-center">
              <div className="text-sm text-text-secondary">Pas encore de profile.</div>
              <div className="mt-1 text-xs text-text-muted">
                {"Crée ton premier sanctuaire d'attention pour démarrer."}
              </div>
              <button
                type="button"
                onClick={() => openEditor(null)}
                className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
              >
                <Plus size={14} strokeWidth={2.5} />
                Créer un profile
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {sortedProfiles.map((p) => (
                <ProfileCard
                  key={p.id}
                  profile={p}
                  disabled={!!active || serviceStatus !== 'ok'}
                  onStart={handleStart}
                  onEdit={openEditor}
                />
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-text-muted">
            Historique
          </h2>
          <HistoryList items={state.history.slice(0, 30)} profiles={state.profiles} />
        </section>
      </div>

      <ProfileEditor
        open={editorOpen}
        initial={editingProfile}
        onClose={() => setEditorOpen(false)}
        onSave={saveProfile}
        onDelete={deleteProfile}
      />

      <UnlockModal
        open={unlockOpen}
        session={active}
        onClose={() => setUnlockOpen(false)}
        onSubmit={submitJustification}
      />
    </PageTransition>
  )
}
