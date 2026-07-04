import type {
  CompletionClaim,
  CompletionContract,
  CompletionGateDecision,
  CompletionGateResult,
  CompletionSessionEvidence,
  CompletionVerificationStatus,
  WorkEvidence,
  WorkPenalty,
} from '@shared/completion-gate'
import { COMPLETION_GATE_VERSION } from '@shared/completion-gate'
import type { Objective, Task } from '@shared/schemas'
import type { UserBehaviorEvent, UserModel } from '@shared/user-model'
import { estimateMinutesForLevel } from './free-time-calculator'

export type BuildCompletionGateInput = {
  task: Task
  objective?: Objective | null
  objectiveImportanceScore?: number
  contract?: CompletionContract | null
  claim?: CompletionClaim | null
  session?: CompletionSessionEvidence | null
  userModel?: UserModel | null
  settings?: any
  now?: Date
}

const VAGUE_COMPLETION_WORDS = new Set([
  'fini',
  'terminé',
  'termine',
  'fait',
  'done',
  'ok',
  'oui',
  'yes',
  'completed',
])

const LOW_INFORMATION_WORDS = new Set([
  'je',
  'j',
  'ai',
  'le',
  'la',
  'les',
  'un',
  'une',
  'des',
  'du',
  'de',
  'et',
  'en',
  'a',
  'au',
  'aux',
  'pour',
  'dans',
  'sur',
  'avec',
  'ce',
  'cette',
  'ça',
  'ca',
])

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function safeInt(value: number | undefined, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(0, Math.round(value!))
}

function taskComplexity(task: Task): NonNullable<Task['complexity']> {
  return task.difficulty ?? task.complexity ?? 'normal'
}

function taskMinutes(task: Task): { estimated: number; remaining: number } {
  const estimatedBase = task.estimatedMinutes ?? estimateMinutesForLevel(task.level)
  const remaining = task.status === 'completed' ? 0 : Math.max(0, task.remainingMinutes ?? estimatedBase)
  return {
    estimated: Math.max(estimatedBase, remaining),
    remaining,
  }
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
}

function words(value: string): string[] {
  return normalizeText(value)
    .split(/[^a-z0-9]+/iu)
    .map((word) => word.trim())
    .filter((word) => word.length > 0)
}

function meaningfulWords(value: string): string[] {
  return words(value).filter((word) => word.length >= 3 && !LOW_INFORMATION_WORDS.has(word))
}

function isVagueCompletionSummary(summary: string | undefined): boolean {
  const usefulWords = meaningfulWords(summary ?? '')
  if (usefulWords.length === 0) return true
  if (usefulWords.length > 3) return false
  return usefulWords.every((word) => VAGUE_COMPLETION_WORDS.has(word))
}

function completionSpecificityScore(summary: string | undefined): number {
  const text = summary?.trim() ?? ''
  if (text.length === 0) return 0
  const usefulWords = meaningfulWords(text)
  const numberCount = (text.match(/\d+/gu) ?? []).length
  const separatorCount = (text.match(/[,;:]/gu) ?? []).length
  const actionSignals = [
    'corrige',
    'corrigé',
    'corrigee',
    'ajoute',
    'ajouté',
    'cree',
    'créé',
    'redige',
    'rédigé',
    'resume',
    'résumé',
    'envoye',
    'envoyé',
    'termine',
    'terminé',
    'teste',
    'testé',
    'revise',
    'révisé',
    'exercice',
    'chapitre',
    'section',
  ].filter((signal) => normalizeText(text).includes(normalizeText(signal))).length
  let score = 10 + Math.min(45, usefulWords.length * 6) + Math.min(20, numberCount * 8) + Math.min(10, separatorCount * 4)
  score += Math.min(20, actionSignals * 6)
  if (isVagueCompletionSummary(text)) score -= 35
  return clampScore(score)
}

