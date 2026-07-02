import { describe, expect, it } from 'vitest'
import { parseAppExplanationCoachResult } from './app-explanation-coach'

describe('parseAppExplanationCoachResult', () => {
  it('requires very high scores before granting an exception', () => {
    expect(
      parseAppExplanationCoachResult(
        JSON.stringify({
          decision: 'allow',
          necessityScore: 9,
          credibilityScore: 8.9,
          urgencyScore: 10,
          allowMinutes: 8,
          reason: 'Presque crédible',
        }),
      ),
    ).toMatchObject({ allowed: false, allowMinutes: 0 })
  })

  it('clamps an accepted exception to ten minutes', () => {
    expect(
      parseAppExplanationCoachResult(
        JSON.stringify({
          decision: 'allow',
          necessityScore: 10,
          credibilityScore: 9,
          urgencyScore: 9,
          allowMinutes: 45,
          reason: 'Accès indispensable pour livrer le travail.',
        }),
      ),
    ).toEqual({
      allowed: true,
      allowMinutes: 10,
      necessityScore: 10,
      credibilityScore: 9,
      urgencyScore: 9,
      reason: 'Accès indispensable pour livrer le travail.',
    })
  })

  it('extracts JSON from a wrapped model response', () => {
    expect(
      parseAppExplanationCoachResult(
        'Analyse: {"decision":"deny","necessityScore":3,"credibilityScore":4,"urgencyScore":2,"reason":"Excuse répétée"}',
      ),
    ).toMatchObject({ allowed: false, reason: 'Excuse répétée' })
  })
})
