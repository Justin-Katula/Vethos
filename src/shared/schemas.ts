import { z } from 'zod'
import { ContractSchema } from './contract'
import { TRANCHES_AGE } from './sommeil-plancher'
import { APP_CATEGORIES } from './app-categories'
import { THEME_MODES } from './theme'

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
  'session_confirmations',
  'app_knowledge',
  'blocking_decision_cache',
  'app_overrides',
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
  /**
   * Apparence. Absent = `system` : une installation qui n'a jamais rien choisi
   * suit l'ordinateur, elle ne décide pas à la place de l'utilisateur.
   * `themeLightAt`/`themeDarkAt` ne servent qu'au mode `schedule` mais restent
   * mémorisés en dehors, pour qu'un aller-retour ne perde pas le réglage.
   */
  theme: z.enum(THEME_MODES).optional(),
  themeLightAt: z.string().regex(TIME_REGEX).optional(),
  themeDarkAt: z.string().regex(TIME_REGEX).optional(),
  /**
   * Clé DeepSeek de l'utilisateur, la sienne et pas celle de l'éditeur.
   *
   * Livrer une clé unique dans l'application reviendrait à la distribuer : elle
   * est extractible du paquet par n'importe quel acheteur, et c'est l'éditeur
   * qui paierait la consommation. Chacun met donc la sienne, ou n'en met aucune
   * — tout le classement local fonctionne sans.
   *
   * Stockée avec le reste des réglages, donc chiffrée au repos par le coffre.
   */
  deepseekApiKey: z.string().max(200).optional(),
  /** Le contrat d'Ulysse et son mode, Allié ou Sergent (spec moteur 2026-09-25). */
  contract: ContractSchema.optional(),
  /** La tranche d'âge : elle fixe le plancher de sommeil (8 h de 13 à 18 ans, 7 h au-delà). */
  ageBracket: z.enum(TRANCHES_AGE).optional(),
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

export const SCHEDULE_CATEGORIES = [
  'sleep',
  'school',
  'work',
  'commute',
  'commitment',
  'custom',
] as const
export type ScheduleCategory = (typeof SCHEDULE_CATEGORIES)[number]