function criteriaMatchScore(contract: CompletionContract | null | undefined, summary: string | undefined): number {
  const criteria = contract?.acceptanceCriteria.filter((criterion) => criterion.trim().length > 0) ?? []
  const text = normalizeText(summary ?? '')
  if (criteria.length === 0) {
    return clampScore(completionSpecificityScore(summary) * 0.7)
  }
  if (!summary?.trim()) return 0

  const scores = criteria.map((criterion) => {
    const criterionText = normalizeText(criterion)
    if (criterionText.length > 0 && text.includes(criterionText)) return 100
    const criterionWords = meaningfulWords(criterion)
    if (criterionWords.length === 0) return 0
    const hits = criterionWords.filter((word) => text.includes(word)).length
    return clampScore((hits / criterionWords.length) * 100)
  })
  return clampScore(scores.reduce((sum, score) => sum + score, 0) / Math.max(1, scores.length))
}

function sessionIntegrityScore(session: CompletionSessionEvidence | null | undefined): number {
  if (!session) return 50
  const duration = Math.max(1, session.durationMinutes)
  const useful = session.usefulActivityMinutes ?? session.allowedActivityMinutes ?? (session.endedNormally ? duration * 0.55 : 0)
  const usefulRatio = Math.max(0, Math.min(1, useful / duration))
  const idleRatio = Math.max(0, Math.min(1, safeInt(session.idleMinutes) / duration))
  let score = 30 + usefulRatio * 50
  if (session.endedNormally) score += 12
  if (session.strictMode) score += 4
  if (session.earlyStop) score -= 25
  score -= idleRatio * 25
  score -= safeInt(session.unlockRequests) * 8
  score -= safeInt(session.distractingAttempts) * 7
  score -= safeInt(session.blockedAppAttempts) * 5
  score -= safeInt(session.blockedSiteAttempts) * 5
  if (usefulRatio < 0.2) score -= 15
  return clampScore(score)
}

function requiredEvidenceScore(args: {
  task: Task
  objective?: Objective | null
  objectiveImportanceScore?: number
  contract?: CompletionContract | null
  session?: CompletionSessionEvidence | null
}): number {
  if (args.contract?.requiredEvidenceScoreOverride !== undefined) {
    return clampScore(args.contract.requiredEvidenceScoreOverride)
  }

  const complexity = taskComplexity(args.task)
  let score = 60
  if (complexity === 'easy') score = 40
  else if (complexity === 'normal' || complexity === 'manual') score = 60
  else if (complexity === 'hard' || complexity === 'unknown') score = 75
  else if (complexity === 'extreme') score = 90

  if ((args.objective?.level ?? 0) >= 6 || (args.objectiveImportanceScore ?? 0) >= 80) score += 8
  if (args.task.deadlineImpact === 'hard') score += 5
  if (args.session?.strictMode) score += 7
  return clampScore(Math.min(95, score))
}

function eventsWithin(events: UserBehaviorEvent[] | undefined, now: Date, days: number): UserBehaviorEvent[] {
  return (events ?? []).filter((event) => {
    const date = new Date(event.createdAt)
    if (Number.isNaN(date.getTime())) return false
    const diff = now.getTime() - date.getTime()
    return diff >= 0 && diff <= days * 86_400_000
  })
}

function userTrustWeight(args: {
  task: Task
  session?: CompletionSessionEvidence | null
  userModel?: UserModel | null
  now: Date
}): number {
  let score = args.session?.strictMode ? 25 : args.session ? 45 : 65
  const events = eventsWithin(args.userModel?.behaviorEvents, args.now, 30).filter((event) => {
    return event.targetId === args.task.id || event.context?.taskId === args.task.id
  })
  const positive = events.filter((event) =>
    ['task_completed', 'session_completed', 'recommendation_accepted'].includes(event.type),
  ).length
  const negative = events.filter((event) =>
    ['task_skipped', 'session_aborted', 'recommendation_rejected', 'unlock_requested'].includes(event.type),
  ).length
  score += Math.min(18, positive * 4)
  score -= Math.min(28, negative * 7)
  return clampScore(Math.max(10, Math.min(80, score)))
}

