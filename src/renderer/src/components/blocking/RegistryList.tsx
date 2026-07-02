import { useState, useMemo } from 'react'
import {
  Trash2,
  Edit2,
  EyeOff,
  ChevronDown,
  ChevronRight,
  AppWindow,
  Users,
  MessageCircle,
  Gamepad2,
  Film,
  Music,
  Paintbrush,
  Code2,
  Bot,
  GraduationCap,
  HeartPulse,
  BookOpen,
  Globe2,
  BarChart3,
  ShoppingCart,
  Plane,
  ShieldCheck,
  Wrench,
  MoreHorizontal,
  type LucideIcon,
} from 'lucide-react'
import { useRegistryStore } from '@/store/registry.store'
import { useLevelsStore } from '@/store/levels.store'
import { useTasksStore } from '@/store/tasks.store'
import { ClassificationDialog } from './ClassificationDialog'
import { DistractionWarning } from './DistractionWarning'
import type { RegistryItem } from '@shared/schemas'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { REGISTRY_CATEGORIES } from '@shared/schemas'

type Props = {
  kind: 'site' | 'app'
  query?: string
}

function formatUsage(count: number, kind: 'site' | 'app'): string {
  if (kind === 'site') {
    return count === 1 ? '1 visite' : `${count} visites`
  }
  if (count < 60) {
    return count === 1 ? "1 min d'usage" : `${count} min d'usage`
  }
  const h = Math.floor(count / 60)
  const m = count % 60
  return m === 0 ? `${h} h d'usage` : `${h}h${m} d'usage`
}

type CategoryVisual = { accent: string; Icon: LucideIcon }

const CATEGORY_VISUALS: Record<string, CategoryVisual> = {
  Social: { accent: '#a855f7', Icon: Users },
  Communication: { accent: '#8b5cf6', Icon: MessageCircle },
  Games: { accent: '#ef4444', Icon: Gamepad2 },
  Entertainment: { accent: '#ec4899', Icon: Film },
  'Music & Audio': { accent: '#d946ef', Icon: Music },
  Creativity: { accent: '#3b82f6', Icon: Paintbrush },
  Development: { accent: '#0ea5e9', Icon: Code2 },
  'AI & Automation': { accent: '#84cc16', Icon: Bot },
  Education: { accent: '#10b981', Icon: GraduationCap },
  'Health & Fitness': { accent: '#14b8a6', Icon: HeartPulse },
  'Information & Reading': { accent: '#06b6d4', Icon: BookOpen },
  'Browsers & Internet': { accent: '#22d3ee', Icon: Globe2 },
  'Productivity & Finance': { accent: '#f59e0b', Icon: BarChart3 },
  'Shopping & Food': { accent: '#f97316', Icon: ShoppingCart },
  Travel: { accent: '#6366f1', Icon: Plane },
  Security: { accent: '#22c55e', Icon: ShieldCheck },
  Utilities: { accent: '#94a3b8', Icon: Wrench },
  Other: { accent: '#71717a', Icon: MoreHorizontal },
}

