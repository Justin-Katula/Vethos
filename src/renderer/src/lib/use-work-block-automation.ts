import { useEffect, useMemo, useRef } from 'react'
import { SLEEP_LOCKDOWN_PROCESS_MARKER, SLEEP_LOCKDOWN_PROFILE_ID } from '@shared/blocking'
import type {
  ActiveSession,
  Settings,
  UnlockPolicy,
} from '@shared/schemas'
import type { ProposedPlacementBlock } from '@shared/placement-model'
import type { SessionPlanV2 } from '@shared/session-model'
import { sessionFlags } from '@shared/session-flags'
import type { PlacedBlock } from './placement-engine'
import { minuteToClockLabel } from './format-time'
import { vethos } from './ipc'
import { localDateKey } from './use-placement'
import { useBlockingStore } from '@/store/blocking.store'
import { useLevelsStore } from '@/store/levels.store'
import { useScheduleStore } from '@/store/schedule.store'
import { useTasksStore } from '@/store/tasks.store'
import { useToastStore } from '@/store/toast.store'
import { useRegistryStore } from '@/store/registry.store'
import { useSettingsStore } from '@/store/settings.store'
import { useUserModelStore } from '@/store/user-model.store'
import { resolveBlockingForBlock } from './blocking-resolver'
import { getEngineFlags, withV1FallbackSync } from './engine-activation'
import { buildSessionPlanFromBlock } from './session-plan-engine'
import type { SessionPlan } from '@shared/engine-results'
import { useDecisionLogStore } from '@/store/decision-log.store'
import { useSessionV2Store } from '@/store/session-v2.store'
import { buildPlanningContextV2 } from './planning-context-snapshot'
import { buildLiveSessionPlan } from './live-session-plan-builder'
import { buildRuntimeCoordinatorPlanV2 } from './runtime-coordinator-plan-builder'
import { runtimeCoordinatorV2Enabled } from '@shared/runtime-coordinator-flags'
import { useRuntimeCoordinatorStore } from '@/store/runtime-coordinator.store'
import { buildSessionInterruptionPolicy, type SessionInterruptionPolicyResult } from './session-interruption-policy'

const AUTO_PROFILE_ID = '00000000-0000-4000-8000-000000000042'
const SLEEP_LOCKDOWN_SITES = [
  'youtube.com',
  'tiktok.com',
  'instagram.com',
  'facebook.com',
  'x.com',
  'twitter.com',
  'reddit.com',
  'twitch.tv',
  'netflix.com',
  'discord.com',
  'snapchat.com',
  'pinterest.com',
  'spotify.com',
]

type CurrentWorkBlock = PlacedBlock & ({
  kind: 'task' | 'objective'
} | {
  sourcePlacementBlock: ProposedPlacementBlock & { targetType: 'strategy_block' }
})