function suspiciousBehaviorScore(args: {
  task: Task
  claim?: CompletionClaim | null
  session?: CompletionSessionEvidence | null
}): number {
  const session = args.session
  const claim = args.claim
  const taskTime = taskMinutes(args.task)
  const duration = session?.durationMinutes ?? 0
  const useful = session?.usefulActivityMinutes ?? session?.allowedActivityMinutes ?? 0
  const usefulRatio = duration > 0 ? useful / duration : 0
  let score = 0
  score += safeInt(session?.unlockRequests) * 15
  score += safeInt(session?.distractingAttempts) * 12
  score += safeInt(session?.blockedAppAttempts) * 8
  score += safeInt(session?.blockedSiteAttempts) * 8
  score += session?.earlyStop ? 25 : 0
  score += duration > 0 ? Math.min(25, (safeInt(session?.idleMinutes) / duration) * 30) : 0
  if (claim?.userClaimedCompleted && isVagueCompletionSummary(claim.summary)) score += 22
  if (claim?.userClaimedCompleted && duration > 0 && duration < taskTime.estimated * 0.2) score += 18
  if (duration > 0 && usefulRatio < 0.15) score += 18
  return clampScore(score)
}

function evidenceScore(args: {
  sessionIntegrity: number
  specificity: number
  criteria: number
  trust: number
  suspicious: number
}): number {
  return clampScore(
    0.35 * args.sessionIntegrity +
      0.25 * args.criteria +
      0.2 * args.specificity +
      0.2 * args.trust -
      0.15 * args.suspicious,
  )
}

function finalConfidence(args: {
  sessionIntegrity: number
  specificity: number
  criteria: number
  trust: number
  suspicious: number
}): number {
  return clampScore(
    0.35 * args.sessionIntegrity +
      0.3 * args.criteria +
      0.2 * args.specificity +
      0.15 * args.trust -
      0.25 * args.suspicious,
  )
}

function verifiedProgressMinutes(args: {
  task: Task
  session?: CompletionSessionEvidence | null
  evidenceScore: number
  suspicious: number
  decision: CompletionGateDecision
}): number {
  if (!args.session) return 0
  if (args.decision === 'reject_completion' && args.evidenceScore < 25) return 0
  const focusIntegrityFactor = Math.max(0, (100 - args.suspicious) / 100)
  const evidenceFactor = args.evidenceScore / 100
  const raw = args.session.durationMinutes * evidenceFactor * focusIntegrityFactor
  return Math.max(0, Math.min(taskMinutes(args.task).remaining, Math.round(raw)))
}

function decide(args: {
  claim?: CompletionClaim | null
  finalConfidence: number
  requiredEvidence: number
  sessionIntegrity: number
}): { decision: CompletionGateDecision; status: CompletionVerificationStatus; verifiedCompleted: boolean } {
  const claimedCompleted = Boolean(args.claim?.userClaimedCompleted)
  if (!claimedCompleted) {
    if (args.claim?.progressClaim === 'none') {
      return { decision: 'accept_partial_progress', status: 'not_requested', verifiedCompleted: false }
    }
    if (args.finalConfidence >= 65 || args.sessionIntegrity >= 70) {
      return { decision: 'accept_progress', status: 'partial_progress', verifiedCompleted: false }
    }
    return { decision: 'accept_partial_progress', status: 'partial_progress', verifiedCompleted: false }
  }

  if (args.finalConfidence >= args.requiredEvidence) {
    return { decision: 'accept_completion', status: 'verified', verifiedCompleted: true }
  }
  if (args.finalConfidence >= args.requiredEvidence - 10) {
    return { decision: 'require_review', status: 'manual_review_required', verifiedCompleted: false }
  }
  if (args.finalConfidence >= Math.max(45, args.requiredEvidence * 0.6)) {
    return { decision: 'accept_partial_progress', status: 'partial_progress', verifiedCompleted: false }
  }
  return {
    decision: 'reject_completion',
    status: 'rejected_insufficient_evidence',
    verifiedCompleted: false,
  }
}

