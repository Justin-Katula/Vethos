import { z } from 'zod'

/**
 * Clés autorisées pour le stockage.
 * Chaque clé correspond à un fichier nexus_<key>.json sur disque.
 * Ajouter ici toute nouvelle entité à persister.
 */
export const STORAGE_KEYS = [
  'settings',
  'schedule',
  'objectives',
  'levels',
  'stats',
  'declared_apps',
  'declared_app_usage',
  'tasks',
  'auth',
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
  /** Heure de coucher, telle que fournie par le champ horaire natif. */
  sleepStart: z.string().optional(),
  /** Heure de réveil, telle que fournie par le champ horaire natif. */
  sleepEnd: z.string().optional(),
  /** Sauvegarde auto ON/OFF. */
  autoSave: z.boolean().optional(),
  /** Date du premier lancement (pour la première semaine). */
  firstLaunchDate: z.string().datetime().optional(),
  /** Niveau du temps libre (4–7) : concourt avec les tâches/objectifs pour le temps. */
  freeTimeLevel: z.number().int().min(4).max(7).optional(),
  /** Date du dernier changement du niveau de temps libre (cooldown 2 semaines). */
  freeTimeLevelChangedAt: z.string().datetime().optional(),
})
export type Settings = z.infer<typeof SettingsSchema>

// ─── Auth locale ──────────────────────────────────────────────────────────

export const AuthAccountSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  email: z.string().email().max(254),
  passwordHash: z.string().min(1),
  passwordSalt: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type AuthAccount = z.infer<typeof AuthAccountSchema>

export const AuthSessionSchema = z.object({
  accountId: z.string().uuid(),
  signedInAt: z.string().datetime(),
})
export type AuthSession = z.infer<typeof AuthSessionSchema>

export const AuthStateSchema = z.object({
  account: AuthAccountSchema.nullable(),
  session: AuthSessionSchema.nullable(),
})
export type AuthState = z.infer<typeof AuthStateSchema>

// ─── Schedule (sous-projet 3) ──────────────────────────────────────────────

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/
const EXE_NAME_REGEX = /^[A-Za-z0-9_.\- ]+\.exe$/i

export const TimeRuleSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(40),
  color: z.string().regex(HEX_COLOR_REGEX),
  icon: z.string().min(1).max(40).optional(),
  categoryType: z.enum(['sleep', 'school', 'work', 'commitment', 'free', 'custom']).optional(),
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
  /** Niveau manuel (3 à 7 par défaut, jusqu'à 10). */
  level: z.number().min(0).max(10).default(5),
  /** Optional ISO date used as context; task deadlines drive the main distribution. */
  deadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  /** Activités personnelles que l'utilisateur veut préserver autour de cet objectif. */
  protectedCommitments: z.array(z.string().min(1).max(80)).max(12).optional(),
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
export const STORAGE_SCHEMAS = {
  settings: SettingsSchema,
  schedule: ScheduleStateSchema,
  objectives: ObjectivesStateSchema,
  levels: LevelsStateSchema,
  stats: StatsStateSchema,
  declared_apps: DeclaredAppsStateSchema,
  declared_app_usage: DeclaredAppUsageStateSchema,
  tasks: TasksStateSchema,
  auth: AuthStateSchema,
} as const satisfies Record<StorageKey, z.ZodTypeAny>
