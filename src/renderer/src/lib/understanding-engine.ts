import type {
  UnderstandingCategory,
  UnderstandingResult,
} from '@shared/engine-results'
import type { Objective, RegistryItem, Task, WorkBlockingConfig } from '@shared/schemas'
import type { UserCorrection } from '@shared/user-model'

export type UnderstandingHistoryContext = {
  sessions?: Array<{ taskId?: string; objectiveId?: string; targetId?: string; targetType?: string; startedAt?: string; endedAt?: string }>
  corrections?: UserCorrection[]
}

function historyForTarget(targetType: 'task' | 'objective', targetId: string, context?: UnderstandingHistoryContext) {
  const sessions = (context?.sessions ?? []).filter((session) =>
    targetType === 'task' ? session.taskId === targetId || (session.targetType === 'task' && session.targetId === targetId)
      : session.objectiveId === targetId || (session.targetType === 'objective' && session.targetId === targetId),
  )
  const corrections = (context?.corrections ?? []).filter((correction) => correction.targetType === targetType && correction.targetId === targetId)
  return { sessions, corrections }
}

function correctedCategory(corrections: readonly UserCorrection[]): UnderstandingCategory | undefined {
  const allowed: UnderstandingCategory[] = ['school','work','project','health','discipline','finance','personal','maintenance','unknown']
  const value = [...corrections].reverse().find((correction) => typeof correction.newValue === 'string')?.newValue
  return typeof value === 'string' && allowed.includes(value as UnderstandingCategory) ? value as UnderstandingCategory : undefined
}

export type CoachUnderstandingHint = {
  category?: UnderstandingCategory
  importanceGuess?: number
  lifeImpactGuess?: number
  protectionNeedGuess?: number
  usefulAppsGuess?: string[]
  usefulSitesGuess?: string[]
  confidence?: number
  reasons?: string[]
}

type LocalCategorySignal = {
  category: UnderstandingCategory
  score: number
  reason: string
}