function buildEvidence(args: {
  sessionIntegrity: number
  specificity: number
  criteria: number
  trust: number
  contract?: CompletionContract | null
  session?: CompletionSessionEvidence | null
  claim?: CompletionClaim | null
}): WorkEvidence[] {
  const evidence: WorkEvidence[] = [
    {
      kind: 'session_integrity',
      label: 'Intégrité de session mesurée sans lire le contenu privé.',
      score: args.sessionIntegrity,
      source: 'session',
    },
    {
      kind: 'specific_completion_summary',
      label: 'Spécificité de la réponse de clôture.',
      score: args.specificity,
      source: 'user_claim',
    },
    {
      kind: 'criteria_match',
      label: 'Correspondance avec le contrat de fin attendu.',
      score: args.criteria,
      source: args.contract ? 'contract' : 'heuristic_engine',
    },
    {
      kind: 'user_history',
      label: 'Poids de confiance accordé à la déclaration utilisateur dans ce contexte.',
      score: args.trust,
      source: 'user_model',
    },
  ]
  if (args.contract) {
    evidence.push({
      kind: 'completion_contract',
      label: 'Un résultat attendu existe avant la validation.',
      score: args.contract.acceptanceCriteria.length > 0 ? 80 : 50,
      source: 'contract',
    })
  }
  if (args.session?.usefulActivityMinutes !== undefined || args.session?.allowedActivityMinutes !== undefined) {
    evidence.push({
      kind: 'useful_activity',
      label: 'Activité utile ou autorisée détectée pendant la session.',
      score: args.sessionIntegrity,
      source: 'session',
    })
  }
  return evidence
}

function buildPenalties(args: {
  task: Task
  claim?: CompletionClaim | null
  session?: CompletionSessionEvidence | null
}): WorkPenalty[] {
  const penalties: WorkPenalty[] = []
  if (args.claim?.userClaimedCompleted && isVagueCompletionSummary(args.claim.summary)) {
    penalties.push({
      kind: 'vague_claim',
      label: 'La demande de complétion est trop vague.',
      score: 22,
      source: 'user_claim',
    })
  }
  if (args.session?.earlyStop) {
    penalties.push({
      kind: 'early_stop',
      label: 'La session semble arrêtée trop tôt.',
      score: 25,
      source: 'session',
    })
  }
  const unlockRequests = safeInt(args.session?.unlockRequests)
  if (unlockRequests > 0) {
    penalties.push({
      kind: 'unlock_request',
      label: `${unlockRequests} demande(s) de déverrouillage pendant la session.`,
      score: clampScore(unlockRequests * 15),
      source: 'session',
    })
  }
  const distractions =
    safeInt(args.session?.distractingAttempts) +
    safeInt(args.session?.blockedAppAttempts) +
    safeInt(args.session?.blockedSiteAttempts)
  if (distractions > 0) {
    penalties.push({
      kind: 'distraction_attempt',
      label: `${distractions} tentative(s) de distraction ou de contournement détectée(s).`,
      score: clampScore(distractions * 10),
      source: 'session',
    })
  }
  const duration = args.session?.durationMinutes ?? 0
  const useful = args.session?.usefulActivityMinutes ?? args.session?.allowedActivityMinutes ?? 0
  if (duration > 0 && useful / duration < 0.15) {
    penalties.push({
      kind: 'low_useful_activity',
      label: 'L’activité utile est trop faible par rapport à la durée de session.',
      score: 18,
      source: 'session',
    })
  }
  if (args.claim?.userClaimedCompleted && duration > 0 && duration < taskMinutes(args.task).estimated * 0.2) {
    penalties.push({
      kind: 'too_fast_for_task',
      label: 'La complétion arrive très vite par rapport au temps estimé.',
      score: 18,
      source: 'heuristic_engine',
    })
  }
  return penalties
}

function reasonsForDecision(result: {
  decision: CompletionGateDecision
  finalConfidence: number
  requiredEvidence: number
  sessionIntegrity: number
  specificity: number
  criteria: number
  suspicious: number
}): { reasons: string[]; warnings: string[] } {
  const reasons: string[] = []
  const warnings: string[] = []
  if (result.decision === 'accept_completion') {
    reasons.push('Les preuves sont suffisantes pour accepter la complétion.')
  } else if (result.decision === 'reject_completion') {
    reasons.push('Les preuves ne suffisent pas pour valider cette tâche comme terminée.')
  } else if (result.decision === 'require_review') {
    reasons.push('Les preuves sont proches du seuil, mais une revue reste nécessaire.')
  } else {
    reasons.push('Vethos peut créditer du progrès sans valider la tâche comme terminée.')
  }
  if (result.sessionIntegrity >= 70) reasons.push('La session semble sérieuse.')
  if (result.specificity >= 65) reasons.push('La réponse de clôture est assez spécifique.')
  if (result.criteria >= 65) reasons.push('La réponse correspond bien au résultat attendu.')
  if (result.finalConfidence < result.requiredEvidence) {
    warnings.push('La confiance finale reste sous le niveau de preuve requis.')
  }
  if (result.suspicious >= 45) {
    warnings.push('La session contient des signaux faibles ou suspects.')
  }
  return { reasons, warnings }
}