export const ScheduleEntrySchema = z
  .object({
    /** 0=lundi … 6=dimanche. Toujours renseigné — dérivé de `date` pour une occurrence unique. */
    dayOfWeek: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
    categoryType: z.enum(SCHEDULE_CATEGORIES),
    label: z.string().min(1).max(60),
    color: z.string().regex(HEX_COLOR_REGEX),
    /**
     * Occurrence unique (YYYY-MM-DD). Absent = récurrent chaque semaine sur
     * `dayOfWeek` — le comportement historique, toujours le défaut. Présent =
     * cette seule date, jamais répétée la semaine suivante.
     */
    date: z.string().regex(DATE_REGEX).optional(),
  })
  .refine((e) => e.endMinute > e.startMinute, {
    message: 'The end must come after the start.',
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
    /** Plan d'action : En quoi consiste concrètement ce que tu vas faire ? (Obligatoire) */
    plan: z.string().min(1).max(2000),
    description: z.string().max(500).optional(),
    color: z.string().regex(HEX_COLOR_REGEX),
    /** Cible hebdomadaire en minutes, déclarée une fois par l'utilisateur. (D.4) */
    weeklyTargetMinutes: z.number().int().min(0).max(6000).default(300),
    /**
     * D.8 : applications bloquées PENDANT un bloc de cet objectif, déclarées à
     * la création. Ids de `declared_apps`. Vide = ce bloc ne bloque rien de
     * lui-même ; il suspend quand même l'horaire fixe le temps de la session.
     */
    appsToBlock: z.array(z.string().min(1)).max(200).default([]),
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
  /** Plan d'action : En quoi consiste concrètement ce que tu vas faire ? (Obligatoire) */
  plan: z.string().min(1).max(2000),
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
  /**
   * D.8 : applications bloquées PENDANT cette ancre. Une ancre passe désormais
   * par « Je commence » — uniquement pour déclencher ce blocage et mesurer sa
   * confirmation. Elle ne débite jamais rien (ni repos, ni capacité) : son
   * échec alimente le signal « ancre ratée » et rien d'autre (D.7/D.8).
   */
  appsToBlock: z.array(z.string().min(1)).max(200).default([]),
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
  /** Plan d'action : En quoi consiste concrètement ce que tu vas faire ? (Obligatoire) */
  plan: z.string().min(1).max(2000),
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
  /**
   * B.5.1 : rang de cette partie parmi ses sœurs (1, 2, 3…) ; `null` hors
   * découpage et pour la ligne de regroupement. `autoSplit` produit déjà cet
   * ordre — il était jeté à la création, donc les parties se retrouvaient
   * triées de façon arbitraire (leurs quatre clés de cascade sont identiques,
   * `createdAt` compris : il est calculé UNE fois pour tout le lot).
   */
  partOrder: z.number().int().positive().nullable().default(null),
  /**
   * B.5.2 : minutes accordées en plus par « il m'en faut plus », cumulées.
   * Séparées de `estimatedMinutes` À DESSEIN : l'estimation d'origine doit
   * rester intacte pour que le facteur de correction apprenne quelque chose
   * (B.2 compare réel ÷ estimé — gonfler l'estimé annulerait le signal).
   */
  extraMinutes: z.number().int().min(0).max(10000).default(0),
  /**
   * D.8 : applications bloquées PENDANT un bloc de cette tâche, déclarées à la
   * création. Ids de `declared_apps`, spécifiques à CE bloc — jamais une liste
   * globale héritée de l'horaire fixe.
   */
  appsToBlock: z.array(z.string().min(1)).max(200).default([]),
  color: z.string().optional(),
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
  /**
   * D.7 : retards ou non-démarrages consécutifs, par tâche et par objectif
   * (refId → compte). Mesuré par la confirmation « Je commence », jamais
   * déclaré. Alimente le 4e signal (C.3.4) — passif, sans action automatique.
   */
  consecutiveDelays: z.record(z.string(), z.number().int().min(0)).default({}),
  /**
   * B.5.2 : minutes de travail RÉELLEMENT faites, cumulées par tâche
   * (taskId → minutes). Une minute n'y entre que si son bloc a été confirmé
   * (« Je commence ») ET que sa fenêtre s'est écoulée — jamais une
   * déclaration, jamais du temps simplement planifié.
   *
   * C'est ce compteur, et lui seul, qui décide qu'une tâche est terminée :
   * l'utilisateur ne le déclare plus. Il alimente aussi `DurationRealSource`
   * (B.2), un type déclaré depuis l'origine du moteur et jamais branché
   * jusqu'ici — la boucle d'apprentissage G tournait donc à vide.
   */
  workedMinutesByRef: z.record(z.string(), z.number().int().min(0)).default({}),
  /**
   * D.7 : retard non confirmé cumulé par jour (YYYY-MM-DD → minutes). La
   * réserve de repos du jour l'absorbe d'abord ; seul l'excédent réduit la
   * capacité effective (A.3). Jamais reporté au lendemain.
   */
  dailyDelayMinutes: z.record(z.string(), z.number().int().min(0).max(1440)).default({}),
  /**
   * Le journal des séances (spec moteur 2026-09-25) : un événement par bloc
   * que l'application a VU — démarré ou non, tenu combien, arrêté pourquoi.
   * C'est la matière de l'apprentissage implicite (Beta, Kaplan-Meier, rampe,
   * phases de retrait, diagnostic d'arrêt). Mesuré, jamais déclaré — sauf la
   * raison d'arrêt, que l'utilisateur donne en un tap et que le moteur ne
   * prend que comme un signal faible.
   */
  sessionEvents: z.array(z.lazy(() => SessionEventSchema)).max(3000).default([]),
  /**
   * Prolongation : chaque offre faite, acceptée ou non. Le bandit y lit
   * combien d'offres par jour garder (1 au départ).
   */
  extensionOffers: z
    .array(z.object({ date: z.string().regex(DATE_REGEX), accepted: z.boolean() }))
    .max(200)
    .default([]),
  /** Jours libres proposés : pris, ou gardés normaux (YYYY-MM-DD → décision). */
  freeDays: z.record(z.string().regex(DATE_REGEX), z.enum(['taken', 'kept'])).default({}),
})
export type LearningState = z.infer<typeof LearningStateSchema>

