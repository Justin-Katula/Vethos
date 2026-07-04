import { z } from 'zod'

/**
 * Clés autorisées pour le stockage.
 * Chaque clé correspond à un fichier vethos_<key>.json sur disque.
 * Ajouter ici toute nouvelle entité à persister.
 */
export const STORAGE_KEYS = [
  'settings',
  'blocking',
  'blocking_history',
  'blocking_active',
  'schedule',
  'objectives',
  'levels',
  'stats',
  'declared_apps',
  'declared_app_usage',
  'tasks',
  'discovered_sites',
  'registry',
  'app_block_explanations',
  'user_model',
  'decision_log',
  'sessions_v2',
] as const
export type StorageKey = (typeof STORAGE_KEYS)[number]
export const StorageKeySchema = z.enum(STORAGE_KEYS)

export const ChronotypeSchema = z.enum(['morning', 'intermediate', 'evening'])
export type Chronotype = z.infer<typeof ChronotypeSchema>

/** Settings persistés (démo bout-en-bout du sous-projet 1). */
export const SettingsSchema = z.object({
  username: z.string().max(100).optional(),
  savedAt: z.string().datetime().optional(),
  /** True une fois l'onboarding terminé OU explicitement skippé. */
  onboardingCompleted: z.boolean().optional(),
  /** Profil utilisateur : étudiant, travailleur, les deux, autre. */
  userProfile: z.enum(['student', 'worker', 'both', 'other']).optional(),
  /** Heure de coucher, telle que fournie par le champ horaire natif. */
  sleepStart: z.string().optional(),
  /** Heure de réveil, telle que fournie par le champ horaire natif. */
  sleepEnd: z.string().optional(),
  /** Date locale dont le verrouillage sommeil automatique est ignoré. */
  sleepLockdownSkippedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
  /** Chronotype utilisateur pour ajuster la fenêtre de performance cognitive. */
  chronotype: ChronotypeSchema.optional(),
  /** Chronotype passivement détecté à partir des périodes d'inactivité nocturne. */
  detectedChronotype: ChronotypeSchema.optional(),
  /** Minute locale moyenne de réveil détectée passivement. */
  detectedWakeMinute: z.number().int().min(0).max(1439).optional(),
  /** Minute locale moyenne d'endormissement détectée passivement. */
  detectedSleepMinute: z.number().int().min(0).max(1439).optional(),
  /** Heure locale de performance maximale calculée sur 14 jours. */
  detectedPeakHour: z.number().int().min(0).max(23).optional(),
  /** Dernière mise à jour des métriques circadiennes passives. */
  circadianMetricsUpdatedAt: z.string().datetime().optional(),
  /** Règles de session (pauses obligatoires). */
  sessionRulesEnabled: z.boolean().optional(),
  /** Blocage strict ON/OFF. */
  strictBlocking: z.boolean().optional(),
  /** Sauvegarde auto ON/OFF. */
  autoSave: z.boolean().optional(),
  /** Opt-in explicite pour scanner l'historique navigateur local. */
  browserHistoryScanEnabled: z.boolean().optional(),
  /** Valeurs par défaut des verrous adaptatifs pour les nouveaux profils. */
  defaultUnlockCooldownMinutes: z.number().int().min(1).max(60).optional(),
  defaultUnlockJustificationWords: z.number().int().min(50).max(500).optional(),
  /** Date du premier lancement (pour la première semaine). */
  firstLaunchDate: z.string().datetime().optional(),
  /** Planification statique de la veille pour éviter les décisions matinales. */
  staticTomorrowPlanningEnabled: z.boolean().optional(),
  /** Dernier rituel de clôture validé par l'utilisateur. */
  closureRitualCompletedAt: z.string().datetime().optional(),
  /** Quand l'app demande de classifier (D7). */
  classificationMode: z.enum(['immediate', 'batch_3h', 'batch_1d', 'batch_1w']).optional(),
  /**
   * Toggles runtime des moteurs V2 (mode hybride : V2 pilote, V1 fallback).
   * Permet de désactiver un sous-système sans recompiler. Défaut true.
   */
  engineV2Placement: z.boolean().optional(),
  engineV2Blocking: z.boolean().optional(),
  engineV2Priority: z.boolean().optional(),
  engineV2Completion: z.boolean().optional(),
  engineV2Execution: z.boolean().optional(),
})
export type Settings = z.infer<typeof SettingsSchema>

