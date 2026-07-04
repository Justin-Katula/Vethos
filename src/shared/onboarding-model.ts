export type OnboardingPainPoint =
  | 'postpones_important'
  | 'starts_then_drifts'
  | 'unclear_first_action'
  | 'no_structure'
  | 'loses_best_hours'
  | 'objectives_stagnate'

export type OnboardingWeaknessPattern =
  | 'morning_start'
  | 'after_school_work'
  | 'evening'
  | 'hard_task'
  | 'tired'
  | 'no_deadline'
  | 'deadline_too_close'

export type OnboardingProtectionStyle = 'calm' | 'firm' | 'strict'

export type OnboardingLifeArea =
  | 'studies'
  | 'work'
  | 'personal_project'
  | 'discipline'
  | 'health'
  | 'money'
  | 'future'

export type OnboardingScheduleAnchorKind =
  | 'school'
  | 'work'
  | 'sleep'
  | 'sport'
  | 'transport_preparation'
  | 'other_obligation'
  | 'deep_work'

export type OnboardingDeepWorkWindow = 'morning' | 'afternoon' | 'evening' | 'unknown'

export type OnboardingDistractionKind =
  | 'video_platforms'
  | 'social_networks'
  | 'games'
  | 'instant_messaging'
  | 'aimless_browsing'
  | 'music_entertainment'
  | 'other'

export type OnboardingScheduleAnchor = {
  kind: OnboardingScheduleAnchorKind
  label?: string
  days?: number[]
  startTime?: string
  endTime?: string
}

export type OnboardingSleepCommitment = {
  sleepAt: string
  wakeAt: string
  treatedAsCommitment: true
}

export type OnboardingFirstObjective = {
  statement: string
  importance: 'important' | 'very_important' | 'central'
  lifeArea?: OnboardingLifeArea
  whyItMatters?: string
}

export type OnboardingDistractionProfile = {
  timeThieves: OnboardingDistractionKind[]
  customDistraction?: string
  scanLocalAppsLater: boolean
}

export type OnboardingInput = {
  painPoints?: OnboardingPainPoint[]
  protectedLifeAreas?: OnboardingLifeArea[]
  firstObjective: OnboardingFirstObjective
  weaknessPatterns?: OnboardingWeaknessPattern[]
  distractionProfile?: Partial<OnboardingDistractionProfile>
  scheduleAnchors?: OnboardingScheduleAnchor[]
  sleepCommitment?: Partial<OnboardingSleepCommitment>
  deepWorkWindow?: OnboardingDeepWorkWindow
  protectionStyle?: OnboardingProtectionStyle
  createdAt?: string
}

export type OnboardingResult = {
  version: 1
  createdAt: string
  positioning: 'protected_personal_discipline'
  painPoints: OnboardingPainPoint[]
  protectedLifeAreas: OnboardingLifeArea[]
  firstObjective: OnboardingFirstObjective
  weaknessPatterns: OnboardingWeaknessPattern[]
  distractionProfile: OnboardingDistractionProfile
  scheduleAnchors: OnboardingScheduleAnchor[]
  sleepCommitment: OnboardingSleepCommitment
  deepWorkWindow: OnboardingDeepWorkWindow
  protectionStyle: OnboardingProtectionStyle
  commitmentSentence: string
}

export type InitialUserModelFromOnboarding = {
  version: 1
  disciplineContract: {
    coreSentence: string
    protectedDecision: string
    protectionStyle: OnboardingProtectionStyle
  }
  commitments: {
    primaryDirection: OnboardingFirstObjective
    sleep: OnboardingSleepCommitment
    deepWorkWindow: OnboardingDeepWorkWindow
    scheduleAnchors: OnboardingScheduleAnchor[]
  }
  riskProfile: {
    painPoints: OnboardingPainPoint[]
    weaknessPatterns: OnboardingWeaknessPattern[]
    distractions: OnboardingDistractionProfile
  }
}

export type OnboardingDiagnosis = {
  title: string
  primaryRisk: string
  messages: string[]
  recommendedProtectionStyle: OnboardingProtectionStyle
  reasonTags: string[]
}