/** Les six raisons d'arrêt proposées en un tap (Steel, 2007). */
export const STOP_REASONS = ['too-hard', 'boring', 'no-rush', 'distracted', 'tired', 'real-event'] as const
export type StopReason = (typeof STOP_REASONS)[number]

export const SessionEventSchema = z.object({
  /** Id stable du bloc (engine.ts) — un seul événement par bloc et par jour. */
  blockId: z.string().min(1),
  date: z.string().regex(DATE_REGEX),
  kind: z.enum(['task', 'objective', 'ancre']),
  refId: z.string().min(1),
  /** Catégorie de la tâche, ou « objectif » / « ancre » : la clé de l'apprentissage des durées. */
  category: z.string().max(60).default('général'),
  /** Heure de début prévue, en minutes depuis minuit. */
  plannedStartMinute: z.number().int().min(0).max(1440),
  /** Durée de travail prévue (pause exclue). */
  plannedMinutes: z.number().int().min(1).max(1440),
  started: z.boolean(),
  /** Retard mesuré à « Je commence » ; null si jamais démarré. */
  delayMinutes: z.number().int().min(0).max(1440).nullable().default(null),
  /** Démarré sans attendre l'overlay (raccourci, ou avant que l'overlay ne vienne). */
  spontaneous: z.boolean().default(false),
  /** Minutes réellement tenues ; null tant que la séance n'est pas close. */
  heldMinutes: z.number().int().min(0).max(1440).nullable().default(null),
  /** Arrêtée avant la fin prévue. */
  stoppedEarly: z.boolean().default(false),
  stop: z
    .object({
      reason: z.enum(STOP_REASONS).nullable(),
      text: z.string().max(500).optional(),
      /** Catégorie lue dans le texte (Coach, ou mots-clés hors ligne) : une donnée, jamais un verdict. */
      textReason: z.enum(STOP_REASONS).optional(),
      /** Temps mis à répondre, en ms : une réponse mécanique est un signal plus faible. */
      answerMs: z.number().int().min(0).optional(),
      /** Tentatives d'ouvrir une app bloquée dans les 10 min avant l'arrêt. */
      attemptsBefore: z.number().int().min(0).default(0),
    })
    .optional(),
  /** Tentatives d'ouvrir une app bloquée pendant la séance. */
  blockedAttempts: z.number().int().min(0).default(0),
  /**
   * Prolongation acceptée, en minutes. `plannedMinutes` ne bouge pas : la dose
   * des semaines suivantes ne se base que sur le planifié (anti-cliquet) ; la
   * prolongation ne nourrit que la courbe de survie.
   */
  extensionMinutes: z.number().int().min(0).max(240).optional(),
  /** Instant de la dernière tentative d'app bloquée (epoch ms). */
  lastAttemptAt: z.number().int().optional(),
  /** Minutes de charge des 48 dernières heures au moment du bloc. */
  load48hMinutes: z.number().int().min(0).default(0),
  /** Heures éveillé au début du bloc. */
  hoursAwake: z.number().min(0).max(24).optional(),
  createdAt: z.string().datetime(),
})
export type SessionEvent = z.infer<typeof SessionEventSchema>

/**
 * D.8 : une session pilotée par un bloc du planning (tâche, objectif, ancre),
 * ouverte par la confirmation « Je commence ». Pendant sa fenêtre, elle
 * bloque exactement `apps_à_bloquer(bloc)` (D.8).
 *
 * `blockId` reprend l'id stable produit par le moteur (engine.ts) :
 * déterministe sur (nature, référence, date, heure de placement), jamais sur
 * un compteur qui glisse d'un calcul à l'autre. C'est ce qui permet de savoir,
 * d'un tic à l'autre, si CE bloc précis a déjà été confirmé aujourd'hui.
 */
