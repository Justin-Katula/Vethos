import { z } from 'zod'

/**
 * Clés autorisées pour le stockage.
 * Chaque clé correspond à un fichier nexus_<key>.json sur disque.
 * Ajouter ici toute nouvelle entité à persister.
 */
export const STORAGE_KEYS = ['settings', 'blocking', 'blocking_active', 'schedule'] as const
export type StorageKey = (typeof STORAGE_KEYS)[number]
export const StorageKeySchema = z.enum(STORAGE_KEYS)

/** Settings persistés (démo bout-en-bout du sous-projet 1). */
export const SettingsSchema = z.object({
  username: z.string().max(100).optional(),
  savedAt: z.string().datetime().optional(),
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
  unlockState: z.discriminatedUnion('phase', [
    z.object({ phase: z.literal('locked') }),
    z.object({ phase: z.literal('cooldown'), startedAt: z.string().datetime() }),
    z.object({ phase: z.literal('awaiting_justification') }),
    z.object({ phase: z.literal('unlocked'), reason: z.string() }),
  ]),
  appliedFirewallRules: z.array(z.string()),
})
export type ActiveSession = z.infer<typeof ActiveSessionSchema>

export const BlockingStateSchema = z.object({
  profiles: z.array(BlockingProfileSchema),
  history: z
    .array(
      z.object({
        sessionId: z.string().uuid(),
        profileId: z.string().uuid(),
        startedAt: z.string().datetime(),
        endedAt: z.string().datetime(),
        completedNormally: z.boolean(),
      }),
    )
    .max(500),
})
export type BlockingState = z.infer<typeof BlockingStateSchema>

// ─── Schedule (sous-projet 3) ──────────────────────────────────────────────

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/

export const TimeRuleSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(40),
  color: z.string().regex(HEX_COLOR_REGEX),
  icon: z.string().min(1).max(40).optional(),
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

/** Map clé → schéma. Utilisé par le storage pour valider à la lecture. */
export const STORAGE_SCHEMAS = {
  settings: SettingsSchema,
  blocking: BlockingStateSchema,
  blocking_active: ActiveSessionSchema,
  schedule: ScheduleStateSchema,
} as const satisfies Record<StorageKey, z.ZodTypeAny>