// ─── Blocking (sous-projet 2) ──────────────────────────────────────────────

const DOMAIN_REGEX = /^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(\.[a-zA-Z]{2,})+$/
const EXE_NAME_REGEX = /^[A-Za-z0-9_.\- ]+\.exe$/i

export const UnlockPolicySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('deny_during_strict_session') }),
  z.object({ type: z.literal('cooldown'), minutes: z.number().int().min(1).max(60) }),
  z.object({ type: z.literal('justification'), minWords: z.number().int().min(50).max(500) }),
  z.object({
    type: z.literal('cooldown_and_justification'),
    minutes: z.number().int().min(1).max(60),
    minWords: z.number().int().min(50).max(500),
  }),
])
export type UnlockPolicy = z.infer<typeof UnlockPolicySchema>

export const WorkBlockingConfigSchema = z.object({
  enabled: z.boolean(),
  /** blocklist = bloquer la sélection ; allowlist = autoriser seulement la sélection. */
  mode: z.enum(['blocklist', 'allowlist']),
  sites: z.array(z.string().regex(DOMAIN_REGEX)),
  processes: z.array(z.string().regex(EXE_NAME_REGEX)),
  networkApps: z.array(z.string()),
  unlockPolicy: UnlockPolicySchema,
})
export type WorkBlockingConfig = z.infer<typeof WorkBlockingConfigSchema>

export const BlockingProfileSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(60),
  mode: z.enum(['blocklist', 'allowlist']).default('blocklist'),
  blockedSites: z.array(z.string().regex(DOMAIN_REGEX)),
  blockedProcesses: z.array(z.string().regex(EXE_NAME_REGEX)),
  blockedNetworkApps: z.array(z.string()),
  unlockPolicy: UnlockPolicySchema,
  createdAt: z.string().datetime(),
})
export type BlockingProfile = z.infer<typeof BlockingProfileSchema>

export const ProtectionLayerSchema = z.enum([
  'hosts',
  'process_watcher',
  'firewall',
  'overlay',
  'media_control',
  'service_recovery',
])

export const ProtectionResultSchema = z.object({
  applied: z.boolean(),
  appliedLayers: z.array(ProtectionLayerSchema),
  failedLayers: z.array(ProtectionLayerSchema),
  blockedApps: z.array(z.string()),
  blockedSites: z.array(z.string()),
  allowedApps: z.array(z.string()),
  allowedSites: z.array(z.string()),
  warnings: z.array(z.string()),
  debug: z.record(z.unknown()).optional(),
})

export const ActiveSessionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().optional(),
  profileId: z.string().uuid(),
  profileSnapshot: BlockingProfileSchema,
  startedAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  startedAtWall: z.number().int().optional(),
  startedAtMono: z.number().int().optional(),
  /** Heure murale estimée du démarrage Windows, pour savoir si l'horloge
   * monotone appartient encore au même boot. */
  startedAtBootWall: z.number().int().optional(),
  durationMinutes: z
    .number()
    .int()
    .min(1)
    .max(24 * 60)
    .optional(),
  unlockState: z.discriminatedUnion('phase', [
    z.object({ phase: z.literal('locked') }),
    z.object({ phase: z.literal('cooldown'), startedAt: z.string().datetime() }),
    z.object({ phase: z.literal('awaiting_justification') }),
    z.object({ phase: z.literal('unlocked'), reason: z.string() }),
  ]),
  appliedFirewallRules: z.array(z.string()),
  /** En mode allowlist, sélection utilisateur originale des processus autorisés. */
  processAllowlist: z.array(z.string().regex(EXE_NAME_REGEX)).optional(),
  /** Audit factuel des couches réellement appliquées par le service. */
  protectionResult: ProtectionResultSchema.optional(),
})
export type ActiveSession = z.infer<typeof ActiveSessionSchema>

