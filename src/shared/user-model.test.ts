import { describe, expect, it } from 'vitest'
import { buildOnboardingResult } from './onboarding-model'
import {
  addUserBehaviorEvent,
  addUserCorrection,
  buildEmptyUserModel,
  buildUserModelFromOnboarding,
  mergeUserModelWithOnboarding,
  type UserBehaviorEvent,
  type UserCorrection,
} from './user-model'

const NOW = '2026-06-24T12:00:00.000Z'

describe('user-model contracts', () => {
  it('crée un UserModel vide', () => {
    const model = buildEmptyUserModel('user-1', { now: NOW })

    expect(model.userId).toBe('user-1')
    expect('shadowOnly' in model).toBe(false)
    expect(model.declaredProfile.userType).toBe('unknown')
    expect(model.declaredProfile.protectionStyle).toBe('firm')
    expect(model.behaviorEvents).toEqual([])
    expect(model.metadata.version).toBe(1)
  })

  it('construit un UserModel depuis l’onboarding', () => {
    const onboarding = buildOnboardingResult({
      createdAt: NOW,
      painPoints: ['postpones_important'],
      weaknessPatterns: ['evening'],
      firstObjective: {
        statement: 'finir mon projet Vethos',
        importance: 'central',
        lifeArea: 'personal_project',
      },
      distractionProfile: {
        timeThieves: ['video_platforms', 'social_networks'],
        scanLocalAppsLater: true,
      },
      sleepCommitment: {
        sleepAt: '22:30',
        wakeAt: '06:00',
      },
      protectionStyle: 'strict',
    })

    const model = buildUserModelFromOnboarding('user-1', onboarding)

    expect('shadowOnly' in model).toBe(false)
    expect(model.declaredProfile.primaryLifeArea).toBe('project')
    expect(model.declaredProfile.protectionStyle).toBe('strict')
    expect(model.disciplineCommitments.some((commitment) => commitment.type === 'sleep')).toBe(true)
    expect(model.disciplineCommitments.some((commitment) => commitment.type === 'distraction_control')).toBe(true)
    expect(model.objectivePreferences[0]?.declaredImportanceScore).toBe(100)
  })

  it('fusionne l’onboarding de manière immuable', () => {
    const base = buildEmptyUserModel('user-1', { now: NOW })
    const onboarding = buildOnboardingResult({
      createdAt: '2026-06-25T12:00:00.000Z',
      firstObjective: { statement: 'réussir mes examens', importance: 'very_important', lifeArea: 'studies' },
      protectionStyle: 'firm',
    })

    const merged = mergeUserModelWithOnboarding(base, onboarding)

    expect(base.disciplineCommitments).toHaveLength(0)
    expect(merged.disciplineCommitments.length).toBeGreaterThan(0)
    expect(merged.declaredProfile.primaryLifeArea).toBe('school')
  })

  it('ajoute un événement sans muter l’ancien modèle et limite l’historique', () => {
    const base = buildEmptyUserModel('user-1', { now: NOW })
    const event = (index: number): UserBehaviorEvent => ({
      id: `event-${index}`,
      type: 'site_opened_during_session',
      targetType: 'site',
      targetId: `https://youtube.com/watch?v=${index}`,
      createdAt: `2026-06-24T12:00:${String(index).padStart(2, '0')}.000Z`,
    })

    const first = addUserBehaviorEvent(base, event(1), { eventLimit: 2 })
    const second = addUserBehaviorEvent(first, event(2), { eventLimit: 2 })
    const third = addUserBehaviorEvent(second, event(3), { eventLimit: 2 })

    expect(base.behaviorEvents).toHaveLength(0)
    expect(third.behaviorEvents).toHaveLength(2)
    expect(third.behaviorEvents[0]?.id).toBe('event-2')
    expect(third.behaviorEvents[1]?.targetId).toBe('youtube.com')
  })

  it('ajoute une correction sans muter et nettoie les URLs sensibles', () => {
    const base = buildEmptyUserModel('user-1', { now: NOW })
    const correction: UserCorrection = {
      id: 'correction-1',
      type: 'site_classification_corrected',
      targetType: 'site',
      targetId: 'www.instagram.com/reels/123?tracking=secret',
      oldValue: 'neutral',
      newValue: 'https://instagram.com/reels/abc?private=1',
      strength: 'strong',
      createdAt: '2026-06-24T13:00:00.000Z',
    }

    const next = addUserCorrection(base, correction)

    expect(base.corrections).toHaveLength(0)
    expect(next.corrections).toHaveLength(1)
    expect(next.corrections[0]?.targetId).toBe('instagram.com')
    expect(next.corrections[0]?.newValue).toBe('instagram.com')
    expect(next.metadata.confidence).toBeGreaterThan(base.metadata.confidence)
  })
})
