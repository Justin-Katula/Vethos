import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown, Shield, ShieldCheck } from 'lucide-react'
import { useRegistryStore } from '@/store/registry.store'
import { useUserModelStore } from '@/store/user-model.store'
import { useTasksStore } from '@/store/tasks.store'
import { useSettingsStore } from '@/store/settings.store'
import { useLevelsStore } from '@/store/levels.store'
import { scoreObjectivePriorityV2 } from '@/lib/objective-priority-scorer-v2'
import { scoreTaskPriorityV2 } from '@/lib/task-priority-scorer-v2'
import { buildTaskModelV2 } from '@/lib/task-model-builder'
import { selectPrimaryObjectiveId } from '@/lib/priority-engine'
import { buildPriorityUiData } from '@/lib/priority-ui-data'
import type { ObjectiveModelV2 } from '@shared/objective-model'
import {
  OBJECTIVE_LEVEL_MAX,
  type BlockingHistoryEntry,
  type Objective,
  type TimeRule,
} from '@shared/schemas'
import { iconByName } from '@/lib/rule-palette'
import { cn } from '@/lib/cn'
import { momentumPhrase, priorityPhrase, protectionPhrase, stagnationPhrase, urgencyPhrase, workloadPhrase } from '@/lib/human-score-language'
import { LevelRing } from './LevelRing'

type Props = {
  objective: Objective
  model?: ObjectiveModelV2
  rules: TimeRule[]
  /**
   * Historique de sessions de blocage. Réservé pour un affichage futur des
   * minutes effectives sur 7 jours (la fonction `minutesThisWeek` a été
   * retirée en attendant que la carte affiche cette information).
   */
  history: BlockingHistoryEntry[]
  urgency?: 'warning' | 'critical'
  onClick?: () => void
}

const MotionCard = motion.div