export const BlockingHistoryEntrySchema = z.object({
  sessionId: z.string().uuid(),
  profileId: z.string().uuid(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  completedNormally: z.boolean(),
})
export type BlockingHistoryEntry = z.infer<typeof BlockingHistoryEntrySchema>

export const BlockingStateSchema = z.object({
  profiles: z.array(BlockingProfileSchema),
  /** Legacy compatibility: V2 stores this in vethos_blocking_history.json. */
  history: z.array(BlockingHistoryEntrySchema).max(500).default([]),
  /** Pénalité appliquée à la prochaine session après un arrêt anticipé. */
  nextSessionPenaltyMinutes: z.number().int().min(0).max(240).default(0),
})
export type BlockingState = z.infer<typeof BlockingStateSchema>

export const BlockingHistoryStateSchema = z.object({
  history: z.array(BlockingHistoryEntrySchema).max(500),
})
export type BlockingHistoryState = z.infer<typeof BlockingHistoryStateSchema>

export const AppBlockExplanationSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  localTime: z.string().regex(/^\d{2}:\d{2}:\d{2}$/),
  processName: z.string().min(1).max(260),
  appName: z.string().min(1).max(260),
  explanation: z.string().min(1).max(2000),
  sessionId: z.string().uuid(),
  profileId: z.string().uuid(),
  sessionName: z.string().min(1).max(120),
  mode: z.enum(['work', 'sleep']),
  focusKind: z.enum(['task', 'objective', 'session']),
  focusLabel: z.string().min(1).max(240),
  taskId: z.string().uuid().optional(),
  taskTitle: z.string().min(1).max(240).optional(),
  objectiveId: z.string().uuid().optional(),
  objectiveName: z.string().min(1).max(240).optional(),
  decision: z.enum(['allowed', 'denied', 'coach_error']),
  reason: z.string().min(1).max(500),
  necessityScore: z.number().min(0).max(10).optional(),
  credibilityScore: z.number().min(0).max(10).optional(),
  urgencyScore: z.number().min(0).max(10).optional(),
  allowMinutes: z.number().int().min(0).max(10),
})
export type AppBlockExplanation = z.infer<typeof AppBlockExplanationSchema>

export const AppBlockExplanationsStateSchema = z.object({
  entries: z.array(AppBlockExplanationSchema).max(1000),
})
export type AppBlockExplanationsState = z.infer<typeof AppBlockExplanationsStateSchema>

// ─── Schedule (sous-projet 3) ──────────────────────────────────────────────

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

export const TimeRuleSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(40),
  color: z.string().regex(HEX_COLOR_REGEX),
  icon: z.string().min(1).max(40).optional(),
  categoryType: z.enum(['sleep', 'school', 'work', 'commitment', 'free', 'custom']).optional(),
  linkedProfileId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
})
export type TimeRule = z.infer<typeof TimeRuleSchema>

export const ScheduleEntrySchema = z
  .object({
    id: z.string().uuid(),
    ruleId: z.string().uuid(),
    dayOfWeek: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
    createdAt: z.string().datetime(),
  })
  .refine((e) => e.endMinute > e.startMinute, {
    message: 'endMinute must be > startMinute',
    path: ['endMinute'],
  })
export type ScheduleEntry = z.infer<typeof ScheduleEntrySchema>

export const ScheduleStateSchema = z.object({
  rules: z.array(TimeRuleSchema),
  entries: z.array(ScheduleEntrySchema),
})
export type ScheduleState = z.infer<typeof ScheduleStateSchema>

// ─── Levels & free time (sous-projet 4) ────────────────────────────────────

export const OBJECTIVE_LEVEL_MIN = 3
export const OBJECTIVE_LEVEL_MAX = 7
export const DEFAULT_OBJECTIVE_LEVEL = OBJECTIVE_LEVEL_MIN
export const OBJECTIVE_DAILY_MINUTES_BY_LEVEL: Record<number, number> = {
  3: 30,
  4: 45,
  5: 60,
  6: 90,
  7: 120,
}

export function clampObjectiveLevel(level: number): number {
  if (!Number.isFinite(level)) return DEFAULT_OBJECTIVE_LEVEL
  return Math.max(OBJECTIVE_LEVEL_MIN, Math.min(OBJECTIVE_LEVEL_MAX, Math.round(level)))
}

