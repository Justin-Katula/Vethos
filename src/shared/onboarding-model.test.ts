import { describe, expect, it } from 'vitest'
import {
  VETHOS_ONBOARDING_FLOW,
  buildFirstSystemPreview,
  buildInitialUserModelFromOnboarding,
  buildOnboardingDiagnosis,
  buildOnboardingResult,
} from './onboarding-model'

describe('onboarding-model', () => {
  it('transforme les réponses en engagement, pas en habitudes passives', () => {
    const result = buildOnboardingResult({
      createdAt: '2026-06-24T12:00:00.000Z',
      painPoints: ['postpones_important', 'starts_then_drifts'],
      protectedLifeAreas: ['personal_project'],
      firstObjective: {
        statement: 'finir mon projet Vethos',
        importance: 'central',
        lifeArea: 'personal_project',
      },
      sleepCommitment: {
        sleepAt: '22:30',
        wakeAt: '6:00',
      },
      protectionStyle: 'firm',
    })

    expect('advisoryOnly' in result).toBe(false)
    expect(result.sleepCommitment).toEqual({
      sleepAt: '22:30',
      wakeAt: '06:00',
      treatedAsCommitment: true,
    })
    expect(result.commitmentSentence).toContain('décisions prises quand tu étais lucide')
  })

  it('construit un UserModel initial sans contrôler le comportement réel', () => {
    const result = buildOnboardingResult({
      firstObjective: { statement: 'réussir mes examens', importance: 'very_important' },
      weaknessPatterns: ['evening'],
      distractionProfile: { timeThieves: ['video_platforms'], scanLocalAppsLater: true },
    })

    const userModel = buildInitialUserModelFromOnboarding(result)

    expect('advisoryOnly' in userModel).toBe(false)
    expect(userModel.disciplineContract.protectedDecision).toBe('réussir mes examens')
    expect(userModel.riskProfile.distractions.scanLocalAppsLater).toBe(true)
  })

  it('produit un diagnostic humain à partir des risques', () => {
    const result = buildOnboardingResult({
      painPoints: ['unclear_first_action'],
      weaknessPatterns: ['deadline_too_close'],
      firstObjective: { statement: 'reprendre ma discipline', importance: 'central' },
      protectionStyle: 'calm',
    })

    const diagnosis = buildOnboardingDiagnosis(result)

    expect(diagnosis.title).toBe('Vethos a trouvé ton premier risque.')
    expect(diagnosis.reasonTags).toContain('needs_next_action')
    expect(diagnosis.reasonTags).toContain('deadline_pressure')
    expect(diagnosis.recommendedProtectionStyle).toBe('firm')
  })

  it('prépare une première victoire', () => {
    const result = buildOnboardingResult({
      painPoints: ['postpones_important'],
      weaknessPatterns: ['evening'],
      firstObjective: { statement: 'apprendre à coder', importance: 'central' },
      deepWorkWindow: 'morning',
      protectionStyle: 'strict',
    })

    const preview = buildFirstSystemPreview(result)

    expect('advisoryOnly' in preview).toBe(false)
    expect(preview.protectedObjective).toBe('apprendre à coder')
    expect(preview.firstBlock.durationMinutes).toBe(60)
    expect(preview.protection).toContain('Verrouillage strict')
    expect(preview.why.join(' ')).toContain('sommeil')
  })

  it('expose le nouveau flow de conversion sans remplacer l’UI existante', () => {
    expect(VETHOS_ONBOARDING_FLOW[0]?.title).toBe('Ton temps a besoin d’être protégé.')
    expect(VETHOS_ONBOARDING_FLOW.some((screen) => screen.id === 'sleep-commitment')).toBe(true)
    expect(VETHOS_ONBOARDING_FLOW.some((screen) => screen.title.includes('sommeil veux-tu défendre'))).toBe(
      true,
    )
  })
})
