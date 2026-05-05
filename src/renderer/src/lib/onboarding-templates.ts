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

const STUDENT: Template = {
  id: 'student',
  label: 'Étudiant',
  description: 'Cours, révisions, sport et soirées libres.',
  rules: [
    { id: 'r-deep', name: 'Étude profonde', color: '#6366f1', icon: 'Book' },
    { id: 'r-light', name: 'Révisions', color: '#06b6d4', icon: 'Brain' },
    { id: 'r-sport', name: 'Sport', color: '#10b981', icon: 'Dumbbell' },
    { id: 'r-rest', name: 'Récup', color: '#f97316', icon: 'Coffee' },
  ],
  entries: [
    { ruleId: 'r-deep', dayOfWeek: 0, startMinute: M(9), endMinute: M(12) },
    { ruleId: 'r-light', dayOfWeek: 0, startMinute: M(14), endMinute: M(16) },
    { ruleId: 'r-deep', dayOfWeek: 1, startMinute: M(9), endMinute: M(12) },
    { ruleId: 'r-sport', dayOfWeek: 1, startMinute: M(17), endMinute: M(18, 30) },
    { ruleId: 'r-deep', dayOfWeek: 2, startMinute: M(9), endMinute: M(12) },
    { ruleId: 'r-light', dayOfWeek: 2, startMinute: M(14), endMinute: M(16) },
    { ruleId: 'r-deep', dayOfWeek: 3, startMinute: M(9), endMinute: M(12) },
    { ruleId: 'r-sport', dayOfWeek: 3, startMinute: M(17), endMinute: M(18, 30) },
    { ruleId: 'r-light', dayOfWeek: 4, startMinute: M(10), endMinute: M(12) },
    { ruleId: 'r-rest', dayOfWeek: 5, startMinute: M(11), endMinute: M(13) },
  ],
}

const PRO: Template = {
  id: 'pro',
  label: 'Pro hybride',
  description: 'Travail deep, réunions, coupures saines, weekend libre.',
  rules: [
    { id: 'r-deep', name: 'Travail deep', color: '#3b82f6', icon: 'Code' },
    { id: 'r-meetings', name: 'Réunions', color: '#a855f7', icon: 'Briefcase' },
    { id: 'r-sport', name: 'Sport', color: '#10b981', icon: 'Bike' },
  ],
  entries: [
    { ruleId: 'r-deep', dayOfWeek: 0, startMinute: M(9), endMinute: M(12) },
    { ruleId: 'r-meetings', dayOfWeek: 0, startMinute: M(14), endMinute: M(16) },
    { ruleId: 'r-deep', dayOfWeek: 1, startMinute: M(9), endMinute: M(12) },
    { ruleId: 'r-sport', dayOfWeek: 1, startMinute: M(18), endMinute: M(19) },
    { ruleId: 'r-deep', dayOfWeek: 2, startMinute: M(9), endMinute: M(12) },
    { ruleId: 'r-meetings', dayOfWeek: 2, startMinute: M(14), endMinute: M(16) },
    { ruleId: 'r-deep', dayOfWeek: 3, startMinute: M(9), endMinute: M(12) },
    { ruleId: 'r-sport', dayOfWeek: 3, startMinute: M(18), endMinute: M(19) },
    { ruleId: 'r-deep', dayOfWeek: 4, startMinute: M(9), endMinute: M(12) },
  ],
}

const BALANCED: Template = {
  id: 'balanced',
  label: 'Vie équilibrée',
  description: 'Concentration, créativité, temps en famille, sommeil tôt.',
  rules: [
    { id: 'r-focus', name: 'Concentration', color: '#8b5cf6', icon: 'Brain' },
    { id: 'r-create', name: 'Création', color: '#ec4899', icon: 'Music' },
    { id: 'r-rest', name: 'Famille / repos', color: '#84cc16', icon: 'Heart' },
    { id: 'r-sport', name: 'Sport', color: '#10b981', icon: 'Dumbbell' },
  ],
  entries: [
    { ruleId: 'r-focus', dayOfWeek: 0, startMinute: M(9), endMinute: M(11) },
    { ruleId: 'r-create', dayOfWeek: 0, startMinute: M(15), endMinute: M(17) },
    { ruleId: 'r-focus', dayOfWeek: 1, startMinute: M(9), endMinute: M(11) },
    { ruleId: 'r-sport', dayOfWeek: 1, startMinute: M(18), endMinute: M(19) },
    { ruleId: 'r-focus', dayOfWeek: 2, startMinute: M(9), endMinute: M(11) },
    { ruleId: 'r-create', dayOfWeek: 2, startMinute: M(15), endMinute: M(17) },
    { ruleId: 'r-focus', dayOfWeek: 3, startMinute: M(9), endMinute: M(11) },
    { ruleId: 'r-sport', dayOfWeek: 3, startMinute: M(18), endMinute: M(19) },
    { ruleId: 'r-rest', dayOfWeek: 5, startMinute: M(10), endMinute: M(12) },
    { ruleId: 'r-rest', dayOfWeek: 6, startMinute: M(10), endMinute: M(12) },
  ],
}

export const TEMPLATES: readonly Template[] = [STUDENT, PRO, BALANCED]

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
