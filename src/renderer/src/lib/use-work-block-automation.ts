import { useEffect, useMemo, useRef } from 'react'
import { SLEEP_LOCKDOWN_PROCESS_MARKER, SLEEP_LOCKDOWN_PROFILE_ID } from '@shared/blocking'
import type {
  ActiveSession,
  DiscoveredSite,
  Objective,
  Task,
  WorkBlockingConfig,
  UnlockPolicy,
} from '@shared/schemas'
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

const AUTO_PROFILE_ID = '00000000-0000-4000-8000-000000000042'
const DOMAIN_RE = /^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(\.[a-zA-Z]{2,})+$/
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

const SAFE_PROCESS_NAMES = new Set([
  'applicationframehost.exe',
  'audiodg.exe',
  'conhost.exe',
  'csrss.exe',
  'ctfmon.exe',
  'dwm.exe',
  'electron.exe',
  'explorer.exe',
  'vethos.exe',
  'runtimebroker.exe',
  'searchhost.exe',
  'shellexperiencehost.exe',
  'sihost.exe',
  'startmenuexperiencehost.exe',
  'svchost.exe',
  'systemsettings.exe',
  'taskhostw.exe',
  'taskkill.exe',
  'tasklist.exe',
  'textinputhost.exe',
  'vethosblockingservice.exe',
  'nexus.exe',
  'nexusblockingservice.exe',
  'wininit.exe',
  'winlogon.exe',
  'node.exe',
])

type CurrentWorkBlock = PlacedBlock & {
  kind: 'task' | 'objective'
}

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

  useEffect(() => {
    if (!tasksUserId) return
    if (!scheduleLoaded) void loadSchedule(tasksUserId)
    if (!tasksLoaded) void loadTasks(tasksUserId)
    if (!levelsLoaded) void loadLevels(tasksUserId)
    if (!blockingLoaded) void loadBlocking(tasksUserId)
    if (!registryLoaded) void loadRegistry(tasksUserId)
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

  const objectiveById = useMemo(
    () => new Map(objectives.map((objective) => [objective.id, objective])),
    [objectives],
  )
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks])
  const ruleById = useMemo(() => new Map(rules.map((rule) => [rule.id, rule])), [rules])
  const currentBlock = useMemo<CurrentWorkBlock | null>(() => {
    return (
      blocks.find(
        (block): block is CurrentWorkBlock =>
          (block.kind === 'task' || block.kind === 'objective') &&
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

    if (flags.newSessionPlanControlsBlocking) {
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
            settings as any,
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
    } else {
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
      .then(() => {
        if (!decisionSessionPlan) return
        void useDecisionLogStore.getState().record({
          type: 'session_plan',
          targetType: decisionSessionPlan.targetType,
          targetId: decisionSessionPlan.targetId,
          sessionPlan: decisionSessionPlan,
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
}): Promise<void> {
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
  await args.startSession(profile.id, args.remainingMinutes)
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