export function useWorkBlockAutomation(now: Date, blocks: PlacedBlock[]): void {
  const tasks = useTasksStore((s) => s.tasks)
  const tasksUserId = useTasksStore((s) => s.userId)
  const tasksLoaded = useTasksStore((s) => s.loaded)
  const loadTasks = useTasksStore((s) => s.load)
  const objectives = useLevelsStore((s) => s.objectives)
  const levelsLoaded = useLevelsStore((s) => s.loaded)
  const loadLevels = useLevelsStore((s) => s.load)
  const scheduleLoaded = useScheduleStore((s) => s.loaded)
  const rules = useScheduleStore((s) => s.rules)
  const entries = useScheduleStore((s) => s.entries)
  const loadSchedule = useScheduleStore((s) => s.load)
  const blockingLoaded = useBlockingStore((s) => s.loaded)
  const loadBlocking = useBlockingStore((s) => s.load)
  const serviceStatus = useBlockingStore((s) => s.serviceStatus)
  const active = useBlockingStore((s) => s.active)
  const registry = useRegistryStore((s) => s.items)
  const registryLoaded = useRegistryStore((s) => s.loaded)
  const loadRegistry = useRegistryStore((s) => s.load)
  const saveProfile = useBlockingStore((s) => s.saveProfile)
  const startSession = useBlockingStore((s) => s.startSession)
  const settingsLoaded = useSettingsStore((s) => s.loaded)
  const sleepLockdownSkippedDate = useSettingsStore((s) => s.sleepLockdownSkippedDate)
  const engineV2Placement = useSettingsStore((s) => s.engineV2Placement)
  const engineV2Blocking = useSettingsStore((s) => s.engineV2Blocking)
  const engineV2Priority = useSettingsStore((s) => s.engineV2Priority)
  const engineV2Completion = useSettingsStore((s) => s.engineV2Completion)
  const engineV2Execution = useSettingsStore((s) => s.engineV2Execution)
  const userModel = useUserModelStore((s) => s.model)
  const currentMinute = now.getHours() * 60 + now.getMinutes()
  const todayStr = localDateKey(now)
  const notifiedBlockRef = useRef<string | null>(null)
  const startedBlockRef = useRef<string | null>(null)
  const startedRuleRef = useRef<string | null>(null)
  const startedSleepRef = useRef<string | null>(null)
  const autoStartInFlightRef = useRef(false)
  const blockedPlanSignatureRef = useRef<string | null>(null)

  useEffect(() => {
    if (!tasksUserId) return
    if (!scheduleLoaded) void loadSchedule(tasksUserId)
    if (!tasksLoaded) void loadTasks(tasksUserId)
    if (!levelsLoaded) void loadLevels(tasksUserId)
    if (!blockingLoaded) void loadBlocking(tasksUserId)
    if (!registryLoaded) void loadRegistry(tasksUserId)
    const sessionStore = useSessionV2Store.getState()
    if (sessionStore.userId !== tasksUserId) sessionStore.setUserId(tasksUserId)
    if (!sessionStore.loaded) void sessionStore.load(tasksUserId)
  }, [
    blockingLoaded,
    levelsLoaded,
    loadBlocking,
    loadLevels,
    loadSchedule,
    loadTasks,
    scheduleLoaded,
    tasksLoaded,
    tasksUserId,
    registryLoaded,
    loadRegistry,
  ])

  const ruleById = useMemo(() => new Map(rules.map((rule) => [rule.id, rule])), [rules])
  const currentBlock = useMemo<CurrentWorkBlock | null>(() => {
    return (
      blocks.find(
        (block): block is CurrentWorkBlock =>
          (block.kind === 'task' || block.kind === 'objective' || block.sourcePlacementBlock?.targetType === 'strategy_block') &&
          block.date === todayStr &&
          block.startMinute <= currentMinute &&
          currentMinute < block.endMinute,
      ) ?? null
    )
  }, [blocks, currentMinute, todayStr])
  const currentLinkedRuleEntry = useMemo(() => {
    const dayOfWeek = (now.getDay() + 6) % 7
    return (
      entries.find((entry) => {
        if (entry.dayOfWeek !== dayOfWeek) return false
        if (entry.startMinute > currentMinute || currentMinute >= entry.endMinute) return false
        return Boolean(ruleById.get(entry.ruleId)?.linkedProfileId)
      }) ?? null
    )
  }, [currentMinute, entries, now, ruleById])
  const currentSleepEntry = useMemo(() => {
    const dayOfWeek = (now.getDay() + 6) % 7
    return (
      entries.find((entry) => {
        if (entry.dayOfWeek !== dayOfWeek) return false
        if (entry.startMinute > currentMinute || currentMinute >= entry.endMinute) return false
        return ruleById.get(entry.ruleId)?.categoryType === 'sleep'
      }) ?? null
    )
  }, [currentMinute, entries, now, ruleById])
  const previousLocalDate = useMemo(() => {
    const previous = new Date(now)
    previous.setDate(previous.getDate() - 1)
    return localDateKey(previous)
  }, [now])
  const sleepLockdownSkippedForCurrentNight =
    import.meta.env.DEV ||
    sleepLockdownSkippedDate === todayStr ||
    (currentSleepEntry?.startMinute === 0 && sleepLockdownSkippedDate === previousLocalDate)

  useEffect(() => {
    if (!currentBlock) return
    if (notifiedBlockRef.current === currentBlock.id) return
    notifiedBlockRef.current = currentBlock.id
    void vethos.tasks
      .notify({
        type: 'work-block-started',
        title: currentBlock.label,
        startLabel: minuteToClockLabel(currentBlock.startMinute),
        endLabel: minuteToClockLabel(currentBlock.endMinute),
      })
      .catch(() => undefined)
    useToastStore.getState().push({
      variant: 'info',
      title: "C'est l'heure",
      description: `${currentBlock.label} · ${minuteToClockLabel(currentBlock.startMinute)} - ${minuteToClockLabel(currentBlock.endMinute)}`,
    })
  }, [currentBlock])

  useEffect(() => {
    if (!settingsLoaded) return
    if (sleepLockdownSkippedForCurrentNight) return
    if (!currentSleepEntry) return
    if (!tasksUserId) return
    if (serviceStatus !== 'ok' || autoStartInFlightRef.current) return
    if (isSleepLockdownSession(active)) return

    const sleepKey = `${todayStr}:${currentSleepEntry.id}`
    if (startedSleepRef.current === sleepKey) return

    startedSleepRef.current = sleepKey
    autoStartInFlightRef.current = true
    const remainingMinutes = Math.max(1, currentSleepEntry.endMinute - currentMinute)

    void startSleepLockdownSession({
      remainingMinutes,
      saveProfile,
      startSession,
    })
      .then(() => {
        useToastStore.getState().push({
          variant: 'info',
          title: 'Mode sommeil verrouillé',
          description: `${minuteToClockLabel(currentSleepEntry.startMinute)} - ${minuteToClockLabel(currentSleepEntry.endMinute)}`,
        })
      })
      .catch((err) => {
        startedSleepRef.current = null
        useToastStore.getState().push({
          variant: 'error',
          title: 'Blocage sommeil non démarré',
          description: err instanceof Error ? err.message : String(err),
        })
      })
      .finally(() => {
        autoStartInFlightRef.current = false
      })
  }, [
    active,
    currentMinute,
    currentSleepEntry,
    saveProfile,
    serviceStatus,
    settingsLoaded,
    sleepLockdownSkippedForCurrentNight,
    startSession,
    tasksUserId,
    todayStr,
  ])

  useEffect(() => {
    if (!currentBlock) return

    if (!tasksUserId) return
    if (!sessionFlags.sessionControlsAutoStart) return
    if (startedBlockRef.current === currentBlock.id) return
    if (active || serviceStatus !== 'ok' || autoStartInFlightRef.current) return

    const flags = getEngineFlags({
      engineV2Placement,
      engineV2Blocking,
      engineV2Priority,
      engineV2Completion,
      engineV2Execution,
    })

    let payload: {
      blockedSites: string[]
      blockedProcesses: string[]
      blockedNetworkApps: string[]
      unlockPolicy: UnlockPolicy
      label: string
      mode?: 'blocklist' | 'allowlist'
    } | null = null
    let decisionSessionPlan: SessionPlan | null = null
    let sessionPlanV2: SessionPlanV2 | null = null

    if (sessionFlags.sessionPlanV2Enabled && sessionFlags.sessionControlsBlocking) {
      const settings = useSettingsStore.getState()
      const sessionSettings = settingsForSession(settings)
      const placementBlock = currentBlock.sourcePlacementBlock ?? proposedBlockFromRuntime(currentBlock)
      const planningContext = buildPlanningContextV2({
        userId: tasksUserId,
        dateRange: { startDate: todayStr, endDate: todayStr },
        schedule: { rules, entries },
        settings: sessionSettings,
        now,
      })
      sessionPlanV2 = buildLiveSessionPlan({
        userId: tasksUserId,
        placementBlock,
        placementPlanV2: currentBlock.sourcePlacementPlanV2,
        tasks,
        objectives,
        registry,
        userModel,
        planningContext,
        now,
        engineActivation: { engineV2Priority, engineV2Placement, engineV2Blocking },
      })
      void useSessionV2Store.getState().upsertPlan(sessionPlanV2)

      // Point 9 — Coordination runtime V2 : on construit le plan de protection
      // runtime (consultatif) depuis le SessionPlanV2 actif et on l'expose au
      // panneau debug dev. Aucune opération système réelle n'est déclenchée ici
      // (les runtimeCoordinatorControls* restent false). Le flag permet un rollback.
      if (runtimeCoordinatorV2Enabled) {
        try {
          const coordinatorPlan = buildRuntimeCoordinatorPlanV2({
            userId: tasksUserId,
            sessionPlan: sessionPlanV2,
            now: now.toISOString(),
          })
          useRuntimeCoordinatorStore.getState().setPlan(coordinatorPlan)
        } catch (err) {
          // Le coordinator reste consultatif : une erreur ne doit jamais bloquer
          // le démarrage de session réel (géré par le pipeline V1 ci-dessous).
          console.error('[RuntimeCoordinatorV2] erreur de construction du plan :', err)
        }
      }

      if (!sessionPlanV2.preflight.canStart || sessionPlanV2.lifecycle.initialState === 'invalid') {
        const description = sessionPlanV2.preflight.blockers[0] ?? 'Le contrat de session exige une revue manuelle.'
        const signature = `${currentBlock.id}:${description}`
        if (blockedPlanSignatureRef.current !== signature) {
          blockedPlanSignatureRef.current = signature
          useToastStore.getState().push({ variant: 'error', title: 'Session non démarrée', description })
        }
        return
      }
      blockedPlanSignatureRef.current = null
      const interruptionPolicy = buildSessionInterruptionPolicy({ sessionPlan: sessionPlanV2, userModel })
      payload = mapSessionPlanV2ToSessionPayload(sessionPlanV2, currentBlock.label, sessionSettings, interruptionPolicy)
    }

    if (!payload && flags.newSessionPlanControlsBlocking) {
      payload = withV1FallbackSync({
        v2: () => {
          const currentTask = currentBlock.refId && currentBlock.kind === 'task'
            ? tasks.find((t) => t.id === currentBlock.refId)
            : null
          const currentObjective = currentBlock.refId && currentBlock.kind === 'objective'
            ? objectives.find((o) => o.id === currentBlock.refId)
            : null
          const activeObjectiveTask = currentObjective
            ? tasks.filter((task) => task.linkedObjectiveId === currentObjective.id && task.status === 'active')
                .sort((left, right) => right.level - left.level || left.deadline.localeCompare(right.deadline))[0] ?? null
            : null

          const settings = useSettingsStore.getState()
          const sessionPlan = buildSessionPlanFromBlock(
            currentBlock,
            currentTask,
            currentObjective,
            registry,
            settingsForSession(settings),
            { activeTask: activeObjectiveTask, userModel },
          )
          decisionSessionPlan = sessionPlan
          return mapSessionPlanToSessionPayload(sessionPlan, currentBlock.label)
        },
        v1: () => {
          const payloadV1 = resolveBlockingForBlock(currentBlock, registry, objectives, tasks)
          if (!payloadV1) return null
          return {
            ...payloadV1,
            mode: 'blocklist' as const,
          }
        },
        label: 'use-work-block-automation-v2',
      })
    } else if (!payload) {
      const payloadV1 = resolveBlockingForBlock(currentBlock, registry, objectives, tasks)
      payload = payloadV1 ? { ...payloadV1, mode: 'blocklist' as const } : null
    }

    if (!payload) return

    startedBlockRef.current = currentBlock.id
    autoStartInFlightRef.current = true
    const remainingMinutes = Math.max(1, currentBlock.endMinute - currentMinute)

    void startRegistryBlockingSession({
      block: currentBlock,
      payload,
      remainingMinutes,
      saveProfile,
      startSession,
    })
      .then((runtimeSession) => {
        if (sessionPlanV2) {
          void useSessionV2Store.getState().activate(sessionPlanV2, runtimeSession)
        }
        if (!decisionSessionPlan) return
        void useDecisionLogStore.getState().record({
          type: 'session_plan',
          targetType: decisionSessionPlan.targetType,
          targetId: decisionSessionPlan.targetId,
          sessionPlan: decisionSessionPlan,
        })
      })
      .catch((err) => {
        startedBlockRef.current = null
        useToastStore.getState().push({
          variant: 'error',
          title: 'Blocage non démarré',
          description: err instanceof Error ? err.message : String(err),
        })
      })
      .finally(() => {
        autoStartInFlightRef.current = false
      })
  }, [
    active,
    currentBlock,
    currentMinute,
    registry,
    objectives,
    tasks,
    saveProfile,
    serviceStatus,
    startSession,
    tasksUserId,
    engineV2Placement,
    engineV2Blocking,
    engineV2Priority,
    engineV2Completion,
    engineV2Execution,
    userModel,
    rules,
    entries,
    now,
    todayStr,
  ])

  useEffect(() => {
    if (!currentLinkedRuleEntry) return
    if (startedRuleRef.current === currentLinkedRuleEntry.id) return
    if (active || serviceStatus !== 'ok' || autoStartInFlightRef.current) return

    const rule = ruleById.get(currentLinkedRuleEntry.ruleId)
    const linkedProfileId = rule?.linkedProfileId
    if (!linkedProfileId) return

    startedRuleRef.current = currentLinkedRuleEntry.id
    autoStartInFlightRef.current = true
    const remainingMinutes = Math.max(1, currentLinkedRuleEntry.endMinute - currentMinute)

    void startSession(linkedProfileId, remainingMinutes)
      .then(() => {
        useToastStore.getState().push({
          variant: 'info',
          title: 'Blocage démarré',
          description: `${rule.name} · ${minuteToClockLabel(currentLinkedRuleEntry.startMinute)} - ${minuteToClockLabel(currentLinkedRuleEntry.endMinute)}`,
        })
      })
      .catch((err) => {
        useToastStore.getState().push({
          variant: 'error',
          title: 'Blocage non démarré',
          description: err instanceof Error ? err.message : String(err),
        })
      })
      .finally(() => {
        autoStartInFlightRef.current = false
      })
  }, [active, currentLinkedRuleEntry, currentMinute, ruleById, serviceStatus, startSession])
}