export function RegistryList({ kind, query = '' }: Props) {
  const normalizedQuery = query.trim().toLowerCase()
  const items = useRegistryStore((s) => s.items).filter((item) => {
    if (item.kind !== kind) return false
    if (kind === 'site' && !item.classified) return false
    if (!normalizedQuery) return true
    return [item.displayName, item.identifier, item.executableName]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(normalizedQuery)
  })
  const demoteItem = useRegistryStore((s) => s.demoteItem)
  const objectives = useLevelsStore((s) => s.objectives)
  const tasks = useTasksStore((s) => s.tasks)

  const [editingItem, setEditingItem] = useState<RegistryItem | null>(null)
  const [demotingItemId, setDemotingItemId] = useState<string | null>(null)
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({})

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [cat]: !prev[cat],
    }))
  }

  // Trier par usageCount desc, puis date seen desc
  const sorted = [...items].sort((a, b) => {
    if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount
    return b.lastSeenAt.localeCompare(a.lastSeenAt)
  })

  // Regrouper par catégorie
  const grouped = useMemo(() => {
    const map: Record<string, RegistryItem[]> = {}
    sorted.forEach((item) => {
      const cat = item.category || 'Other'
      if (!map[cat]) map[cat] = []
      map[cat].push(item)
    })
    return map
  }, [sorted])

  const categories = REGISTRY_CATEGORIES.filter((category) => grouped[category])

  const handleDemote = async () => {
    if (demotingItemId) {
      await demoteItem(demotingItemId)
      setDemotingItemId(null)
    }
  }

  if (sorted.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-subtle p-6 text-center text-xs text-text-muted">
        {normalizedQuery
          ? 'Aucun résultat pour cette recherche.'
          : `Aucune ${kind === 'site' ? 'ressource web classifiée' : 'application détectée'} pour le moment.`}
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        {categories.map((cat) => {
          const visual = CATEGORY_VISUALS[cat] ?? CATEGORY_VISUALS.Other!
          const CategoryIcon = visual.Icon
          const isExpanded = Boolean(expandedCategories[cat] || normalizedQuery)
          return (
          <div key={cat} className="space-y-3">
            {/* Entête de catégorie */}
            <button
              onClick={() => toggleCategory(cat)}
              className={cn(
                'group relative flex w-full items-center justify-between overflow-hidden rounded-2xl border px-4 py-3.5 text-left transition-all duration-200',
                isExpanded ? 'shadow-lg' : 'hover:-translate-y-px hover:brightness-110',
              )}
              style={{
                borderColor: `${visual.accent}${isExpanded ? '66' : '2e'}`,
                background: `linear-gradient(105deg, ${visual.accent}20 0%, ${visual.accent}0b 38%, rgba(255,255,255,0.018) 100%)`,
                boxShadow: isExpanded ? `0 12px 32px ${visual.accent}12` : undefined,
              }}
            >
              <span
                className="absolute inset-y-0 left-0 w-1"
                style={{ backgroundColor: visual.accent }}
                aria-hidden="true"
              />
              <div className="flex items-center gap-3.5">
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-xl border"
                  style={{
                    color: visual.accent,
                    borderColor: `${visual.accent}55`,
                    backgroundColor: `${visual.accent}1f`,
                    boxShadow: `0 0 20px ${visual.accent}18`,
                  }}
                >
                  <CategoryIcon size={19} strokeWidth={2} />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-bold uppercase tracking-[0.11em] text-text-primary">
                    {cat}
                  </span>
                  <span className="text-[10px] font-medium text-text-muted">
                    {grouped[cat]!.length} {grouped[cat]!.length === 1 ? 'élément' : 'éléments'}
                  </span>
                </span>
              </div>
              <div className="pr-1 text-text-muted transition-transform duration-200 group-hover:translate-x-0.5">
                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </div>
            </button>

            {(expandedCategories[cat] || Boolean(normalizedQuery)) && (
              <div className="flex flex-col gap-2 pl-4 border-l border-border-subtle/30 ml-4 mt-2">
                {grouped[cat]!.map((item: RegistryItem) => {
                  // Résoudre les noms des objectifs liés
                  const linkedObjs = (item.usefulFor?.objectives ?? [])
                    .map((oid: string) => objectives.find((o: any) => o.id === oid))
                    .filter((o: any): o is NonNullable<typeof o> => Boolean(o))

                  // Résoudre les titres des tâches liées
                  const linkedTskTitles = (item.usefulFor?.standaloneTasks ?? [])
                    .map((tid: string) => tasks.find((t: any) => t.id === tid))
                    .filter((t: any): t is NonNullable<typeof t> => Boolean(t))

                  const isDistraction = item.demoted

                  return (
                    <div
                      key={item.id}
                      className="info-panel flex items-center justify-between gap-4 rounded-xl px-5 py-4 transition-all duration-200"
                    >
                      {/* Infos */}
                      {kind === 'app' && (
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border-subtle bg-white/5 shadow-sm">
                          {item.iconDataUrl ? (
                            <img
                              src={item.iconDataUrl}
                              alt=""
                              className="h-8 w-8 object-contain"
                              draggable={false}
                            />
                          ) : (
                            <AppWindow size={20} className="text-text-muted" aria-hidden="true" />
                          )}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-text-primary">
                            {item.displayName}
                          </span>
                          <span className="text-[10px] font-mono text-text-muted truncate max-w-[180px] xl:max-w-xs">
                            {item.executableName ?? item.identifier}
                          </span>
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                          <span>{formatUsage(item.usageCount, kind)}</span>
                          <span>·</span>
                          <span>Vu le {new Date(item.lastSeenAt).toLocaleDateString('fr-FR')}</span>
                        </div>

                        {/* Badges de classification */}
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {!item.classified ? (
                            <span className="inline-flex items-center gap-1 rounded bg-yellow/10 border border-yellow/20 px-2 py-0.5 text-[10px] font-semibold text-yellow uppercase tracking-wider">
                              À classifier
                            </span>
                          ) : isDistraction ? (
                            <span className="inline-flex items-center gap-1 rounded bg-red-500/10 border border-red-500/20 px-2 py-0.5 text-[10px] font-semibold text-red-400 uppercase tracking-wider">
                              <EyeOff size={10} />
                              Distraction
                            </span>
                          ) : linkedObjs.length === 0 && linkedTskTitles.length === 0 ? (
                            <span className="inline-flex items-center gap-1 rounded bg-yellow/10 border border-yellow/20 px-2 py-0.5 text-[10px] font-semibold text-yellow uppercase tracking-wider">
                              Classé outil (non lié)
                            </span>
                          ) : (
                            <>
                              {linkedObjs.map((obj: any) => (
                                <span
                                  key={obj.id}
                                  className="inline-flex items-center gap-1 rounded bg-white/5 border border-border-subtle px-2 py-0.5 text-[10px] font-medium text-text-secondary"
                                >
                                  <span
                                    className="h-1.5 w-1.5 rounded-full"
                                    style={{ backgroundColor: obj.color }}
                                  />
                                  Utile : {obj.name}
                                </span>
                              ))}
                              {linkedTskTitles.map((t: any) => (
                                <span
                                  key={t.id}
                                  className="inline-flex items-center gap-1 rounded bg-white/5 border border-border-subtle px-2 py-0.5 text-[10px] font-medium text-text-secondary"
                                >
                                  Utile : {t.title}
                                </span>
                              ))}
                            </>
                          )}
                          {item.blockable === false && (
                            <span className="inline-flex items-center rounded bg-white/5 border border-border-subtle px-2 py-0.5 text-[10px] text-text-muted">
                              Installée · cible de blocage non résolue
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        {!item.classified ? (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => setEditingItem(item)}
                            className="h-8 px-3 border-yellow/20 bg-yellow/10 text-yellow hover:bg-yellow/20"
                          >
                            Classifier
                          </Button>
                        ) : !isDistraction ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingItem(item)}
                              className="h-8 px-2.5"
                            >
                              <Edit2 size={12} className="mr-1" />
                              Lier
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDemotingItemId(item.id)}
                              className="h-8 px-2.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 hover:border-red-500/20"
                            >
                              <Trash2 size={12} className="mr-1" />
                              Rétrograder
                            </Button>
                          </>
                        ) : (
                          <span className="text-[10px] text-text-muted italic px-2">Bloqué d&apos;office</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          )
        })}
      </div>

      {editingItem && (
        <ClassificationDialog
          item={editingItem}
          isEditing={editingItem.classified}
          onClose={() => setEditingItem(null)}
        />
      )}

      <DistractionWarning
        open={demotingItemId !== null}
        title="Dégager cette ressource en distraction ?"
        message="Vous allez rétrograder définitivement cet outil de travail. Il sera immédiatement considéré comme une distraction et bloqué sur toutes vos prochaines sessions d'étude, sans possibilité de retour en arrière."
        onConfirm={handleDemote}
        onCancel={() => setDemotingItemId(null)}
      />
    </>
  )
}
