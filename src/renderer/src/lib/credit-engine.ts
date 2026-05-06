import type {
  BlockingHistoryEntry,
  DeclaredApp,
  FreeTimeEntry,
  Objective,
  TimeRule,
} from '@shared/schemas'

export type CreditInputs = {
  /** Historique de blocage. Tri ASC par endedAt recommandé. */
  history: BlockingHistoryEntry[]
  rules: TimeRule[]
  objectives: Objective[]
  lastProcessedSessionId: string | null
  /** Ratio minutes free time / minutes XP. Défaut 0.5. */
  freeTimeRatio?: number
}

export type CreditOutputs = {
  /** Map objectiveId → minutes XP à ajouter */
  objectiveDeltas: Map<string, number>
  /** Total minutes free time à ajouter (positif) */
  freeTimeDelta: number
  /** Log à appender à la banque */
  freeTimeEntries: FreeTimeEntry[]
  /** Dernier sessionId effectivement traité (à persister comme curseur) */
  newCursorSessionId: string | null
}

/**
 * UUID v4 random. Sans dépendance crypto pour rester pur côté renderer.
 * Format respecte le regex z.string().uuid().
 */
function genUuid(): string {
  const hex = '0123456789abcdef'
  const r = (n: number): string => {
    let s = ''
    for (let i = 0; i < n; i++) s += hex[Math.floor(Math.random() * 16)]
    return s
  }
  // Format 8-4-4-4-12 avec version 4 et variant 8/9/a/b
  const variant = hex[8 + Math.floor(Math.random() * 4)]!
  return `${r(8)}-${r(4)}-4${r(3)}-${variant}${r(3)}-${r(12)}`
}

function durationMinutes(entry: BlockingHistoryEntry): number {
  const start = new Date(entry.startedAt).getTime()
  const end = new Date(entry.endedAt).getTime()
  return Math.max(0, Math.round((end - start) / 60000))
}

/**
 * Calcule les crédits XP + free time depuis l'historique de blocage.
 *
 * Garanties :
 * - Idempotent via le curseur `lastProcessedSessionId`.
 * - Une session non terminée normalement avance le curseur mais ne crédite rien.
 * - Une session liée à N objectifs : XP réparti à parts égales (duration/N par objectif),
 *   free time crédité une seule fois (duration * ratio).
 * - Le curseur avance même pour les sessions sans match d'objectif (évite les rescans inutiles).
 */
export function computeCredits(inputs: CreditInputs): CreditOutputs {
  const ratio = inputs.freeTimeRatio ?? 0.5
  const objectiveDeltas = new Map<string, number>()
  const freeTimeEntries: FreeTimeEntry[] = []
  let freeTimeDelta = 0
  let newCursorSessionId: string | null = inputs.lastProcessedSessionId

  // Avancer après le dernier sessionId traité
  let startIndex = 0
  if (inputs.lastProcessedSessionId !== null) {
    const idx = inputs.history.findIndex(
      (h) => h.sessionId === inputs.lastProcessedSessionId,
    )
    startIndex = idx >= 0 ? idx + 1 : 0
  }

  // Index : profileId → ruleIds
  const rulesByProfile = new Map<string, string[]>()
  for (const r of inputs.rules) {
    if (r.linkedProfileId === null) continue
    const list = rulesByProfile.get(r.linkedProfileId) ?? []
    list.push(r.id)
    rulesByProfile.set(r.linkedProfileId, list)
  }

  for (let i = startIndex; i < inputs.history.length; i++) {
    const entry = inputs.history[i]!
    newCursorSessionId = entry.sessionId

    if (!entry.completedNormally) continue

    const ruleIds = rulesByProfile.get(entry.profileId) ?? []
    if (ruleIds.length === 0) continue

    const matchingObjectives = inputs.objectives.filter((o) =>
      o.linkedRuleIds.some((rid) => ruleIds.includes(rid)),
    )
    if (matchingObjectives.length === 0) continue

    const duration = durationMinutes(entry)
    if (duration <= 0) continue

    const xpPerObjective = duration / matchingObjectives.length
    for (const obj of matchingObjectives) {
      const prev = objectiveDeltas.get(obj.id) ?? 0
      objectiveDeltas.set(obj.id, prev + xpPerObjective)
    }

    const freeTimeForSession = Math.round(duration * ratio)
    if (freeTimeForSession > 0) {
      freeTimeDelta += freeTimeForSession
      freeTimeEntries.push({
        id: genUuid(),
        at: entry.endedAt,
        deltaMinutes: freeTimeForSession,
        reason: `Session focus terminée (${duration} min)`,
      })
    }
  }

  return {
    objectiveDeltas,
    freeTimeDelta,
    freeTimeEntries,
    newCursorSessionId,
  }
}