const ObjectiveLevelSchema = z.preprocess((value) => {
  if (value === undefined || value === null) return DEFAULT_OBJECTIVE_LEVEL
  const level = typeof value === 'number' ? value : Number(value)
  return clampObjectiveLevel(level)
}, z.number().int().min(OBJECTIVE_LEVEL_MIN).max(OBJECTIVE_LEVEL_MAX))

const ObjectiveStatusSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return 'active'
    return value
  },
  z.enum(['active', 'completed']),
)

export const PRIORITY_SCORE_PERSISTENCE_VERSION = 2
export const PersistedPriorityScoreSchema = z.object({
  schemaVersion: z.literal(PRIORITY_SCORE_PERSISTENCE_VERSION),
  computedAt: z.string().datetime(),
  priorityScore: z.number().min(0).max(100),
  urgencyScore: z.number().min(0).max(100),
  valueScore: z.number().min(0).max(100),
  workloadScore: z.number().min(0).max(100),
  complexityScore: z.number().min(0).max(100),
  stagnationScore: z.number().min(0).max(100),
  momentumScore: z.number().min(0).max(100),
  reasons: z.array(z.string()).max(20),
})
export type PersistedPriorityScore = z.infer<typeof PersistedPriorityScoreSchema>

export const ObjectiveSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(60),
  description: z.string().max(500).optional(),
  color: z.string().regex(HEX_COLOR_REGEX),
  icon: z.string().min(1).max(40).optional(),
  linkedRuleIds: z.array(z.string().uuid()),
  /** Niveau manuel autorisé pour un objectif : 3 à 7. */
  level: ObjectiveLevelSchema,
  status: ObjectiveStatusSchema.default('active'),
  /** Activités personnelles que l'utilisateur veut préserver autour de cet objectif. */
  protectedCommitments: z.array(z.string().min(1).max(80)).max(12).optional(),
  /** Date du dernier changement de niveau (cooldown 2 jours). */
  lastLevelChangeAt: z.string().datetime().optional(),
  /** Règles de blocage par défaut quand l'utilisateur travaille sur cet objectif. */
  blocking: WorkBlockingConfigSchema.optional(),
  unlockPolicy: UnlockPolicySchema.optional(),
  createdAt: z.string().datetime(),
  /** 
   * WARNING: Although this field is named priorityScoreV2 in the database for historical and schema compatibility,
   * it is currently populated in the background using the old 1D V1 priority result (buildObjectivePriorityResult).
   * True V2 scores (action, planning, protection, recovery) are computed dynamically in-memory.
   */
  priorityScoreV2: PersistedPriorityScoreSchema.optional(),
})
export type Objective = z.infer<typeof ObjectiveSchema>

export const ObjectivesStateSchema = z.object({
  objectives: z.array(ObjectiveSchema),
})
export type ObjectivesState = z.infer<typeof ObjectivesStateSchema>

const TaskStatusSchema = z.preprocess(
  (value) => {
    if (value === 'history') return 'completed'
    if (value === 'missed') return 'expired'
    if (value === 'paused') return 'active'
    if (value === 'frozen') return 'queued'
    return value
  },
  z.enum(['active', 'queued', 'completed', 'expired']),
)

