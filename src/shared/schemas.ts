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

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/

/** Settings persistés. */
export const SettingsSchema = z.object({
  username: z.string().max(100).optional(),
  savedAt: z.string().datetime().optional(),
  /** True une fois l'onboarding terminé OU explicitement skippé. */
  onboardingCompleted: z.boolean().optional(),
  /**
   * Heure de coucher / de réveil (HH:MM). Source unique du sommeil : les
   * entrées `sleep` de l'emploi du temps en sont dérivées (A.1), et le garde-fou
   * de notification (critère 3) lit les mêmes valeurs.
   */
  sleepStart: z.string().regex(TIME_REGEX).optional(),
  sleepEnd: z.string().regex(TIME_REGEX).optional(),
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

// ─── Réalité fixe : emploi du temps (A.1) ─────────────────────────────────
//
// Une entrée = du temps déjà pris, non négociable : sommeil, école, travail,
// trajet, obligation. L'absence d'entrée EST le temps libre — il n'existe donc
// pas de catégorie « free » : elle se déduit, elle ne se déclare pas.

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/
const EXE_NAME_REGEX = /^[A-Za-z0-9_.\- ]+\.exe$/i

export const SCHEDULE_CATEGORIES = ['sleep', 'school', 'work', 'commute', 'commitment', 'custom'] as const
export type ScheduleCategory = (typeof SCHEDULE_CATEGORIES)[number]

export const ScheduleEntrySchema = z
  .object({
    /** 0=lundi … 6=dimanche. */
    dayOfWeek: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
    categoryType: z.enum(SCHEDULE_CATEGORIES),
    label: z.string().min(1).max(60),
    color: z.string().regex(HEX_COLOR_REGEX),
  })
  .refine((e) => e.endMinute > e.startMinute, {
    message: 'La fin doit être postérieure au début.',
    path: ['endMinute'],
  })
export type ScheduleEntry = z.infer<typeof ScheduleEntrySchema>

export const ScheduleStateSchema = z.object({
  entries: z.array(ScheduleEntrySchema).max(500),
})
export type ScheduleState = z.infer<typeof ScheduleStateSchema>

// ─── Objectifs (D.4 — gouvernés par le rythme, jamais de deadline) ─────────
//
// Règle absolue (critère 5) : la forme elle-même interdit la deadline. Aucun
// champ de date n'existe, et `.strict()` fait échouer l'écriture si un appelant
// tente d'en glisser un.

export const ObjectiveSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(60),
    description: z.string().max(500).optional(),
    color: z.string().regex(HEX_COLOR_REGEX),
    /** Cible hebdomadaire en minutes, déclarée une fois par l'utilisateur. (D.4) */
    weeklyTargetMinutes: z.number().int().min(0).max(6000).default(300),
    createdAt: z.string().datetime(),
  })
  .strict()
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
  /** Déclencheur (ex: « sport »). Une seule ancre par déclencheur (D.3). */
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

// ─── Tâches (gouvernées par la marge — deadline + quantité finie) ─────────

export const TaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(100),
  /** Deadline ISO date string (YYYY-MM-DD). */
  deadline: z.string().regex(DATE_REGEX),
  /** Importance déclarée UNE SEULE FOIS à la création (1-10). Jamais recalculée. (C.1.1) */
  importance: z.number().int().min(1).max(10).default(5),
  /** Catégorie de travail (ex: « maths »). Porte le facteur de correction (B.1). */
  category: z.string().min(1).max(60).default('général'),
  /** Nature du travail : décide du facteur par défaut (B.3) et du seuil de fragment (A.2). */
  workKind: z.enum(['routine', 'novel']).default('routine'),
  /** Estimation brute de l'utilisateur, en minutes. (B.1/B.3) */
  estimatedMinutes: z.number().int().min(1).max(10000).default(60),
  /** Travail restant en minutes, corrigé par le facteur. Diminue au fil des sessions. (C.1) */
  remainingMinutes: z.number().int().min(0).max(10000).default(60),
  /** Facteur appliqué à l'estimation (B.1/B.4). Défaut B.3 tant que <5 tâches complétées. */
  correctionFactor: z.number().min(0.5).max(3).default(1.4),
  /** Regroupement visuel : id de la tâche d'origine quand elle a été découpée (B.5). */
  parentTaskId: z.string().uuid().nullable().default(null),
  status: z.enum(['active', 'history']),
  createdAt: z.string().datetime(),
})
export type Task = z.infer<typeof TaskSchema>

export const TasksStateSchema = z.object({
  tasks: z.array(TaskSchema).max(2000),
})
export type TasksState = z.infer<typeof TasksStateSchema>

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
  /** Nature du travail — sert au seuil de fragment personnalisé (A.2.1). */
  workKind: z.enum(['routine', 'novel']).optional(),
  estimatedMinutes: z.number().int().min(1).optional(),
  /** Durée MESURÉE (temps de session), jamais déclarée. (B.2/G.1) */
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
  /**
   * Utilisation réelle par jour (YYYY-MM-DD → % de la capacité effective
   * consommée). Alimente la fatigue accumulée (E.4) et la respiration
   * hebdomadaire (E.3) : mesuré, jamais déclaré (G.1).
   */
  dailyUtilization: z.record(z.string(), z.number().min(0).max(500)).default({}),
  /** Minutes déjà servies par objectif cette semaine (objectiveId → minutes). D.4 */
  weeklyObjectiveServed: z.record(z.string(), z.number().int().min(0)).default({}),
  /** Date du dernier service par objectif (objectiveId → YYYY-MM-DD). D.4 */
  objectiveLastServed: z.record(z.string(), z.string().regex(DATE_REGEX)).default({}),
  /** Horodatage du dernier signal émis par sujet — anti-saturation 72 h (F.2). */
  lastSignalAt: z.record(z.string(), z.string().datetime()).default({}),
  /** Tâches créées par semaine (YYYY-Www → compte). Mesure λ pour le WIP (D.6). */
  tasksCreatedPerWeek: z.record(z.string(), z.number().int().min(0)).default({}),
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
  declared_apps: DeclaredAppsStateSchema,
  declared_app_usage: DeclaredAppUsageStateSchema,
  tasks: TasksStateSchema,
  auth: AuthStateSchema,
  ancres: AncresStateSchema,
  learning: LearningStateSchema,
  blocking_rules: BlockingRulesStateSchema,
} as const satisfies Record<StorageKey, z.ZodTypeAny>