// ─── Crédit depuis l'usage des apps déclarées (sous-projet 6) ──────────────

export type AppUsageCreditInputs = {
  /** Une entrée par app à traiter, avec ses minutes par jour. */
  apps: Array<{
    app: DeclaredApp
    /** Map date YYYY-MM-DD → minutes accumulées ce jour-là. */
    minutesByDay: Map<string, number>
    /** Cursor : dernière date déjà créditée pour cette app. */
    lastProcessedDate: string | null
  }>
}

export type AppUsageCreditOutputs = {
  objectiveDeltas: Map<string, number>
  freeTimeDelta: number
  freeTimeEntries: FreeTimeEntry[]
  /** Nouveau cursor par appId. */
  newCursorByApp: Map<string, string>
}

/**
 * Crédit XP / free time pour les apps déclarées.
 *
 * Pour chaque app :
 * - Considère seulement les jours strictement > lastProcessedDate
 * - Ignore le jour courant (incomplet) — la date d'aujourd'hui n'est pas créditée tant qu'elle n'est pas révolue
 * - Multiplie minutes × xpRatio
 * - Si app liée à un objectif : crédite l'objectif
 * - Sinon : crédite le free time
 * - Avance le cursor à la dernière date traitée (jour révolu le plus récent)
 *
 * Idempotent : appel multiple = même résultat tant que minutesByDay n'évolue pas.
 */
export function computeCreditsFromAppUsage(
  inputs: AppUsageCreditInputs,
  options: { today?: string } = {},
): AppUsageCreditOutputs {
  const today = options.today ?? localDateToday()
  const objectiveDeltas = new Map<string, number>()
  const freeTimeEntries: FreeTimeEntry[] = []
  const newCursorByApp = new Map<string, string>()
  let freeTimeDelta = 0

  for (const { app, minutesByDay, lastProcessedDate } of inputs.apps) {
    // Ne traite que les jours révolus (< today) et > cursor
    const datesToProcess = [...minutesByDay.keys()]
      .filter((d) => d < today)
      .filter((d) => lastProcessedDate === null || d > lastProcessedDate)
      .sort()

    if (datesToProcess.length === 0) continue

    let lastSeen: string | null = null
    for (const date of datesToProcess) {
      const minutes = minutesByDay.get(date) ?? 0
      lastSeen = date
      const xpMinutes = Math.round(minutes * app.xpRatio)
      if (xpMinutes <= 0) continue

      if (app.linkedObjectiveId) {
        const prev = objectiveDeltas.get(app.linkedObjectiveId) ?? 0
        objectiveDeltas.set(app.linkedObjectiveId, prev + xpMinutes)
      } else {
        freeTimeDelta += xpMinutes
        freeTimeEntries.push({
          id: genUuid(),
          at: new Date(`${date}T23:59:59.000Z`).toISOString(),
          deltaMinutes: xpMinutes,
          reason: `Usage déclaré : ${app.name} (${minutes} min)`,
        })
      }
    }

    if (lastSeen) newCursorByApp.set(app.id, lastSeen)
  }

  return {
    objectiveDeltas,
    freeTimeDelta,
    freeTimeEntries,
    newCursorByApp,
  }
}

function localDateToday(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