export const TaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(100),
  /** Description détaillée distincte des notes de contexte Coach. */
  description: z.string().max(2000).optional(),
  linkedObjectiveId: z.string().uuid().nullable(),
  /** Deadline ISO date string (YYYY-MM-DD). */
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Optional exact local deadline time (HH:mm), disabled unless the user enables it. */
  deadlineTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  /** recoverable = rattrapable ; hard = conséquence forte/non récupérable. */
  deadlineImpact: z.enum(['recoverable', 'hard']).optional(),
  complexity: z.enum(['easy', 'normal', 'hard', 'manual', 'extreme', 'unknown']).optional(),
  scheduledStart: z.string().datetime().optional(),
  scheduledDurationMinutes: z.number().int().min(1).max(1440).optional(),
  /** Alias UX de complexity pour les tâches analytiques ou difficiles. */
  difficulty: z.enum(['easy', 'normal', 'hard', 'manual', 'extreme', 'unknown']).optional(),
  /** Durée relative gelée pendant le statut queued, exprimée en jours (legacy/UI). */
  frozenDeadlineOffsetDays: z.number().int().min(0).max(3650).optional(),
  /** Durée relative gelée exacte pendant le statut queued, exprimée en minutes. */
  frozenDeadlineOffsetMinutes: z
    .number()
    .int()
    .min(0)
    .max(3650 * 1440)
    .optional(),
  /** Instant où la tâche est entrée dans la file d'un objectif. */
  queuedAt: z.string().datetime().optional(),
  /** Dernière activation effective depuis la file. */
  activatedAt: z.string().datetime().optional(),
  /** Estimation totale calculée automatiquement depuis le niveau. */
  estimatedMinutes: z.number().int().min(0).max(100_000).optional(),
  /** Temps restant fiable, réduit uniquement par le chronomètre. */
  remainingMinutes: z.number().int().min(0).max(100_000).optional(),
  /** Niveau courant de priorité. Il peut diminuer automatiquement. */
  level: z.number().min(0).max(10).default(5),
  /** Dernière dégradation automatique de niveau. */
  lastAutoDegradedAt: z.string().datetime().optional(),
  status: TaskStatusSchema,
  /** Date du dernier changement de niveau (legacy/cooldown). */
  lastLevelChangeAt: z.string().datetime().optional(),
  /** Règles de blocage propres à la tâche. Si absent, une tâche liée hérite de l'objectif. */
  blocking: WorkBlockingConfigSchema.optional(),
  /** Notes de contexte accumulées par le Coach IA. */
  contextNotes: z.string().optional(),
  /** Liste de sous-tâches minutées générées par le Coach. */
  subTasks: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        durationMinutes: z.number().int().min(1),
        status: z.enum(['pending', 'active', 'completed']),
      }),
    )
    .optional(),
  /** Statut d'optimisation par le Coach. */
  coachStatus: z.enum(['learning', 'optimized']).optional(),
  unlockPolicy: UnlockPolicySchema.optional(),
  /** Instant local ISO auquel la tâche a été achevée. */
  completedAt: z.string().datetime().optional(),
  /** Dev Mode manual scheduling override fields */
  devForceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  devForceStartMinute: z.number().int().min(0).max(1439).optional(),
  devForceEndMinute: z.number().int().min(1).max(1440).optional(),
  createdAt: z.string().datetime(),
  /** 
   * WARNING: Although this field is named priorityScoreV2 in the database for historical and schema compatibility,
   * it is currently populated in the background using the old 1D V1 priority result (buildTaskPriorityResult).
   * True V2 scores (action, planning, protection, recovery) are computed dynamically in-memory.
   */
  priorityScoreV2: PersistedPriorityScoreSchema.optional(),
})
export type Task = z.infer<typeof TaskSchema>

export const TasksStateSchema = z.object({
  tasks: z.array(TaskSchema),
})
export type TasksState = z.infer<typeof TasksStateSchema>