export function buildCompletionGateResult(input: BuildCompletionGateInput): CompletionGateResult {
  const now = input.now ?? new Date()
  const claim = input.claim ?? { userClaimedCompleted: false, progressClaim: 'none' as const }
  const sessionIntegrity = sessionIntegrityScore(input.session)
  const specificity = completionSpecificityScore(claim.summary)
  const criteria = criteriaMatchScore(input.contract, claim.summary)
  const trust = userTrustWeight({
    task: input.task,
    session: input.session,
    userModel: input.userModel,
    now,
  })
  const requiredEvidence = requiredEvidenceScore({
    task: input.task,
    objective: input.objective,
    objectiveImportanceScore: input.objectiveImportanceScore,
    contract: input.contract,
    session: input.session,
  })
  const suspicious = suspiciousBehaviorScore({
    task: input.task,
    claim,
    session: input.session,
  })
  const evidence = evidenceScore({
    sessionIntegrity,
    specificity,
    criteria,
    trust,
    suspicious,
  })
  const confidence = finalConfidence({
    sessionIntegrity,
    specificity,
    criteria,
    trust,
    suspicious,
  })
  const decision = decide({
    claim,
    finalConfidence: confidence,
    requiredEvidence,
    sessionIntegrity,
  })
  const progressMinutes = verifiedProgressMinutes({
    task: input.task,
    session: input.session,
    evidenceScore: evidence,
    suspicious,
    decision: decision.decision,
  })
  const explanation = reasonsForDecision({
    decision: decision.decision,
    finalConfidence: confidence,
    requiredEvidence,
    sessionIntegrity,
    specificity,
    criteria,
    suspicious,
  })

  return {
    taskId: input.task.id,
    sessionId: input.session?.sessionId,
    userClaimedCompleted: claim.userClaimedCompleted,
    verifiedCompleted: decision.verifiedCompleted,
    verificationStatus: decision.status,
    decision: decision.decision,
    evidenceScore: evidence,
    userTrustWeight: trust,
    requiredEvidenceScore: requiredEvidence,
    sessionIntegrityScore: sessionIntegrity,
    completionSpecificityScore: specificity,
    criteriaMatchScore: criteria,
    suspiciousBehaviorScore: suspicious,
    integrityRiskScore: clampScore(100 - sessionIntegrity + suspicious * 0.4),
    finalConfidence: confidence,
    verifiedProgressMinutes: progressMinutes,
    evidence: buildEvidence({
      sessionIntegrity,
      specificity,
      criteria,
      trust,
      contract: input.contract,
      session: input.session,
      claim,
    }),
    penalties: buildPenalties({
      task: input.task,
      claim,
      session: input.session,
    }),
    reasons: explanation.reasons,
    warnings: explanation.warnings,
    lastClaimedAt: claim.userClaimedCompleted ? claim.claimedAt ?? now.toISOString() : undefined,
    verifiedAt: decision.verifiedCompleted ? now.toISOString() : undefined,
    metadata: {
      version: COMPLETION_GATE_VERSION,
      advisoryOnly: input.settings?.engineV2Completion !== true,
      generatedAt: now.toISOString(),
      source: 'completion_gate_engine',
      debug: {
        currentTaskStatusStillControlsPersistence: input.settings?.engineV2Completion !== true,
        currentRemainingMinutesStillControlsRealProgress: input.settings?.engineV2Completion !== true,
        contentInspectionEnabled: false,
        fileReadingEnabled: false,
        screenshotReadingEnabled: false,
        pdfReadingEnabled: false,
        claimIsSignalNotTruth: true,
      },
    },
  }
}
