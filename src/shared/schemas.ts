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
  'ancres',
  'learning',
  'blocking_rules',
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
  /** Cible hebdomadaire en minutes, déclarée une fois par l'utilisateur. (D.4)
   *  Un objectif ne peut JAMAIS avoir de deadline — règle absolue (D.4, critère 5). */
  weeklyTargetMinutes: z.number().int().min(0).max(6000).default(300),
  /** Activités personnelles que l'utilisateur veut préserver autour de cet objectif. */
  protectedCommitments: z.array(z.string().min(1).max(80)).max(12).optional(),
  createdAt: z.string().datetime(),
})
export type Objective = z.infer<typeof ObjectiveSchema>

// ─── Ancres (Partie D.3 — heure fixe, ne bouge jamais) ────────────────────
//
// Une ancre est une habitude fixe à heure précise (ex: sport à 18h, méditation
// à 7h). Contrairement aux ScheduleEntry (qui modelisent l'emploi du temps
// fixe sommeil/école/travail), les ancres sont des engagements personnels avec
// une version minimale calculée (D.3).
// Règle absolue : deux ancres ne peuvent jamais occuper le même créneau.

export const AncreSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(60),
  color: z.string().regex(HEX_COLOR_REGEX),
  /** Description du déclencheur (ex: "sport", "méditation", "lecture"). */
  trigger: z.string().min(1).max(80),
  /** Minute de la journée (0-1439) où l'ancre est placée. Heure fixe, ne bouge jamais. */
  anchorMinute: z.number().int().min(0).max(1439),
  /** Jours de la semaine où l'ancre est active (0=lundi ... 6=dimanche). */
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  /** Durée normale maximale en minutes. */
  normalMaxMinutes: z.number().int().min(15).max(480).default(60),
  /** Version minimale calculée (D.3) : MAX(20 min, 40% × normalMaxMinutes). */
  minimumMinutes: z.number().int().min(20).max(480).default(24),
  createdAt: z.string().datetime(),
})
export type Ancre = z.infer<typeof AncreSchema>

export const AncresStateSchema = z.object({
  ancres: z.array(AncreSchema),
})
export type AncresState = z.infer<typeof AncresStateSchema>

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
  /** Importance déclarée UNE SEULE FOIS par l'utilisateur à la création (1-10). Jamais recalculée. (C.1.1) */
  importance: z.number().int().min(1).max(10).default(5),
  /** Catégorie de travail (ex: "maths", "codage", "rédaction"). Utilisée pour le facteur de correction (B.1). */
  category: z.string().max(60).optional(),
  /** Estimation de durée par l'utilisateur, en minutes. (B.1/B.3) */
  estimatedMinutes: z.number().int().min(1).max(1440).default(60),
  /** Travail restant en minutes (diminue au fil des sessions). (C.1) */
  remainingMinutes: z.number().int().min(0).default(60),
  /** Facteur de correction calculé (B.1). Défaut selon B.3 tant que <5 tâches complétées. */
  correctionFactor: z.number().min(0.5).max(3).default(1.4),
  status: z.enum(['active', 'history']),
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

// ─── Learning (Partie G — observations pour l'apprentissage) ──────────────

export const LearningObservationSchema = z.object({
  /** Soit une complétion de tâche (durée estimée vs réelle), soit une observation de bloc. */
  taskId: z.string().uuid().optional(),
  category: z.string().max(60).optional(),
  estimatedMinutes: z.number().int().min(1).optional(),
  actualMinutes: z.number().int().min(1).optional(),
  /** Heure de la journée (0-23) où le bloc a commencé. */
  startHour: z.number().int().min(0).max(23).optional(),
  /** Le bloc a-t-il été complété (true) ou interrompu (false) ? */
  completed: z.boolean().optional(),
  createdAt: z.string().datetime(),
})
export type LearningObservation = z.infer<typeof LearningObservationSchema>

export const LearningStateSchema = z.object({
  observations: z.array(LearningObservationSchema).max(10000).default([]),
  /** Compteur de ratés par ancre (ancreId → nombre de ratés consécutifs). */
  anchorMissCounts: z.record(z.string(), z.number().int().min(0)).default({}),
})
export type LearningState = z.infer<typeof LearningStateSchema>

/** Map clé → schéma. Utilisé par le storage pour valider à la lecture. */
/**
 * Règles de blocage : créneaux récurrents et session manuelle ponctuelle.
 *
 * Les minutes sont bornées à 0..1439 et une durée nulle est refusée : un
 * créneau `10h00 → 10h00` était interprété comme un franchissement de minuit
 * et bloquait 24 h/24 en silence. La validation vit ici pour que la donnée
 * fautive n'atteigne jamais le disque, et dans `blocking/schedule.ts` pour
 * que le moteur reste sûr même face à un fichier édité à la main.
 */
export const RecurringSlotSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().max(120),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(0).max(1439),
    appIds: z.array(z.string().min(1)).max(200),
    /** Domaines bloqués, sans schéma ni www. Ex. « youtube.com ». */
    blockedSites: z.array(z.string().min(1)).max(500).default([]),
  })
  .refine((slot) => slot.startMinute !== slot.endMinute, {
    message: 'Un créneau de durée nulle bloquerait en permanence.',
    path: ['endMinute'],
  })

export const ManualSessionSchema = z
  .object({
    startedAt: z.number().int(),
    endsAt: z.number().int(),
    appIds: z.array(z.string().min(1)).max(200),
    blockedSites: z.array(z.string().min(1)).max(500).default([]),
  })
  .refine((session) => session.endsAt > session.startedAt, {
    message: 'La fin doit être postérieure au début.',
    path: ['endsAt'],
  })

export const BlockingRulesStateSchema = z.object({
  slots: z.array(RecurringSlotSchema).max(100).default([]),
  manual: ManualSessionSchema.nullable().default(null),
})

export type RecurringSlot = z.infer<typeof RecurringSlotSchema>
export type ManualSession = z.infer<typeof ManualSessionSchema>
export type BlockingRulesState = z.infer<typeof BlockingRulesStateSchema>

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
  ancres: AncresStateSchema,
  learning: LearningStateSchema,
  blocking_rules: BlockingRulesStateSchema,
} as const satisfies Record<StorageKey, z.ZodTypeAny>