export const LevelsStateSchema = z.object({
  /** Legacy compatibility: migrated to vethos_objectives.json on load. */
  objectives: z.array(ObjectiveSchema).optional(),
  calculatedDailyFreeMinutes: z.number().int().min(0).max(1440).default(0),
  calculatedAt: z.string().datetime().nullable().default(null),
  lastCalculatedDate: z.string().regex(DATE_REGEX).nullable().default(null),
  lastProcessedSessionId: z.string().uuid().nullable().default(null),
  /** Cursor par app déclarée pour idempotence du fold app-usage. Map appId → date YYYY-MM-DD. */
  lastProcessedAppUsageByApp: z.record(z.string(), z.string().nullable()).optional(),
  /** Dernière demande du rituel de clôture de 3 minutes. */
  closureRitualPromptedAt: z.string().datetime().nullable().optional(),
  /** Date du planning statique du lendemain actuellement généré. */
  staticPlanDate: z.string().regex(DATE_REGEX).nullable().optional(),
  /** Instant de génération du planning statique du lendemain. */
  staticPlanGeneratedAt: z.string().datetime().nullable().optional(),
  /** Épisodes sommeil/réveil détectés passivement par powerMonitor. */
  passiveSleepSessions: z
    .array(
      z.object({
        sleepStartedAt: z.string().datetime(),
        wokeAt: z.string().datetime(),
        durationMinutes: z
          .number()
          .int()
          .min(0)
          .max(24 * 60),
        isFreeDay: z.boolean(),
        source: z.enum(['idle-lock', 'suspend-resume', 'idle-poll']),
      }),
    )
    .max(60)
    .optional(),
  /** Échantillons d'efficacité cognitive utilisés pour la moyenne glissante par heure. */
  cognitiveEfficiencySamples: z
    .array(
      z.object({
        taskId: z.string().uuid().optional(),
        completedAt: z.string().datetime(),
        hour: z.number().int().min(0).max(23),
        complexity: z.enum(['easy', 'normal', 'hard', 'manual', 'extreme', 'unknown']),
        plannedMinutes: z.number().int().min(1).max(100_000),
        actualMinutes: z.number().int().min(1).max(100_000),
        efficiency: z.number().min(0).max(100),
      }),
    )
    .max(500)
    .optional(),
  detectedPeakHour: z.number().int().min(0).max(23).optional(),
  detectedWakeMinute: z.number().int().min(0).max(1439).optional(),
  detectedSleepMinute: z.number().int().min(0).max(1439).optional(),
  detectedChronotype: ChronotypeSchema.optional(),
})
export type LevelsState = z.infer<typeof LevelsStateSchema>

export const StatsStateSchema = z.object({
  totalFocusMinutes: z.number().int().min(0).default(0),
  totalSessions: z.number().int().min(0).default(0),
  longestStreak: z.number().int().min(0).default(0),
  lastUpdated: z.string().datetime().nullable().default(null),
})
export type StatsState = z.infer<typeof StatsStateSchema>

// ─── Declared apps (sous-projet 5) ─────────────────────────────────────────

export const DeclaredAppSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(60),
  exeName: z.string().regex(EXE_NAME_REGEX),
  linkedObjectiveId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
})
export type DeclaredApp = z.infer<typeof DeclaredAppSchema>

export const DeclaredAppsStateSchema = z.object({
  apps: z.array(DeclaredAppSchema),
})
export type DeclaredAppsState = z.infer<typeof DeclaredAppsStateSchema>

// ─── Declared app usage tracking (sous-projet 6) ───────────────────────────

export const DeclaredAppUsageEntrySchema = z.object({
  appId: z.string().uuid(),
  /** Date locale YYYY-MM-DD. Une seule entrée par (appId, date). */
  date: z.string().regex(DATE_REGEX),
  minutes: z.number().int().min(0).max(1440),
})
export type DeclaredAppUsageEntry = z.infer<typeof DeclaredAppUsageEntrySchema>

export const DeclaredAppUsageStateSchema = z.object({
  entries: z.array(DeclaredAppUsageEntrySchema).max(10000),
  /** Dernier tick du tracker. ISO datetime. */
  lastTickAt: z.string().datetime().nullable(),
  /** Événements récents utiles pour distinguer urgence réelle et procrastination. */
  activityEvents: z
    .array(
      z.object({
        at: z.string().datetime(),
        kind: z.enum(['declared-app-active', 'distracting-app-active', 'browser-site']),
        label: z.string().min(1).max(240),
        domain: z.string().min(1).max(255).optional(),
        appId: z.string().uuid().optional(),
      }),
    )
    .max(2000)
    .optional(),
})
export type DeclaredAppUsageState = z.infer<typeof DeclaredAppUsageStateSchema>

/** Map clé → schéma. Utilisé par le storage pour valider à la lecture. */
// ─── Discovered sites (auto-capture depuis navigateurs) ────────────────────