export const BlockSessionSchema = z
  .object({
    blockId: z.string().min(1),
    startedAt: z.number().int(),
    endsAt: z.number().int(),
    appIds: z.array(z.string().min(1)).max(200),
    blockedSites: z.array(z.string().min(1)).max(500).default([]),
  })
  .refine((session) => session.endsAt > session.startedAt, {
    message: 'The end must come after the start.',
    path: ['endsAt'],
  })

export const BlockingRulesStateSchema = z.object({
  /** Unique source : le bloc du planning confirmé par « Je commence ». */
  block: BlockSessionSchema.nullable().default(null),
})

export type BlockSession = z.infer<typeof BlockSessionSchema>
export type BlockingRulesState = z.infer<typeof BlockingRulesStateSchema>

/**
 * D.7/D.8 : bookkeeping de la confirmation « Je commence », pour AUJOURD'HUI
 * seulement — un stockage qui grossirait indéfiniment n'aurait aucune utilité,
 * seul le jour courant décide si un bloc a déjà été confirmé ou déjà crédité
 * en retard. `date` change → l'horloge de planification repart d'un état vide,
 * jamais d'un jour à cheval sur l'autre (cohérent avec D.7 : le retard ne
 * franchit jamais le jour même).
 */
const MinuteRangeSchema = z
  .object({
    start: z.number().int().min(0).max(1439),
    end: z.number().int().min(1).max(1440),
  })
  .refine((r) => r.end > r.start, { message: 'La fin doit être postérieure au début.' })

