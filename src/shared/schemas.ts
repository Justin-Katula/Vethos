import { z } from 'zod'

/**
 * Clés autorisées pour le stockage.
 * Chaque clé correspond à un fichier nexus_<key>.json sur disque.
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
] as const
export type StorageKey = (typeof STORAGE_KEYS)[number]
export const StorageKeySchema = z.enum(STORAGE_KEYS)

/** Settings persistés (démo bout-en-bout du sous-projet 1). */
export const SettingsSchema = z.object({
  username: z.string().max(100).optional(),
  savedAt: z.string().datetime().optional(),
  /** True une fois l'onboarding terminé OU explicitement skippé. */
  onboardingCompleted: z.boolean().optional(),
  /** Profil utilisateur : étudiant, travailleur, les deux, autre. */
  userProfile: z.enum(['student', 'worker', 'both', 'other']).optional(),
  /** Heure de coucher (HH:MM). */
  sleepStart: z.string().optional(),
  /** Heure de réveil (HH:MM). */
  sleepEnd: z.string().optional(),
  /** Règles de session (pauses obligatoires). */
  sessionRulesEnabled: z.boolean().optional(),
  /** Blocage strict ON/OFF. */
  strictBlocking: z.boolean().optional(),
  /** Anti-bypass ON/OFF. */
  antiBypass: z.boolean().optional(),
  /** Sauvegarde auto ON/OFF. */
  autoSave: z.boolean().optional(),
  /** Opt-in explicite pour scanner l'historique navigateur local. */
  browserHistoryScanEnabled: z.boolean().optional(),
  /** Date du premier lancement (pour la première semaine). */
  firstLaunchDate: z.string().datetime().optional(),
})
export type Settings = z.infer<typeof SettingsSchema>

// ─── Blocking (sous-projet 2) ──────────────────────────────────────────────

const DOMAIN_REGEX = /^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(\.[a-zA-Z]{2,})+$/
const EXE_NAME_REGEX = /^[A-Za-z0-9_.\- ]+\.exe$/i

export const BlockingProfileSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(60),
  blockedSites: z.array(z.string().regex(DOMAIN_REGEX)),
  blockedProcesses: z.array(z.string().regex(EXE_NAME_REGEX)),
  blockedNetworkApps: z.array(z.string()),
  unlockPolicy: z.discriminatedUnion('type', [
    z.object({ type: z.literal('none') }),
    z.object({ type: z.literal('cooldown'), minutes: z.number().int().min(1).max(60) }),
    z.object({ type: z.literal('justification'), minWords: z.number().int().min(50).max(500) }),
    z.object({
      type: z.literal('cooldown_and_justification'),
      minutes: z.number().int().min(1).max(60),
      minWords: z.number().int().min(50).max(500),
    }),
  ]),
  createdAt: z.string().datetime(),
})
export type BlockingProfile = z.infer<typeof BlockingProfileSchema>

export const ActiveSessionSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  profileSnapshot: BlockingProfileSchema,
  startedAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  startedAtWall: z.number().int().optional(),
  startedAtMono: z.number().int().optional(),
  durationMinutes: z.number().int().min(1).max(24 * 60).optional(),
  unlockState: z.discriminatedUnion('phase', [
    z.object({ phase: z.literal('locked') }),
    z.object({ phase: z.literal('cooldown'), startedAt: z.string().datetime() }),
    z.object({ phase: z.literal('awaiting_justification') }),
    z.object({ phase: z.literal('unlocked'), reason: z.string() }),
  ]),
  appliedFirewallRules: z.array(z.string()),
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
  /** Legacy compatibility: V2 stores this in nexus_blocking_history.json. */
  history: z.array(BlockingHistoryEntrySchema).max(500).default([]),
})
export type BlockingState = z.infer<typeof BlockingStateSchema>

export const BlockingHistoryStateSchema = z.object({
  history: z.array(BlockingHistoryEntrySchema).max(500),
})
export type BlockingHistoryState = z.infer<typeof BlockingHistoryStateSchema>

// ─── Schedule (sous-projet 3) ──────────────────────────────────────────────

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

export const TimeRuleSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(40),
  color: z.string().regex(HEX_COLOR_REGEX),
  icon: z.string().min(1).max(40).optional(),
  categoryType: z
    .enum(['sleep', 'school', 'work', 'commitment', 'free', 'custom'])
    .optional(),
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

export const ObjectiveSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(60),
  description: z.string().max(500).optional(),
  color: z.string().regex(HEX_COLOR_REGEX),
  icon: z.string().min(1).max(40).optional(),
  linkedRuleIds: z.array(z.string().uuid()),
  /** The manual level (e.g., 3 to 7 default, up to 10). Replaces xpMinutes. */
  level: z.number().min(0).max(10).default(5),
  /** Optional ISO date used as context; task deadlines drive the main distribution. */
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** Date du dernier changement de niveau (cooldown 2 jours). */
  lastLevelChangeAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
})
export type Objective = z.infer<typeof ObjectiveSchema>

export const ObjectivesStateSchema = z.object({
  objectives: z.array(ObjectiveSchema),
})
export type ObjectivesState = z.infer<typeof ObjectivesStateSchema>

export const TaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(100),
  linkedObjectiveId: z.string().uuid().nullable(),
  /** Deadline ISO date string (YYYY-MM-DD) */
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Level of the task. Can go down to 0 */
  level: z.number().min(0).max(10).default(5),
  /** Automatic degradation buffer: +0.5 per well-worked day, -1 level when >= 1. */
  degradationPool: z.number().min(0).default(0),
  /** Total automatic degradation already applied. Hard-capped at 5. */
  totalDegradation: z.number().min(0).max(5).default(0),
  status: z.enum(['active', 'history']),
  /** Date du dernier changement de niveau (cooldown 2 jours). */
  lastLevelChangeAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
})
export type Task = z.infer<typeof TaskSchema>

export const TasksStateSchema = z.object({
  tasks: z.array(TaskSchema),
})
export type TasksState = z.infer<typeof TasksStateSchema>

export const LevelsStateSchema = z.object({
  /** Legacy compatibility: migrated to nexus_objectives.json on load. */
  objectives: z.array(ObjectiveSchema).optional(),
  calculatedDailyFreeMinutes: z.number().int().min(0).max(1440).default(0),
  calculatedAt: z.string().datetime().nullable().default(null),
  lastCalculatedDate: z.string().regex(DATE_REGEX).nullable().default(null),
  lastProcessedSessionId: z.string().uuid().nullable().default(null),
  /** Cursor par app déclarée pour idempotence du fold app-usage. Map appId → date YYYY-MM-DD. */
  lastProcessedAppUsageByApp: z.record(z.string(), z.string().nullable()).optional(),
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
})
export type DiscoveredSite = z.infer<typeof DiscoveredSiteSchema>

export const DiscoveredSitesStateSchema = z.object({
  sites: z.array(DiscoveredSiteSchema).max(2000),
})
export type DiscoveredSitesState = z.infer<typeof DiscoveredSitesStateSchema>

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
} as const satisfies Record<StorageKey, z.ZodTypeAny>
