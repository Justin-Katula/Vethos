import type { ScheduleEntry, TimeRule } from '@shared/schemas'

export type TemplateId = 'student' | 'pro' | 'balanced'

/**
 * Règle d'un template. Pas d'`id` ni `createdAt` — générés à `applyTemplate`.
 * `linkedProfileId` toujours null dans les templates (l'utilisateur lie ensuite).
 */
type TemplateRule = {
  /** ID temporaire utilisé uniquement pour relier les entries du template. */
  id: string
  name: string
  color: string
  icon?: string
}

type TemplateEntry = {
  ruleId: string // référence un TemplateRule.id
  dayOfWeek: number
  startMinute: number
  endMinute: number
}

export type Template = {
  id: TemplateId
  label: string
  description: string
  rules: TemplateRule[]
  entries: TemplateEntry[]
}

const M = (h: number, m = 0): number => h * 60 + m

const BASE: Template = {
  id: 'student', // keep ID for compatibility
  label: 'Base Incompressible',
  description: 'Tes 3 piliers fixes : Sommeil, École, Travail. Nexus gérera le reste.',
  rules: [
    { id: 'r-sleep', name: 'Sommeil', color: '#1E2530', icon: 'Moon' },
    { id: 'r-school', name: 'École', color: '#3BA3FF', icon: 'Book' },
    { id: 'r-work', name: 'Travail', color: '#FF8A00', icon: 'Briefcase' },
  ],
  entries: [
    { ruleId: 'r-sleep', dayOfWeek: 0, startMinute: M(23), endMinute: M(7) + 1440 }, // simplified
    { ruleId: 'r-school', dayOfWeek: 0, startMinute: M(8), endMinute: M(12) },
    { ruleId: 'r-work', dayOfWeek: 1, startMinute: M(14), endMinute: M(18) },
  ],
}

export const TEMPLATES: readonly Template[] = [BASE]

/**
 * Convertit un template en données prêtes à insérer dans le store de schedule.
 * Régénère tous les UUIDs et conserve le mapping rule → entries via une map locale.
 */
export function applyTemplate(template: Template): {
  rules: TimeRule[]
  entries: ScheduleEntry[]
} {
  const now = new Date().toISOString()
  const idByOldId = new Map<string, string>()

  const rules: TimeRule[] = template.rules.map((r) => {
    const newId = crypto.randomUUID()
    idByOldId.set(r.id, newId)
    return {
      id: newId,
      name: r.name,
      color: r.color,
      icon: r.icon,
      linkedProfileId: null,
      createdAt: now,
    }
  })

  const entries: ScheduleEntry[] = template.entries.map((e) => ({
    id: crypto.randomUUID(),
    ruleId: idByOldId.get(e.ruleId)!,
    dayOfWeek: e.dayOfWeek,
    startMinute: e.startMinute,
    endMinute: e.endMinute,
    createdAt: now,
  }))

  return { rules, entries }
}