async function startRegistryBlockingSession(args: {
  block: CurrentWorkBlock
  payload: {
    blockedSites: string[]
    blockedProcesses: string[]
    blockedNetworkApps: string[]
    unlockPolicy: UnlockPolicy
    label: string
    mode?: 'blocklist' | 'allowlist'
  }
  remainingMinutes: number
  saveProfile: ReturnType<typeof useBlockingStore.getState>['saveProfile']
  startSession: ReturnType<typeof useBlockingStore.getState>['startSession']
}): Promise<ActiveSession> {
  const profile = await args.saveProfile({
    id: AUTO_PROFILE_ID,
    name: truncateProfileName(`Vethos auto - ${args.payload.label}`),
    mode: args.payload.mode || 'blocklist',
    blockedSites: args.payload.blockedSites,
    blockedProcesses: args.payload.blockedProcesses,
    blockedNetworkApps: args.payload.blockedNetworkApps,
    unlockPolicy: args.payload.unlockPolicy,
    createdAt: new Date().toISOString(),
  })
  return args.startSession(profile.id, args.remainingMinutes)
}

async function startSleepLockdownSession(args: {
  remainingMinutes: number
  saveProfile: ReturnType<typeof useBlockingStore.getState>['saveProfile']
  startSession: ReturnType<typeof useBlockingStore.getState>['startSession']
}): Promise<void> {
  const profile = await args.saveProfile({
    id: SLEEP_LOCKDOWN_PROFILE_ID,
    name: 'Mode sommeil - verrouillage complet',
    mode: 'blocklist',
    blockedSites: SLEEP_LOCKDOWN_SITES,
    blockedProcesses: [SLEEP_LOCKDOWN_PROCESS_MARKER],
    blockedNetworkApps: [],
    unlockPolicy: { type: 'cooldown_and_justification', minutes: 60, minWords: 500 },
  })
  await args.startSession(profile.id, args.remainingMinutes)
}

