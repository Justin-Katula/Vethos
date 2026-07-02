import type { DailyCapacityResult, DayAvailabilitySnapshot } from '@shared/planning-time-model'
import type { Settings, Task, Objective } from '@shared/schemas'
import type { UserCognitiveModel, UserModel } from '@shared/user-model'
import { floorToFive } from './planning-time-utils'

export type CalculateDailyCapacityInput = {
  dayAvailability: DayAvailabilitySnapshot
  userModel?: UserModel | null
  cognitiveModel?: UserCognitiveModel | null
  existingSessions?: Array<{ durationMinutes?: number }>
  tasks?: Task[]
  objectives?: Objective[]
  settings?: Settings | null
}

function averageFatigueRisk(model: UserCognitiveModel | null | undefined): number {
  const risks = model?.fatigueRiskByHour ?? []
  if (risks.length === 0) return 0
  return risks.reduce((sum, entry) => sum + Math.max(0, entry.risk), 0) / risks.length
}

export function calculateDailyCapacity(input: CalculateDailyCapacityInput): DailyCapacityResult {
  void input.tasks
  void input.objectives
  void input.settings

  const day = input.dayAvailability
  const cognitiveModel = input.cognitiveModel ?? input.userModel?.cognitiveModel ?? null
  const fatigueRisk = averageFatigueRisk(cognitiveModel)
  const reasons: string[] = []
  const usableFreeMinutes = Math.max(0, day.usableFreeMinutes)
  const rawFreeMinutes = Math.max(0, day.rawFreeMinutes)

  let workRatio = 0.75
  if (day.status === 'fragmented') {
    workRatio = 0.6
    reasons.push('La journée est fragmentée : Vethos garde plus de marge.')
  }
  if (day.status === 'overloaded' || rawFreeMinutes < 90) {
    workRatio = Math.min(workRatio, 0.5)
    reasons.push('La journée est déjà serrée : la capacité réelle est réduite.')
  }
  if (fatigueRisk >= 70) {
    workRatio = Math.min(workRatio, 0.55)
    reasons.push('Le risque de fatigue est élevé : Vethos protège davantage la récupération.')
  }

  const totalExistingSessionMinutes = (input.existingSessions ?? []).reduce(
    (sum, session) => sum + Math.max(0, session.durationMinutes ?? 0),
    0,
  )
  if (totalExistingSessionMinutes >= 240) {
    workRatio = Math.min(workRatio, 0.45)
    reasons.push('Des sessions longues existent déjà dans cette journée.')
  }

  const maxWorkMinutes = floorToFive(usableFreeMinutes * workRatio)
  const maxDeepWorkMinutes = floorToFive(Math.min(day.deepWorkMinutes * 0.85, maxWorkMinutes * 0.7))
  const maxSameObjectiveMinutes = floorToFive(maxWorkMinutes * 0.55)
  const maxTotalProtectedSessionMinutes = floorToFive(Math.min(usableFreeMinutes * 0.85, maxWorkMinutes))

  let capacityStatus: DailyCapacityResult['capacityStatus'] = 'healthy'
  if (day.status === 'no_usable_time' || usableFreeMinutes === 0) {
    capacityStatus = 'overloaded'
    reasons.push('Aucun vrai temps utilisable n’est disponible.')
  } else if (fatigueRisk >= 70) {
    capacityStatus = 'recovery_needed'
  } else if (maxWorkMinutes < 90 || day.status === 'tight') {
    capacityStatus = 'tight'
  } else if (day.status === 'overloaded') {
    capacityStatus = 'overloaded'
  }

  if (reasons.length === 0) reasons.push('La journée garde une marge saine : Vethos ne consomme pas 100% du temps libre.')

  return {
    date: day.date,
    rawFreeMinutes,
    usableFreeMinutes,
    maxWorkMinutes,
    maxDeepWorkMinutes,
    maxSameObjectiveMinutes,
    maxTotalProtectedSessionMinutes,
    capacityStatus,
    reasons,
    confidence: day.timeline.length > 0 ? 78 : 35,
  }
}