export const DiscoveredSiteSchema = z.object({
  domain: z.string().min(1),
  firstSeenAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  visitCount: z.number().int().min(1),
  blocked: z.boolean(),
  lastTitle: z.string().max(500).optional(),
  lastUrl: z.string().max(2000).optional(),
  lastMetaDescription: z.string().max(1000).optional(),
  lastMetaKeywords: z.string().max(1000).optional(),
  semanticStatus: z.enum(['unknown', 'allowed', 'blocked']).optional(),
  semanticStatusUntil: z.string().datetime().optional(),
})
export type DiscoveredSite = z.infer<typeof DiscoveredSiteSchema>

export const DiscoveredSitesStateSchema = z.object({
  sites: z.array(DiscoveredSiteSchema).max(2000),
})
export type DiscoveredSitesState = z.infer<typeof DiscoveredSitesStateSchema>

export const REGISTRY_CATEGORIES = [
  'Social',
  'Communication',
  'Games',
  'Entertainment',
  'Music & Audio',
  'Creativity',
  'Development',
  'AI & Automation',
  'Education',
  'Health & Fitness',
  'Information & Reading',
  'Browsers & Internet',
  'Productivity & Finance',
  'Shopping & Food',
  'Travel',
  'Security',
  'Utilities',
  'Other',
] as const

export const RegistryCategorySchema = z.enum(REGISTRY_CATEGORIES)

export type RegistryCategory = z.infer<typeof RegistryCategorySchema>

export const RegistryItemSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['site', 'app']),
  /** Domaine ('youtube.com') ou nom de processus ('discord.exe'). */
  identifier: z.string().min(1),
  /** Véritable cible .exe quand l'identifiant représente seulement une entrée installée. */
  executableName: z.string().regex(EXE_NAME_REGEX).optional(),
  /** Certaines entrées Windows sont installées mais n'exposent pas encore de cible exécutable. */
  blockable: z.boolean().optional(),
  /** Label lisible affiché à l'utilisateur. */
  displayName: z.string().min(1),
  /** Logo réel extrait par Windows depuis l'application installée. */
  iconDataUrl: z
    .string()
    .max(1_000_000)
    .regex(/^data:image\/(?:png|jpeg|webp);base64,/u)
    .optional(),
  /** Visites (site) ou minutes d'usage cumulé (app). */
  usageCount: z.number().int().min(0).default(0),
  lastSeenAt: z.string().datetime(),
  /** True ssi l'utilisateur a répondu au moins une fois. */
  classified: z.boolean().default(false),
  /** True ssi démontré utile → distraction. Irréversible (D11). */
  demoted: z.boolean().default(false),
  usefulFor: z
    .object({
      objectives: z.array(z.string().uuid()).default([]),
      standaloneTasks: z.array(z.string().uuid()).default([]),
    })
    .default({ objectives: [], standaloneTasks: [] }),
  category: RegistryCategorySchema.optional(),
  createdAt: z.string().datetime(),
})
export type RegistryItem = z.infer<typeof RegistryItemSchema>

export const RegistryStateSchema = z.object({
  items: z.array(RegistryItemSchema).max(10_000),
  /** Dernier inventaire Windows complet réussi, conservé entre les lancements. */
  appsLastScannedAt: z.string().datetime().optional(),
  /** Version de l'algorithme d'icônes/inventaire ayant produit le cache. */
  appsScanVersion: z.number().int().min(1).optional(),
})
export type RegistryState = z.infer<typeof RegistryStateSchema>

export const STORAGE_SCHEMAS = {
  settings: SettingsSchema,
  blocking: BlockingStateSchema,
  blocking_history: BlockingHistoryStateSchema,
  blocking_active: ActiveSessionSchema,
  schedule: ScheduleStateSchema,
  objectives: ObjectivesStateSchema,
  levels: LevelsStateSchema,
  stats: StatsStateSchema,
  declared_apps: DeclaredAppsStateSchema,
  declared_app_usage: DeclaredAppUsageStateSchema,
  tasks: TasksStateSchema,
  discovered_sites: DiscoveredSitesStateSchema,
  registry: RegistryStateSchema,
  app_block_explanations: AppBlockExplanationsStateSchema,
  user_model: z.unknown(),
  decision_log: z.unknown(),
  sessions_v2: z.unknown(),
} as const satisfies Record<StorageKey, z.ZodTypeAny>