function isSleepLockdownSession(active: ActiveSession | null): boolean {
  return Boolean(
    active?.profileSnapshot.blockedProcesses
      .map((processName) => processName.toLowerCase())
      .includes(SLEEP_LOCKDOWN_PROCESS_MARKER),
  )
}

function truncateProfileName(name: string): string {
  if (name.length <= 60) return name
  return `${name.slice(0, 57).trimEnd()}...`
}

function settingsForSession(settings: ReturnType<typeof useSettingsStore.getState>): Settings {
  return {
    username: settings.username || undefined,
    savedAt: settings.savedAt ?? undefined,
    onboardingCompleted: settings.onboardingCompleted,
    userProfile: settings.userProfile,
    sleepStart: settings.sleepStart,
    sleepEnd: settings.sleepEnd,
    sleepLockdownSkippedDate: settings.sleepLockdownSkippedDate ?? undefined,
    chronotype: settings.chronotype,
    detectedPeakHour: settings.detectedPeakHour ?? undefined,
    detectedWakeMinute: settings.detectedWakeMinute ?? undefined,
    detectedSleepMinute: settings.detectedSleepMinute ?? undefined,
    detectedChronotype: settings.detectedChronotype ?? undefined,
    circadianMetricsUpdatedAt: settings.circadianMetricsUpdatedAt ?? undefined,
    sessionRulesEnabled: settings.sessionRulesEnabled,
    autoSave: settings.autoSave,
    browserHistoryScanEnabled: settings.browserHistoryScanEnabled,
    defaultUnlockCooldownMinutes: settings.defaultUnlockCooldownMinutes,
    defaultUnlockJustificationWords: settings.defaultUnlockJustificationWords,
    firstLaunchDate: settings.firstLaunchDate ?? undefined,
    staticTomorrowPlanningEnabled: settings.staticTomorrowPlanningEnabled,
    closureRitualCompletedAt: settings.closureRitualCompletedAt ?? undefined,
    classificationMode: settings.classificationMode,
    engineV2Placement: settings.engineV2Placement,
    engineV2Blocking: settings.engineV2Blocking,
    engineV2Priority: settings.engineV2Priority,
    engineV2Completion: settings.engineV2Completion,
    engineV2Execution: settings.engineV2Execution,
  }
}