export const SessionConfirmationsStateSchema = z.object({
  date: z.string().regex(DATE_REGEX),
  /** blockId (id stable produit par le moteur) → horodatage epoch ms de la confirmation. */
  confirmedAt: z.record(z.string(), z.number().int()).default({}),
  /**
   * Intervalles [début, fin) de la journée déjà crédités en retard (D.7),
   * fusionnés et non chevauchants — empêche un double crédit si l'horloge
   * repasse dessus à un tic suivant.
   *
   * Dédupliqué par CHEVAUCHEMENT D'INTERVALLE, jamais par blockId ni par
   * simple minute de départ : le moteur recalcule le plan à chaque tic
   * (ÉCHEC 3), et rien ne garantit qu'un même créneau reste occupé par le
   * MÊME bloc, ni même par un bloc qui démarre exactement à la même minute,
   * d'un tic à l'autre. Bug réel observé le 2026-08-22 : deux tics à 5
   * secondes d'écart ont produit deux placements différents du début de
   * journée — un chevauchait l'autre sans partager une seule minute de
   * départ identique — et 283 des 881 minutes créditées ce jour-là étaient un
   * pur doublon. Seul un test de recouvrement d'intervalle (pas d'égalité de
   * point) attrape ce cas : pour chaque bloc manqué, seule la portion qui ne
   * chevauche AUCUN intervalle déjà crédité s'ajoute au total du jour.
   */
  lapsedCreditedRanges: z.array(MinuteRangeSchema).default([]),
  /**
   * B.5.2 : intervalles de la journée déjà crédités en TRAVAIL FAIT — le
   * jumeau exact de `lapsedCreditedRanges` juste au-dessus, pour les blocs
   * confirmés cette fois. Même protection par recouvrement d'intervalle, pour
   * exactement la même raison : le plan se recalcule à chaque tic et deux
   * placements successifs peuvent couvrir les mêmes minutes sans partager le
   * moindre blockId ni la moindre minute de départ. Sans ça, une tâche
   * pourrait se croire terminée avec la moitié du travail réellement fait.
   */
  workCreditedRanges: z.array(MinuteRangeSchema).default([]),
  /**
   * refId (tâche, objectif, ancre) dont le compteur de ratés a déjà avancé
   * AUJOURD'HUI. D.8 est explicite : une ancre (et par le même principe, une
   * tâche ou un objectif — signal 4) est comptée ratée « pour un jour donné »
   * — une fois par jour, jamais une fois par bloc manqué. Un objectif qui
   * reçoit 2 blocs profonds le même jour (D.5) et rate les deux ne doit faire
   * avancer `consecutiveDelays`/`anchorMissCounts` que de +1, pas +2. Bug réel
   * observé le 2026-08-22 : sans cette garde, le compteur de l'objectif avait
   * grimpé à 4 en seulement deux jours au lieu de 2.
   */
  streakBumpedRefs: z.array(z.string()).default([]),
  /**
   * Les blocs arrêtés par « Stop » aujourd'hui. Un bloc arrêté n'est plus ni
   * « en cours », ni proposé à nouveau par l'overlay — même si son créneau
   * (une ancre, par exemple) reste le même dans le plan.
   */
  stoppedBlockIds: z.array(z.string()).max(200).default([]),
  /** Blocs à qui une prolongation a déjà été offerte aujourd'hui (1 par bloc). */
  extensionOfferedBlockIds: z.array(z.string()).max(200).default([]),
  /**
   * Le bloc actuellement surveillé — celui que le dernier tic a trouvé actif
   * et non confirmé — ou `null`. C'est la mémoire qui permet de détecter
   * qu'une fenêtre s'est fermée SANS jamais avoir besoin de la retrouver dans
   * un recalcul frais.
   *
   * Nécessaire précisément parce que le plan se recalcule à chaque tic
   * (ÉCHEC 3) : une fois qu'un bloc a quitté la fenêtre visible (temps déjà
   * passé, D.9/`clipElapsedToday`), plus AUCUN recalcul ne le reproposera
   * jamais — il disparaît purement et simplement du plan. Sans se souvenir de
   * ce qu'on observait AVANT qu'il disparaisse, rien ne peut jamais dire
   * « ça vient de se fermer sans confirmation ». Bug réel du 2026-08-22 :
   * l'overlay « Je commence » ne s'est déclenché qu'une seule fois de toute
   * la journée, puis plus jamais, alors que plusieurs blocs ont bien fermé
   * sans confirmation entre-temps — le mécanisme cherchait sa réponse dans un
   * plan qui avait déjà tout oublié du passé.
   */
  observedPending: z
    .object({
      blockId: z.string().min(1),
      kind: z.enum(['task', 'objective', 'ancre']),
      refId: z.string().min(1),
      startMinute: z.number().int().min(0).max(1439),
      endMinute: z.number().int().min(1).max(1440),
      /**
       * B.5.2 : minutes de TRAVAIL du bloc, pause exclue (E.1) — nécessaire
       * pour créditer le bon total quand la fenêtre se ferme. Optionnel : une
       * mémoire écrite par une version antérieure ne le porte pas, le code
       * retombe alors sur la durée pleine.
       */
      workMinutes: z.number().int().min(0).max(1440).optional(),
      /** Clé d'apprentissage du bloc (spec 2026-09-25), recopiée dans le journal. */
      category: z.string().max(60).optional(),
      /** Heure de début PRÉVUE, avant tout retard : le journal la garde. */
      plannedStartMinute: z.number().int().min(0).max(1439).optional(),
    })
    .nullable()
    .default(null),
})
export type SessionConfirmationsState = z.infer<typeof SessionConfirmationsStateSchema>
export type ObservedPendingBlock = NonNullable<SessionConfirmationsState['observedPending']>

// ─── Base de connaissances des applications partagée ───────────────────────

export const KnowledgeSourceSchema = z.enum([
  'BUILTIN_CATALOG',
  'LOCAL_RULE',
  'WINDOWS_METADATA',
  'AI',
  'WEB_PLUS_AI',
])
export type KnowledgeSource = z.infer<typeof KnowledgeSourceSchema>

export const ClassificationStateSchema = z.enum(['RESOLVED', 'UNRESOLVED'])
export type ClassificationState = z.infer<typeof ClassificationStateSchema>