const CATEGORY_KEYWORDS: Record<Exclude<UnderstandingCategory, 'unknown'>, string[]> = {
  school: [
    'devoir',
    'examen',
    'exam',
    'réviser',
    'reviser',
    'cours',
    'chapitre',
    'math',
    'école',
    'ecole',
    'université',
    'university',
    'assignment',
    'homework',
  ],
  work: [
    'travail',
    'job',
    'client',
    'réunion',
    'reunion',
    'meeting',
    'rapport',
    'report',
    'email',
    'bureau',
    'shift',
  ],
  project: [
    'projet',
    'project',
    'coder',
    'code',
    'développer',
    'developper',
    'build',
    'lancer',
    'prototype',
    'release',
  ],
  health: [
    'sport',
    'gym',
    'santé',
    'sante',
    'médecin',
    'medecin',
    'dormir',
    'sommeil',
    'walk',
    'workout',
  ],
  discipline: [
    'discipline',
    'focus',
    'concentration',
    'bloquer',
    'block',
    'addiction',
    'distraction',
    'habitude',
  ],
  finance: [
    'budget',
    'argent',
    'banque',
    'facture',
    'impôt',
    'impot',
    'tax',
    'finance',
    'payer',
  ],
  personal: ['famille', 'ami', 'personnel', 'journal', 'vie', 'maison', 'message'],
  maintenance: [
    'ménage',
    'menage',
    'nettoyer',
    'lessive',
    'réparer',
    'reparer',
    'ranger',
    'organiser',
    'maintenance',
  ],
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function categorySignals(text: string): LocalCategorySignal[] {
  const normalized = normalize(text)
  return Object.entries(CATEGORY_KEYWORDS)
    .map(([category, keywords]) => {
      const hits = keywords.filter((keyword) => normalized.includes(normalize(keyword)))
      return {
        category: category as Exclude<UnderstandingCategory, 'unknown'>,
        score: hits.length,
        reason: hits.length > 0 ? `Mots détectés : ${hits.slice(0, 3).join(', ')}` : '',
      }
    })
    .filter((signal) => signal.score > 0)
    .sort((a, b) => b.score - a.score)
}

function pickLocalCategory(text: string): { category: UnderstandingCategory; reason?: string; clear: boolean } {
  const [best, second] = categorySignals(text)
  if (!best) return { category: 'unknown', clear: false }
  const clear = best.score >= 2 || !second || best.score > second.score
  return { category: best.category, reason: best.reason, clear }
}

function splitUsefulRegistry(registry: RegistryItem[] | undefined, predicate: (item: RegistryItem) => boolean): {
  apps: string[]
  sites: string[]
} {
  const useful = (registry ?? []).filter(predicate)
  return {
    apps: unique(
      useful
        .filter((item) => item.kind === 'app')
        .map((item) => item.executableName ?? item.identifier),
    ),
    sites: unique(useful.filter((item) => item.kind === 'site').map((item) => item.identifier)),
  }
}

function usefulFromAllowlist(blocking: WorkBlockingConfig | undefined): { apps: string[]; sites: string[] } {
  if (!blocking?.enabled || blocking.mode !== 'allowlist') return { apps: [], sites: [] }
  return {
    apps: unique([...blocking.processes, ...blocking.networkApps]),
    sites: unique(blocking.sites),
  }
}

function deadlineSoon(deadline: string): boolean {
  const today = new Date()
  const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`
  const [fromY, fromM, fromD] = localToday.split('-').map(Number) as [number, number, number]
  const [toY, toM, toD] = deadline.split('-').map(Number) as [number, number, number]
  const from = new Date(fromY, fromM - 1, fromD)
  const to = new Date(toY, toM - 1, toD)
  const diffDays = Math.round((to.getTime() - from.getTime()) / 86_400_000)
  return diffDays >= 0 && diffDays <= 3
}

function complexityProtection(task: Task): number {
  const complexity = task.difficulty ?? task.complexity ?? 'normal'
  if (complexity === 'extreme') return 90
  if (complexity === 'hard') return 75
  if (complexity === 'unknown') return 60
  if (complexity === 'normal') return 55
  if (complexity === 'manual') return 45
  return 35
}

function mergeCoachHints(args: {
  localCategory: UnderstandingCategory
  localCategoryClear: boolean
  coachResult?: CoachUnderstandingHint
  confidence: number
  reasons: string[]
  usefulApps: string[]
  usefulSites: string[]
  importanceGuess: number
  lifeImpactGuess: number
  protectionNeedGuess: number
}): {
  category: UnderstandingCategory
  confidence: number
  reasons: string[]
  usefulApps: string[]
  usefulSites: string[]
  importanceGuess: number
  lifeImpactGuess: number
  protectionNeedGuess: number
} {
  const coach = args.coachResult
  if (!coach) {
    return {
      category: args.localCategory,
      confidence: args.confidence,
      reasons: args.reasons,
      usefulApps: args.usefulApps,
      usefulSites: args.usefulSites,
      importanceGuess: args.importanceGuess,
      lifeImpactGuess: args.lifeImpactGuess,
      protectionNeedGuess: args.protectionNeedGuess,
    }
  }

  let category = args.localCategory
  let confidence = args.confidence
  const reasons = [...args.reasons]

  if (coach.category) {
    if (args.localCategory === 'unknown' || !args.localCategoryClear) {
      category = coach.category
      confidence += 8
      reasons.push('Coach apporte une catégorie quand le signal local est faible.')
    } else if (coach.category === args.localCategory) {
      confidence += 10
      reasons.push('Coach confirme la catégorie locale.')
    } else {
      confidence -= 15
      reasons.push('Coach et le moteur local ne sont pas totalement d’accord.')
    }
  }

  return {
    category,
    confidence: clampScore(confidence + Math.min(10, Math.round((coach.confidence ?? 0) / 10))),
    reasons: unique([...reasons, ...(coach.reasons ?? [])]),
    usefulApps: unique([...args.usefulApps, ...(coach.usefulAppsGuess ?? [])]),
    usefulSites: unique([...args.usefulSites, ...(coach.usefulSitesGuess ?? [])]),
    importanceGuess: clampScore(Math.max(args.importanceGuess, coach.importanceGuess ?? 0)),
    lifeImpactGuess: clampScore(Math.max(args.lifeImpactGuess, coach.lifeImpactGuess ?? 0)),
    protectionNeedGuess: clampScore(Math.max(args.protectionNeedGuess, coach.protectionNeedGuess ?? 0)),
  }
}

export function buildTaskUnderstandingResult(
  task: Task,
  registry?: RegistryItem[],
  coachResult?: CoachUnderstandingHint,
  history?: UnderstandingHistoryContext,
): UnderstandingResult {
  const targetHistory = historyForTarget('task', task.id, history)
  const text = [task.title, task.description, task.contextNotes, task.linkedObjectiveId ? 'objectif lié' : ''].filter(Boolean).join(' ')
  const localBase = pickLocalCategory(text)
  const correctionCategory = correctedCategory(targetHistory.corrections)
  const local = correctionCategory ? { category: correctionCategory, score: 100, clear: true, reason: 'Une correction utilisateur précise la catégorie.' } : localBase
  const reasons: string[] = []
  if (local.reason) reasons.push(local.reason)
  if (task.linkedObjectiveId) reasons.push('La tâche est liée à un objectif.')
  if (task.blocking?.enabled) reasons.push('La tâche possède déjà une configuration de protection.')
  if (task.description?.trim()) reasons.push('La description détaillée de la tâche affine sa compréhension.')
  if (targetHistory.sessions.length) reasons.push(`${targetHistory.sessions.length} session(s) réelle(s) confirment ce contexte.`)
  if (targetHistory.corrections.length) reasons.push('Les corrections utilisateur sont prioritaires sur les déductions locales.')

  const registryUseful = splitUsefulRegistry(registry, (item) => {
    return (
      item.usefulFor.standaloneTasks.includes(task.id) ||
      (task.linkedObjectiveId ? item.usefulFor.objectives.includes(task.linkedObjectiveId) : false)
    )
  })
  const allowlistUseful = usefulFromAllowlist(task.blocking)
  const usefulApps = unique([...registryUseful.apps, ...allowlistUseful.apps])
  const usefulSites = unique([...registryUseful.sites, ...allowlistUseful.sites])

  if (usefulApps.length > 0 || usefulSites.length > 0) {
    reasons.push('Des apps ou sites utiles sont déjà connus pour ce contexte.')
  }

  const baseByCategory: Record<UnderstandingCategory, number> = {
    school: 70,
    work: 70,
    project: 62,
    health: 65,
    discipline: 60,
    finance: 72,
    personal: 45,
    maintenance: 42,
    unknown: 40,
  }
  let importanceGuess = baseByCategory[local.category]
  importanceGuess += Math.max(0, task.level - 5) * 5
  if (task.deadlineImpact === 'hard') importanceGuess += 10
  if (deadlineSoon(task.deadline)) importanceGuess += 8

  let protectionNeedGuess = complexityProtection(task)
  if (task.blocking?.enabled) protectionNeedGuess += 12
  if (deadlineSoon(task.deadline)) protectionNeedGuess += 8
  if (task.deadlineImpact === 'hard') protectionNeedGuess += 8

  const lifeImpactGuess = clampScore(baseByCategory[local.category] + (task.deadlineImpact === 'hard' ? 8 : 0))
  const confidenceBase = local.category === 'unknown' ? 45 : local.clear ? 68 : 58
  const confidence =
    confidenceBase +
    (task.linkedObjectiveId ? 10 : 0) +
    (usefulApps.length > 0 || usefulSites.length > 0 ? 15 : 0) +
    Math.min(12, targetHistory.sessions.length * 3) +
    (targetHistory.corrections.length ? 12 : 0)

  const merged = mergeCoachHints({
    localCategory: local.category,
    localCategoryClear: local.clear,
    coachResult,
    confidence,
    reasons,
    usefulApps,
    usefulSites,
    importanceGuess: clampScore(importanceGuess),
    lifeImpactGuess,
    protectionNeedGuess: clampScore(protectionNeedGuess),
  })

  return {
    targetType: 'task',
    targetId: task.id,
    category: merged.category,
    importanceGuess: merged.importanceGuess,
    lifeImpactGuess: merged.lifeImpactGuess,
    protectionNeedGuess: merged.protectionNeedGuess,
    usefulAppsGuess: merged.usefulApps,
    usefulSitesGuess: merged.usefulSites,
    confidence: merged.confidence,
    reasons: merged.reasons,
    debug: {
      localCategory: local.category,
      localCategoryClear: local.clear,
      coachProvided: Boolean(coachResult),
      sessionEvidenceCount: targetHistory.sessions.length,
      correctionEvidenceCount: targetHistory.corrections.length,
    },
  }
}

export function buildObjectiveUnderstandingResult(
  objective: Objective,
  tasks: Task[] = [],
  registry?: RegistryItem[],
  coachResult?: CoachUnderstandingHint,
  history?: UnderstandingHistoryContext,
): UnderstandingResult {
  const targetHistory = historyForTarget('objective', objective.id, history)
  const text = [objective.name, objective.description, ...tasks.flatMap((task) => [task.title, task.description, task.contextNotes])].filter(Boolean).join(' ')
  const localBase = pickLocalCategory(text)
  const correctionCategory = correctedCategory(targetHistory.corrections)
  const local = correctionCategory ? { category: correctionCategory, score: 100, clear: true, reason: 'Une correction utilisateur précise la catégorie.' } : localBase
  const reasons: string[] = []
  if (local.reason) reasons.push(local.reason)
  if (tasks.length > 0) reasons.push(`${tasks.length} tâche(s) liée(s) aident à comprendre cet objectif.`)
  if (objective.blocking?.enabled) reasons.push('L’objectif possède déjà une configuration de protection.')
  if (targetHistory.sessions.length) reasons.push(`${targetHistory.sessions.length} session(s) réelle(s) soutiennent cette compréhension.`)
  if (targetHistory.corrections.length) reasons.push('Les corrections utilisateur sont appliquées à la compréhension.')

  const taskIds = new Set(tasks.map((task) => task.id))
  const registryUseful = splitUsefulRegistry(registry, (item) => {
    return (
      item.usefulFor.objectives.includes(objective.id) ||
      item.usefulFor.standaloneTasks.some((taskId) => taskIds.has(taskId))
    )
  })
  const allowlistUseful = usefulFromAllowlist(objective.blocking)
  const usefulApps = unique([...registryUseful.apps, ...allowlistUseful.apps])
  const usefulSites = unique([...registryUseful.sites, ...allowlistUseful.sites])
  if (usefulApps.length > 0 || usefulSites.length > 0) {
    reasons.push('Des outils utiles sont déjà rattachés à l’objectif.')
  }

  const importanceGuess = clampScore(50 + Math.max(0, objective.level - 3) * 12)
  const lifeImpactGuess = clampScore(45 + Math.max(0, objective.level - 3) * 10)
  const protectionNeedGuess = clampScore(
    35 +
      Math.max(0, objective.level - 3) * 10 +
      (objective.blocking?.enabled ? 15 : 0) +
      (tasks.some((task) => (task.difficulty ?? task.complexity) === 'hard' || task.complexity === 'extreme')
        ? 10
        : 0),
  )
  const confidence =
    (local.category === 'unknown' ? 45 : local.clear ? 68 : 58) +
    Math.min(15, tasks.length * 3) +
    (usefulApps.length > 0 || usefulSites.length > 0 ? 15 : 0) +
    Math.min(12, targetHistory.sessions.length * 3) +
    (targetHistory.corrections.length ? 12 : 0)

  const merged = mergeCoachHints({
    localCategory: local.category,
    localCategoryClear: local.clear,
    coachResult,
    confidence,
    reasons,
    usefulApps,
    usefulSites,
    importanceGuess,
    lifeImpactGuess,
    protectionNeedGuess,
  })

  return {
    targetType: 'objective',
    targetId: objective.id,
    category: merged.category,
    importanceGuess: merged.importanceGuess,
    lifeImpactGuess: merged.lifeImpactGuess,
    protectionNeedGuess: merged.protectionNeedGuess,
    usefulAppsGuess: merged.usefulApps,
    usefulSitesGuess: merged.usefulSites,
    confidence: merged.confidence,
    reasons: merged.reasons,
    debug: {
      localCategory: local.category,
      localCategoryClear: local.clear,
      coachProvided: Boolean(coachResult),
      linkedTaskCount: tasks.length,
      sessionEvidenceCount: targetHistory.sessions.length,
      correctionEvidenceCount: targetHistory.corrections.length,
    },
  }
}