export function mapSessionPlanToSessionPayload(
  plan: SessionPlan,
  label: string
): {
  blockedSites: string[]
  blockedProcesses: string[]
  blockedNetworkApps: string[]
  unlockPolicy: UnlockPolicy
  label: string
  mode: 'blocklist' | 'allowlist'
} {
  if (plan.mode === 'allowlist') {
    return {
      blockedSites: plan.allowedSites,
      blockedProcesses: plan.allowedApps,
      blockedNetworkApps: [],
      unlockPolicy: plan.unlockPolicy,
      label,
      mode: 'allowlist',
    }
  } else {
    return {
      blockedSites: plan.blockedSites,
      blockedProcesses: plan.blockedApps,
      blockedNetworkApps: [],
      unlockPolicy: plan.unlockPolicy,
      label,
      mode: 'blocklist',
    }
  }
}

function proposedBlockFromRuntime(block: CurrentWorkBlock): ProposedPlacementBlock {
  const targetType = block.kind === 'task' || block.kind === 'objective' ? block.kind : 'strategy_block'
  return {
    id: block.id,
    targetType,
    targetId: block.refId ?? block.linkedTaskId ?? block.id,
    kind: 'work',
    title: block.label,
    date: block.date,
    start: minuteToClockLabel(block.startMinute),
    end: minuteToClockLabel(block.endMinute),
    durationMinutes: Math.max(0, block.endMinute - block.startMinute),
    sourceWindowId: `runtime-${block.id}`,
    ...(block.linkedTaskId ? { linkedTaskId: block.linkedTaskId } : {}),
    placementMode: 'normal',
    confidence: 60,
    locked: false,
    reasons: ['Bloc runtime adapté au contrat de session.'],
    warnings: ['Le contrat provient d’un bloc legacy; une confiance prudente est appliquée.'],
  }
}

