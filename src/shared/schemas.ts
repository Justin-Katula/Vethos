import { z } from 'zod'

/**
 * Clés autorisées pour le stockage.
 * Chaque clé correspond à un fichier nexus_<key>.json sur disque.
 * Ajouter ici toute nouvelle entité à persister.
 */
export const STORAGE_KEYS = ['settings'] as const
export type StorageKey = (typeof STORAGE_KEYS)[number]
export const StorageKeySchema = z.enum(STORAGE_KEYS)

/** Settings persistés (démo bout-en-bout du sous-projet 1). */
export const SettingsSchema = z.object({
  username: z.string().max(100).optional(),
  savedAt: z.string().datetime().optional(),
})
export type Settings = z.infer<typeof SettingsSchema>

/** Map clé → schéma. Utilisé par le storage pour valider à la lecture. */
export const STORAGE_SCHEMAS = {
  settings: SettingsSchema,
} as const satisfies Record<StorageKey, z.ZodTypeAny>