export const AppKnowledgeProfileSchema = z.object({
  identifiant: z.string().min(1),
  appIdInterne: z.string().min(1).optional(),
  nom_affiche: z.string().min(1),
  categorie_de_base: z.string().min(1),
  category: z.string().default('unknown'),
  classificationState: ClassificationStateSchema.default('RESOLVED'),
  source: KnowledgeSourceSchema.default('AI'),
  sourceVersion: z.number().int().default(1),
  ce_qu_on_y_fait: z.string().min(1),
  exemples_utilite: z.array(z.string().min(1)).min(3),
  points_faibles: z.array(z.string().min(1)),
  capacites_confirmees: z.array(z.string().min(1)),
  capacites_incertaines: z.array(z.string()),
  confiance: z.enum(['haute', 'moyenne', 'basse']),
  date_recherche: z.string(),
  /** URLs des sources web consultées en direct lors de la recherche. */
  sources_web: z.array(z.string()).default([]),
  iconDataUrl: z.string().optional(),
  defaultRole: z.string().optional(),
  distractionPotential: z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH']).optional(),
  domains: z.array(z.string()).optional(),
  coreCapabilities: z.array(z.string()).optional(),
  supportingCapabilities: z.array(z.string()).optional(),
})
export type AppKnowledgeProfile = z.infer<typeof AppKnowledgeProfileSchema>

export const AppKnowledgeBaseSchema = z.object({
  profiles: z.record(z.string(), AppKnowledgeProfileSchema).default({}),
})
export type AppKnowledgeBase = z.infer<typeof AppKnowledgeBaseSchema>

// ─── Cache de décision de blocage strict V1 ──────────────────────────────

export const BlockedAppDecisionRecordSchema = z.object({
  identifiant: z.string(),
  nom_affiche: z.string(),
  raison: z.string(),
  iconDataUrl: z.string().optional(),
})

export const BlockingDecisionCachedItemSchema = z.object({
  key: z.string().min(1),
  allowedAppIds: z.array(z.string()),
  questionIds: z.array(z.string()).default([]),
  blockedApps: z.array(BlockedAppDecisionRecordSchema),
  inventoryVersion: z.string(),
  rulesVersion: z.number().int(),
  createdAt: z.string(),
})
export type BlockingDecisionCachedItem = z.infer<typeof BlockingDecisionCachedItemSchema>

export const BlockingDecisionCacheStateSchema = z.object({
  decisions: z.record(z.string(), BlockingDecisionCachedItemSchema).default({}),
})
export type BlockingDecisionCacheState = z.infer<typeof BlockingDecisionCacheStateSchema>

// ─── Classification des applications & Overrides utilisateur ─────────────

export const CLASSIFICATION_SOURCES = [
  'USER_OVERRIDE',
  'BUILTIN_CATALOG',
  'EXACT_LOCAL_KNOWLEDGE',
  'DETERMINISTIC_METADATA_RULE',
  'AI_RESOLVED',
  'UNRESOLVED',
  'LEGACY_UNKNOWN',
] as const
export const ClassificationSourceSchema = z.enum(CLASSIFICATION_SOURCES)
export type ClassificationSource = z.infer<typeof ClassificationSourceSchema>

export const AppOverrideRecordSchema = z.object({
  category: z.enum(APP_CATEGORIES),
  overriddenAt: z.string(),
  reason: z.string().optional(),
})
export type AppOverrideRecord = z.infer<typeof AppOverrideRecordSchema>

export const AppOverridesStateSchema = z.object({
  overrides: z.record(z.string(), AppOverrideRecordSchema).default({}),
})
export type AppOverridesState = z.infer<typeof AppOverridesStateSchema>

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
  session_confirmations: SessionConfirmationsStateSchema,
  app_knowledge: AppKnowledgeBaseSchema,
  blocking_decision_cache: BlockingDecisionCacheStateSchema,
  app_overrides: AppOverridesStateSchema,
} as const satisfies Record<StorageKey, z.ZodTypeAny>