export function mapSessionPlanV2ToSessionPayload(
  plan: SessionPlanV2,
  label: string,
  settings: { defaultUnlockCooldownMinutes?: number; defaultUnlockJustificationWords?: number },
  interruptionPolicy?: SessionInterruptionPolicyResult,
): {
  blockedSites: string[]
  blockedProcesses: string[]
  blockedNetworkApps: string[]
  unlockPolicy: UnlockPolicy
  label: string
  mode: 'blocklist' | 'allowlist'
} {
  const cooldown = settings.defaultUnlockCooldownMinutes ?? 5
  const words = settings.defaultUnlockJustificationWords ?? 80
  const effectivePolicy = interruptionPolicy?.earlyStopPolicy === 'deny_if_strict'
    ? 'deny_during_strict_session'
    : interruptionPolicy?.earlyStopPolicy ?? plan.protection.unlockPolicy
  const unlockPolicy: UnlockPolicy = effectivePolicy === 'none' || effectivePolicy === 'allow'
    ? { type: 'none' }
    : effectivePolicy === 'cooldown'
      ? { type: 'cooldown', minutes: cooldown }
      : effectivePolicy === 'justification'
        ? { type: 'justification', minWords: words }
        : effectivePolicy === 'deny_during_strict_session'
          ? { type: 'deny_during_strict_session' }
          : { type: 'cooldown_and_justification', minutes: cooldown, minWords: words }
  const allowlist = plan.protection.mode === 'allowlist' || plan.protection.mode === 'strict_allowlist'
  return {
    blockedSites: allowlist ? plan.protection.usefulSites : plan.protection.blockedSites,
    blockedProcesses: allowlist ? plan.protection.usefulApps : plan.protection.blockedApps,
    blockedNetworkApps: [],
    unlockPolicy,
    label,
    mode: allowlist ? 'allowlist' : 'blocklist',
  }
}