export type OnboardingFirstPlanPreview = {
  protectedObjective: string
  nextAction: string
  firstBlock: {
    label: string
    startLabel: string
    durationMinutes: number
  }
  protection: string
  why: string[]
  confidence: number
}

export type FirstSystemPreviewContext = {
  firstAvailableBlock?: {
    startLabel: string
    durationMinutes: number
  }
}

export type OnboardingScreenDefinition = {
  id: string
  act: 1 | 2 | 3
  title: string
  subtitle?: string
  cta?: string
}

export const VETHOS_ONBOARDING_FLOW: OnboardingScreenDefinition[] = [
  {
    id: 'protect-time',
    act: 1,
    title: 'Ton temps a besoin d’être protégé.',
    subtitle:
      'Vethos ne te donne pas juste une liste de tâches. Il décide quoi faire, quand le faire, et bloque ce qui essaie de te détourner.',
    cta: 'Construire mon système',
  },
  {
    id: 'not-willpower',
    act: 1,
    title: 'Ce n’est pas juste un manque de volonté.',
    subtitle:
      'Le problème, c’est de devoir prendre les bonnes décisions au pire moment : quand tu es fatigué, distrait, pressé ou déjà en retard.',
  },
  {
    id: 'small-delays',
    act: 1,
    title: 'Tes objectifs ne meurent pas d’un coup.',
    subtitle:
      'Ils meurent par petits reports. Un soir perdu. Une tâche repoussée. Une session sans protection.',
  },
  {
    id: 'protected-blocks',
    act: 1,
    title: 'Vethos transforme ton temps libre en blocs protégés.',
    subtitle:
      'Objectifs → tâches → planning → session → blocage. Tu choisis la direction. Vethos protège l’exécution.',
  },
  {
    id: 'defend-life-area',
    act: 2,
    title: 'Qu’est-ce que tu refuses de laisser mourir ?',
    subtitle: 'Vethos commencera par protéger cette direction.',
  },
  {
    id: 'first-mission',
    act: 2,
    title: 'Donne à Vethos une mission.',
    subtitle: 'Si Vethos ne protège qu’une seule chose au début, ce sera celle-là.',
  },
  {
    id: 'sleep-commitment',
    act: 2,
    title: 'Quelle heure de sommeil veux-tu défendre ?',
    subtitle: 'Pas ton horaire actuel. L’horaire que tu veux imposer.',
  },
  {
    id: 'deep-work',
    act: 2,
    title: 'Quel moment veux-tu défendre pour ton travail le plus important ?',
    subtitle: 'Vethos protégera ce moment contre les décisions faibles.',
  },
  {
    id: 'time-thieves',
    act: 2,
    title: 'Qu’est-ce qui te vole ton contrôle ?',
    subtitle:
      'Pendant les sessions, Vethos gardera ce qui aide et bloquera ce qui détourne.',
  },
  {
    id: 'resistance-level',
    act: 2,
    title: 'Quand tu veux abandonner ton plan, Vethos doit-il te laisser passer ?',
    subtitle: 'Par défaut, Vethos demande une justification et protège la session.',
  },
  {
    id: 'first-risk',
    act: 3,
    title: 'Vethos a trouvé ton premier risque.',
  },
  {
    id: 'first-system',
    act: 3,
    title: 'Ton premier système est prêt.',
    cta: 'Activer mon système',
  },
  {
    id: 'lucid-decision',
    act: 3,
    title: 'Pendant une session, ton objectif passe avant tes impulsions.',
    subtitle:
      'Tu peux corriger Vethos. Mais quand une session commence, il protège la décision que tu as prise avant d’être distrait.',
    cta: 'Entrer dans Vethos',
  },
]

const DEFAULT_SLEEP_COMMITMENT: OnboardingSleepCommitment = {
  sleepAt: '23:00',
  wakeAt: '07:00',
  treatedAsCommitment: true,
}

function nowIso(): string {
  return new Date().toISOString()
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values))
}