export function ObjectiveCard({
  objective,
  model,
  rules,
  history: _history,
  urgency,
  onClick,
}: Props): JSX.Element {
  const [showWhy, setShowWhy] = useState(false)
  const registry = useRegistryStore((s) => s.items)
  const userModel = useUserModelStore((s) => s.model)
  const tasks = useTasksStore((s) => s.tasks)
  const engineV2Priority = useSettingsStore((s) => s.engineV2Priority)
  const objectives = useLevelsStore((s) => s.objectives)

  const uiData = useMemo(() => {
    if (!engineV2Priority || !model) return null
    try {
      const now = new Date()
      const primaryObjectiveId = selectPrimaryObjectiveId(objectives, userModel)
      
      const objTasks = tasks.filter((t) => t.linkedObjectiveId === objective.id)
      const linkedTaskScores = objTasks.map((t) => {
        const taskModel = buildTaskModelV2({
          task: t,
          objective,
          objectiveModel: model,
          registry,
          now,
        })
        return scoreTaskPriorityV2({
          taskModelV2: taskModel,
          linkedObjectiveModelV2: model,
          userModel: userModel ?? null,
          planningContext: null,
          cognitiveModel: null,
          completionGateResult: null,
          oldScore: undefined,
          now,
        })
      })

      const scoreV2 = scoreObjectivePriorityV2({
        objectiveModelV2: model,
        linkedTaskScores,
        userModel: userModel ?? null,
        planningContext: null,
        cognitiveModel: null,
        oldScore: undefined,
        now,
      })

      return buildPriorityUiData(scoreV2)
    } catch (e) {
      console.error('Failed to compute V2 objective score in ObjectiveCard:', e)
      return null
    }
  }, [objective, model, registry, userModel, tasks, engineV2Priority, objectives])

  const Icon = iconByName(objective.icon)
  const integerLevel = Math.floor(objective.level)
  const progress = objective.level - integerLevel
  const linkedNames = rules
    .filter((r) => objective.linkedRuleIds.includes(r.id))
    .map((r) => r.name)
  const urgencyBorder =
    urgency === 'critical'
      ? 'border-red-500/70'
      : urgency === 'warning'
        ? 'border-orange/70'
        : 'border-border-subtle'

  return (
    <MotionCard
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onClick?.() }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'info-panel group w-full rounded-xl bg-bg-elevated p-5 text-left',
        urgencyBorder,
      )}
    >
      <div className="relative flex flex-col space-y-4 w-full">
        {/* Header Row */}
        <div className="flex items-center justify-between">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-bg-base/50 transition-all duration-300 group-hover:scale-105"
            style={{ 
              borderColor: `${objective.color}33`,
              color: objective.color,
              boxShadow: `0 0 12px ${objective.color}11`
            }}
          >
            {Icon ? <Icon size={18} /> : <span className="text-sm font-semibold">{objective.name.charAt(0)}</span>}
          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-semibold px-2.5 py-1 rounded-lg backdrop-blur-sm bg-white/5 border border-border-subtle/50 text-text-secondary transition-colors duration-300 group-hover:bg-white/10 group-hover:text-text-primary"
            >
              Niveau {objective.level.toFixed(1)}
            </span>
            <LevelRing
              level={integerLevel}
              progress={progress}
              size={36}
              color={objective.color}
              isMax={integerLevel >= OBJECTIVE_LEVEL_MAX}
            />
          </div>
        </div>

        {/* Title & Description */}
        <div className="space-y-1.5">
          <h3 className="font-semibold text-text-primary tracking-tight text-[15px] leading-snug">
            {objective.name}
          </h3>
          {objective.description && (
            <p className="text-xs text-text-secondary leading-relaxed font-[400] line-clamp-2">
              {objective.description}
            </p>
          )}
          {model && (
            <p className="text-xs text-text-secondary leading-relaxed line-clamp-2">
              {model.mission.missionStatement}
            </p>
          )}
        </div>

        {model && (
          <div className="grid grid-cols-1 gap-1.5 text-[11px] text-text-secondary">
            <span>Progression <strong className="text-text-primary">{model.progress.progressPercent}%</strong></span>
            <span>Cette semaine <strong className="text-text-primary">{Math.floor(model.progress.investedMinutesThisWeek / 60)}h{String(model.progress.investedMinutesThisWeek % 60).padStart(2, '0')}</strong></span>
            <span className="truncate">Prochaine action : <strong className="text-text-primary">{model.nextAction.label}</strong></span>
            {uiData ? (
              <>
                <span>Priorité : <strong className="text-text-primary capitalize">{uiData.priorityLabel}</strong></span>
                <span>Urgence : <span className="capitalize">{uiData.urgencyLabel}</span></span>
                <span>Risque : <span className="capitalize">{uiData.riskLabel === 'safe' ? 'sûr' : uiData.riskLabel === 'watch' ? 'à surveiller' : uiData.riskLabel === 'at_risk' ? 'à risque' : 'critique'}</span></span>
                <span>Faisabilité : <span className="capitalize">{uiData.feasibilityLabel === 'easy' ? 'facile' : uiData.feasibilityLabel === 'possible' ? 'possible' : uiData.feasibilityLabel === 'tight' ? 'serrée' : uiData.feasibilityLabel === 'hard' ? 'difficile' : 'impossible'}</span></span>
                <span>Protection : <span className="capitalize">{uiData.protectionLabel === 'none' ? 'aucune' : uiData.protectionLabel === 'light' ? 'légère' : uiData.protectionLabel === 'normal' ? 'normale' : uiData.protectionLabel === 'strong' ? 'forte' : 'stricte'}</span></span>
              </>
            ) : (
              <>
                <span>{priorityPhrase(objective.priorityScoreV2?.priorityScore ?? model.mission.declaredImportanceScore)}</span>
                <span>{urgencyPhrase(objective.priorityScoreV2?.urgencyScore ?? model.risk.deadlineRiskScore)}</span>
                <span>{workloadPhrase(objective.priorityScoreV2?.workloadScore ?? model.risk.overloadRiskScore)}</span>
                <span>{stagnationPhrase(objective.priorityScoreV2?.stagnationScore ?? model.risk.stagnationScore)}</span>
                <span>{momentumPhrase(objective.priorityScoreV2?.momentumScore ?? model.progress.momentumScore)}</span>
                <span>{protectionPhrase(model.protection.recommendedProtectionLevel)}</span>
              </>
            )}
          </div>
        )}

        {/* Meta / Badges Row */}
        <div className="flex flex-wrap items-center gap-1.5 pt-3 border-t border-border-subtle/40">
          {objective.blocking?.enabled && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-white/5 border border-border-subtle/50 px-2.5 py-0.5 text-[10px] font-medium text-text-secondary">
              {objective.blocking.mode === 'allowlist' ? (
                <ShieldCheck size={11} className="text-emerald-400" />
              ) : (
                <Shield size={11} className="text-accent" />
              )}
              {objective.blocking.mode === 'allowlist' ? 'Focus strict' : 'Filtre actif'}
            </span>
          )}

          {linkedNames.slice(0, 2).map((n) => (
            <span
              key={n}
              className="rounded-lg bg-white/5 border border-border-subtle/50 px-2.5 py-0.5 text-[10px] text-text-secondary"
            >
              {n}
            </span>
          ))}
          {linkedNames.length > 2 && (
            <span className="rounded-lg bg-white/5 border border-border-subtle/50 px-2.5 py-0.5 text-[10px] text-text-muted">
              +{linkedNames.length - 2}
            </span>
          )}
          {model && (
            <button
              type="button"
              className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-text-secondary hover:bg-white/10"
              onClick={(event) => { event.stopPropagation(); setShowWhy((value) => !value) }}
              aria-expanded={showWhy}
            >
              Pourquoi ? <ChevronDown size={11} className={cn('transition-transform', showWhy && 'rotate-180')} />
            </button>
          )}
        </div>
        {model && showWhy && (
          <div className="rounded-lg border border-border-subtle/50 bg-bg-base/50 p-3 text-[11px] leading-relaxed text-text-secondary space-y-1">
            {uiData ? (
              <>
                <p className="font-semibold text-text-primary">{uiData.mainReason}</p>
                {uiData.why.slice(1).map((reason) => (
                  <p key={reason}>• {reason}</p>
                ))}
                {uiData.warnings.map((warning) => (
                  <p key={warning} className="text-accent">• Attention : {warning}</p>
                ))}
              </>
            ) : (
              <>
                <p className="text-text-primary">{model.explanation.summary}</p>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  {model.explanation.reasons.slice(0, 4).map((reason) => <li key={reason}>{reason}</li>)}
                </ul>
              </>
            )}
          </div>
        )}
      </div>

      {/* Decorative gradient border outline */}
      <div className="absolute inset-0 -z-10 rounded-xl p-px bg-gradient-to-br from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
    </MotionCard>
  )
}