function cleanText(value: string | undefined, fallback: string): string {
  const cleaned = value?.trim()
  return cleaned && cleaned.length > 0 ? cleaned : fallback
}

function normalizeClockTime(value: string | undefined, fallback: string): string {
  if (!value) return fallback
  const match = /^(\d{1,2}):(\d{2})$/u.exec(value.trim())
  if (!match) return fallback
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return fallback
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return fallback
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function protectionSentence(style: OnboardingProtectionStyle): string {
  if (style === 'strict') return 'Vethos refusera les excuses faibles et défendra ton engagement.'
  if (style === 'calm') return 'Vethos te rappellera ton objectif tout en laissant plus de liberté.'
  return 'Vethos demandera une justification et protégera la session.'
}

function importanceBoost(importance: OnboardingFirstObjective['importance']): number {
  if (importance === 'central') return 25
  if (importance === 'very_important') return 15
  return 5
}

function objectiveLabel(result: OnboardingResult): string {
  return cleanText(result.firstObjective.statement, 'Protéger mon objectif principal')
}

export function buildOnboardingResult(input: OnboardingInput): OnboardingResult {
  const protectionStyle = input.protectionStyle ?? 'firm'
  const protectedLifeAreas = unique(
    input.protectedLifeAreas?.length
      ? input.protectedLifeAreas
      : input.firstObjective.lifeArea
        ? [input.firstObjective.lifeArea]
        : (['future'] satisfies OnboardingLifeArea[]),
  )
  const sleepCommitment: OnboardingSleepCommitment = {
    sleepAt: normalizeClockTime(input.sleepCommitment?.sleepAt, DEFAULT_SLEEP_COMMITMENT.sleepAt),
    wakeAt: normalizeClockTime(input.sleepCommitment?.wakeAt, DEFAULT_SLEEP_COMMITMENT.wakeAt),
    treatedAsCommitment: true,
  }
  const firstObjective: OnboardingFirstObjective = {
    ...input.firstObjective,
    statement: cleanText(input.firstObjective.statement, 'reprendre le contrôle de mon temps'),
    whyItMatters: input.firstObjective.whyItMatters?.trim() || undefined,
  }

  return {
    version: 1,
    createdAt: input.createdAt ?? nowIso(),
    positioning: 'protected_personal_discipline',
    painPoints: unique(input.painPoints ?? []),
    protectedLifeAreas,
    firstObjective,
    weaknessPatterns: unique(input.weaknessPatterns ?? []),
    distractionProfile: {
      timeThieves: unique(input.distractionProfile?.timeThieves ?? []),
      customDistraction: input.distractionProfile?.customDistraction?.trim() || undefined,
      scanLocalAppsLater: input.distractionProfile?.scanLocalAppsLater ?? true,
    },
    scheduleAnchors: input.scheduleAnchors ?? [],
    sleepCommitment,
    deepWorkWindow: input.deepWorkWindow ?? 'unknown',
    protectionStyle,
    commitmentSentence:
      'À partir de maintenant, Vethos ne protège pas tes envies du moment. Il protège tes décisions prises quand tu étais lucide.',
  }
}

export function buildInitialUserModelFromOnboarding(
  result: OnboardingResult,
): InitialUserModelFromOnboarding {
  return {
    version: 1,
    disciplineContract: {
      coreSentence: result.commitmentSentence,
      protectedDecision: objectiveLabel(result),
      protectionStyle: result.protectionStyle,
    },
    commitments: {
      primaryDirection: result.firstObjective,
      sleep: result.sleepCommitment,
      deepWorkWindow: result.deepWorkWindow,
      scheduleAnchors: result.scheduleAnchors,
    },
    riskProfile: {
      painPoints: result.painPoints,
      weaknessPatterns: result.weaknessPatterns,
      distractions: result.distractionProfile,
    },
  }
}

export function buildOnboardingDiagnosis(result: OnboardingResult): OnboardingDiagnosis {
  const messages: string[] = []
  const reasonTags: string[] = []

  if (result.painPoints.includes('postpones_important')) {
    messages.push('Ton risque principal est de repousser ce qui compte jusqu’à ce que ça devienne urgent.')
    reasonTags.push('important_work_postponed')
  }
  if (result.painPoints.includes('starts_then_drifts')) {
    messages.push('Tu peux commencer, mais ton élan se casse quand une distraction devient facile.')
    reasonTags.push('momentum_fragile')
  }
  if (result.painPoints.includes('unclear_first_action')) {
    messages.push('Vethos devra transformer ton objectif en prochaine action claire.')
    reasonTags.push('needs_next_action')
  }
  if (result.weaknessPatterns.includes('evening')) {
    messages.push('Tu perds surtout le contrôle le soir : Vethos devra protéger ce moment avec prudence.')
    reasonTags.push('evening_risk')
  }
  if (result.weaknessPatterns.includes('deadline_too_close')) {
    messages.push('Quand la deadline est trop proche, Vethos devra réduire les décisions faibles.')
    reasonTags.push('deadline_pressure')
  }
  if (result.distractionProfile.timeThieves.length > 0) {
    messages.push('Des voleurs de contrôle sont identifiés : ils seront traités comme risques pendant les sessions.')
    reasonTags.push('known_distractions')
  }
  if (messages.length === 0) {
    messages.push('Tu as choisi une direction à protéger. Le premier risque est l’absence de bloc protégé.')
    reasonTags.push('no_protected_block_yet')
  }

  const recommendedProtectionStyle: OnboardingProtectionStyle =
    result.protectionStyle === 'calm' && reasonTags.length >= 2 ? 'firm' : result.protectionStyle

  return {
    title: 'Vethos a trouvé ton premier risque.',
    primaryRisk: messages[0]!,
    messages,
    recommendedProtectionStyle,
    reasonTags,
  }
}

export function buildFirstSystemPreview(
  result: OnboardingResult,
  availableContext: FirstSystemPreviewContext = {},
): OnboardingFirstPlanPreview {
  const diagnosis = buildOnboardingDiagnosis(result)
  const durationMinutes =
    result.firstObjective.importance === 'central'
      ? 60
      : result.firstObjective.importance === 'very_important'
        ? 45
        : 35
  const firstBlock = availableContext.firstAvailableBlock ?? {
    startLabel:
      result.deepWorkWindow === 'morning'
        ? 'Prochain matin disponible'
        : result.deepWorkWindow === 'afternoon'
          ? 'Prochain après-midi disponible'
          : result.deepWorkWindow === 'evening'
            ? 'Prochain soir disponible'
            : 'Premier créneau libre recommandé',
    durationMinutes,
  }

  const why = [
    diagnosis.primaryRisk,
    `Ce premier bloc défend : ${objectiveLabel(result)}.`,
    protectionSentence(diagnosis.recommendedProtectionStyle),
  ]

  if (result.sleepCommitment.treatedAsCommitment) {
    why.push(
      `Le sommeil ${result.sleepCommitment.sleepAt} → ${result.sleepCommitment.wakeAt} est traité comme un engagement.`,
    )
  }

  return {
    protectedObjective: objectiveLabel(result),
    nextAction: `Créer la première action concrète pour : ${objectiveLabel(result)}`,
    firstBlock: {
      label: 'Premier bloc protégé',
      startLabel: firstBlock.startLabel,
      durationMinutes: firstBlock.durationMinutes,
    },
    protection:
      diagnosis.recommendedProtectionStyle === 'strict'
        ? 'Verrouillage strict : excuses faibles refusées.'
        : diagnosis.recommendedProtectionStyle === 'calm'
          ? 'Protection calme : rappel fort, liberté plus grande.'
          : 'Protection ferme : justification demandée, session protégée.',
    why,
    confidence: Math.max(
      45,
      Math.min(
        95,
        55 +
          result.painPoints.length * 5 +
          result.weaknessPatterns.length * 4 +
          result.distractionProfile.timeThieves.length * 3 +
          importanceBoost(result.firstObjective.importance),
      ),
    ),
  }
}
