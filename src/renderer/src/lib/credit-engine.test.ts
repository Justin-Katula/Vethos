import { describe, it, expect } from 'vitest'
import { computeCredits, computeCreditsFromAppUsage } from './credit-engine'
import type {
  BlockingHistoryEntry,
  DeclaredApp,
  Objective,
  TimeRule,
} from '@shared/schemas'

const RULE_A = '11111111-1111-1111-1111-111111111111'
const RULE_B = '22222222-2222-2222-2222-222222222222'
const PROFILE_X = '33333333-3333-3333-3333-333333333333'
const PROFILE_Y = '44444444-4444-4444-4444-444444444444'
const OBJ_1 = '55555555-5555-5555-5555-555555555555'
const OBJ_2 = '66666666-6666-6666-6666-666666666666'
const SESSION_1 = '77777777-7777-7777-7777-777777777777'
const SESSION_2 = '88888888-8888-8888-8888-888888888888'
const SESSION_3 = '99999999-9999-9999-9999-999999999999'

const rule = (id: string, profileId: string | null): TimeRule => ({
  id,
  name: 'rule',
  color: '#ff0000',
  linkedProfileId: profileId,
  createdAt: '2026-01-01T00:00:00.000Z',
})

const objective = (id: string, ruleIds: string[]): Objective => ({
  id,
  name: 'obj',
  color: '#00ff00',
  linkedRuleIds: ruleIds,
  xpMinutes: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
})

const session = (
  sessionId: string,
  profileId: string,
  startedAt: string,
  endedAt: string,
  completedNormally = true,
): BlockingHistoryEntry => ({
  sessionId,
  profileId,
  startedAt,
  endedAt,
  completedNormally,
})

describe('computeCredits', () => {
  it('historique vide → tout vide, cursor null', () => {
    const out = computeCredits({
      history: [],
      rules: [],
      objectives: [],
      lastProcessedSessionId: null,
    })
    expect(out.objectiveDeltas.size).toBe(0)
    expect(out.freeTimeDelta).toBe(0)
    expect(out.freeTimeEntries).toHaveLength(0)
    expect(out.newCursorSessionId).toBe(null)
  })

  it('session non terminée normalement → ignorée mais cursor avance', () => {
    const out = computeCredits({
      history: [session(SESSION_1, PROFILE_X, '2026-05-01T08:00:00.000Z', '2026-05-01T08:30:00.000Z', false)],
      rules: [rule(RULE_A, PROFILE_X)],
      objectives: [objective(OBJ_1, [RULE_A])],
      lastProcessedSessionId: null,
    })
    expect(out.objectiveDeltas.size).toBe(0)
    expect(out.freeTimeDelta).toBe(0)
    expect(out.freeTimeEntries).toHaveLength(0)
    expect(out.newCursorSessionId).toBe(SESSION_1)
  })

  it('session liée à 1 objectif → +duration XP + duration*0.5 free time', () => {
    const out = computeCredits({
      history: [session(SESSION_1, PROFILE_X, '2026-05-01T08:00:00.000Z', '2026-05-01T08:30:00.000Z')],
      rules: [rule(RULE_A, PROFILE_X)],
      objectives: [objective(OBJ_1, [RULE_A])],
      lastProcessedSessionId: null,
    })
    expect(out.objectiveDeltas.get(OBJ_1)).toBe(30)
    expect(out.freeTimeDelta).toBe(15)
    expect(out.freeTimeEntries).toHaveLength(1)
    expect(out.freeTimeEntries[0]!.deltaMinutes).toBe(15)
    expect(out.newCursorSessionId).toBe(SESSION_1)
  })

  it('session liée à 2 objectifs → duration/2 XP chacun, free time une seule fois', () => {
    const out = computeCredits({
      history: [session(SESSION_1, PROFILE_X, '2026-05-01T08:00:00.000Z', '2026-05-01T09:00:00.000Z')],
      rules: [rule(RULE_A, PROFILE_X)],
      objectives: [objective(OBJ_1, [RULE_A]), objective(OBJ_2, [RULE_A])],
      lastProcessedSessionId: null,
    })
    expect(out.objectiveDeltas.get(OBJ_1)).toBe(30)
    expect(out.objectiveDeltas.get(OBJ_2)).toBe(30)
    expect(out.freeTimeDelta).toBe(30) // 60 * 0.5, une seule fois
    expect(out.freeTimeEntries).toHaveLength(1)
  })

  it('session sans match (profil non lié) → cursor avance, rien crédité', () => {
    const out = computeCredits({
      history: [session(SESSION_1, PROFILE_Y, '2026-05-01T08:00:00.000Z', '2026-05-01T08:30:00.000Z')],
      rules: [rule(RULE_A, PROFILE_X)],
      objectives: [objective(OBJ_1, [RULE_A])],
      lastProcessedSessionId: null,
    })
    expect(out.objectiveDeltas.size).toBe(0)
    expect(out.freeTimeDelta).toBe(0)
    expect(out.newCursorSessionId).toBe(SESSION_1)
  })

  it('cursor déjà au dernier sessionId → rien à traiter', () => {
    const out = computeCredits({
      history: [session(SESSION_1, PROFILE_X, '2026-05-01T08:00:00.000Z', '2026-05-01T08:30:00.000Z')],
      rules: [rule(RULE_A, PROFILE_X)],
      objectives: [objective(OBJ_1, [RULE_A])],
      lastProcessedSessionId: SESSION_1,
    })
    expect(out.objectiveDeltas.size).toBe(0)
    expect(out.freeTimeDelta).toBe(0)
    expect(out.newCursorSessionId).toBe(SESSION_1)
  })

  it('cursor au milieu → seules les sessions plus récentes traitées', () => {
    const out = computeCredits({
      history: [
        session(SESSION_1, PROFILE_X, '2026-05-01T08:00:00.000Z', '2026-05-01T08:30:00.000Z'),
        session(SESSION_2, PROFILE_X, '2026-05-01T09:00:00.000Z', '2026-05-01T09:30:00.000Z'),
        session(SESSION_3, PROFILE_X, '2026-05-01T10:00:00.000Z', '2026-05-01T10:30:00.000Z'),
      ],
      rules: [rule(RULE_A, PROFILE_X)],
      objectives: [objective(OBJ_1, [RULE_A])],
      lastProcessedSessionId: SESSION_1,
    })
    expect(out.objectiveDeltas.get(OBJ_1)).toBe(60) // 2 sessions x 30
    expect(out.freeTimeDelta).toBe(30)
    expect(out.newCursorSessionId).toBe(SESSION_3)
  })

  it('idempotence : re-run avec nouveau cursor ne re-crédite pas', () => {
    const history = [
      session(SESSION_1, PROFILE_X, '2026-05-01T08:00:00.000Z', '2026-05-01T08:30:00.000Z'),
      session(SESSION_2, PROFILE_X, '2026-05-01T09:00:00.000Z', '2026-05-01T09:30:00.000Z'),
    ]
    const rules = [rule(RULE_A, PROFILE_X)]
    const objectives = [objective(OBJ_1, [RULE_A])]

    const first = computeCredits({ history, rules, objectives, lastProcessedSessionId: null })
    const second = computeCredits({
      history,
      rules,
      objectives,
      lastProcessedSessionId: first.newCursorSessionId,
    })

    expect(first.objectiveDeltas.get(OBJ_1)).toBe(60)
    expect(second.objectiveDeltas.size).toBe(0)
    expect(second.freeTimeDelta).toBe(0)
  })

  it('session avec règle à linkedProfileId null → ignorée', () => {
    const out = computeCredits({
      history: [session(SESSION_1, PROFILE_X, '2026-05-01T08:00:00.000Z', '2026-05-01T08:30:00.000Z')],
      rules: [rule(RULE_A, null)],
      objectives: [objective(OBJ_1, [RULE_A])],
      lastProcessedSessionId: null,
    })
    expect(out.objectiveDeltas.size).toBe(0)
    expect(out.newCursorSessionId).toBe(SESSION_1)
  })

  it('ratio personnalisable', () => {
    const out = computeCredits({
      history: [session(SESSION_1, PROFILE_X, '2026-05-01T08:00:00.000Z', '2026-05-01T09:00:00.000Z')],
      rules: [rule(RULE_A, PROFILE_X)],
      objectives: [objective(OBJ_1, [RULE_A])],
      lastProcessedSessionId: null,
      freeTimeRatio: 1.0,
    })
    expect(out.objectiveDeltas.get(OBJ_1)).toBe(60)
    expect(out.freeTimeDelta).toBe(60)
  })

  it('plusieurs sessions, multi-objectif → cumul correct', () => {
    const out = computeCredits({
      history: [
        session(SESSION_1, PROFILE_X, '2026-05-01T08:00:00.000Z', '2026-05-01T08:30:00.000Z'),
        session(SESSION_2, PROFILE_Y, '2026-05-01T09:00:00.000Z', '2026-05-01T10:00:00.000Z'),
      ],
      rules: [rule(RULE_A, PROFILE_X), rule(RULE_B, PROFILE_Y)],
      objectives: [objective(OBJ_1, [RULE_A, RULE_B]), objective(OBJ_2, [RULE_B])],
      lastProcessedSessionId: null,
    })
    // SESSION_1 (30 min) → RULE_A → OBJ_1 seul → +30 XP OBJ_1, +15 free
    // SESSION_2 (60 min) → RULE_B → OBJ_1 et OBJ_2 → +30 chacun, +30 free
    expect(out.objectiveDeltas.get(OBJ_1)).toBe(60)
    expect(out.objectiveDeltas.get(OBJ_2)).toBe(30)
    expect(out.freeTimeDelta).toBe(45)
    expect(out.freeTimeEntries).toHaveLength(2)
  })
})

// ─── App usage credit ─────────────────────────────────────────────────────

const APP_VSCODE: DeclaredApp = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  name: 'VS Code',
  exeName: 'Code.exe',
  linkedObjectiveId: OBJ_1,
  xpRatio: 0.5,
  createdAt: '2026-05-01T00:00:00.000Z',
}

const APP_CHROME_FREE: DeclaredApp = {
  id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  name: 'Chrome',
  exeName: 'chrome.exe',
  linkedObjectiveId: null,
  xpRatio: 0.25,
  createdAt: '2026-05-01T00:00:00.000Z',
}

describe('computeCreditsFromAppUsage', () => {
  it('crédite un objectif lié avec ratio appliqué', () => {
    const minutesByDay = new Map([['2026-05-04', 60]])
    const out = computeCreditsFromAppUsage(
      {
        apps: [{ app: APP_VSCODE, minutesByDay, lastProcessedDate: null }],
      },
      { today: '2026-05-05' },
    )
    expect(out.objectiveDeltas.get(OBJ_1)).toBe(30) // 60 * 0.5
    expect(out.freeTimeDelta).toBe(0)
    expect(out.newCursorByApp.get(APP_VSCODE.id)).toBe('2026-05-04')
  })

  it('crédite le free time si app non liée à un objectif', () => {
    const minutesByDay = new Map([['2026-05-04', 40]])
    const out = computeCreditsFromAppUsage(
      {
        apps: [
          { app: APP_CHROME_FREE, minutesByDay, lastProcessedDate: null },
        ],
      },
      { today: '2026-05-05' },
    )
    expect(out.objectiveDeltas.size).toBe(0)
    expect(out.freeTimeDelta).toBe(10) // 40 * 0.25
    expect(out.freeTimeEntries).toHaveLength(1)
  })

  it("ignore le jour courant (incomplet)", () => {
    const minutesByDay = new Map([
      ['2026-05-04', 60],
      ['2026-05-05', 30], // today, doit être ignoré
    ])
    const out = computeCreditsFromAppUsage(
      {
        apps: [{ app: APP_VSCODE, minutesByDay, lastProcessedDate: null }],
      },
      { today: '2026-05-05' },
    )
    expect(out.objectiveDeltas.get(OBJ_1)).toBe(30) // seul le 2026-05-04
    expect(out.newCursorByApp.get(APP_VSCODE.id)).toBe('2026-05-04')
  })

  it('idempotent via cursor : ne re-crédite pas les jours déjà traités', () => {
    const minutesByDay = new Map([
      ['2026-05-03', 60],
      ['2026-05-04', 60],
    ])
    const out = computeCreditsFromAppUsage(
      {
        apps: [
          { app: APP_VSCODE, minutesByDay, lastProcessedDate: '2026-05-03' },
        ],
      },
      { today: '2026-05-05' },
    )
    expect(out.objectiveDeltas.get(OBJ_1)).toBe(30) // seul le 2026-05-04
    expect(out.newCursorByApp.get(APP_VSCODE.id)).toBe('2026-05-04')
  })

  it('multi-app : cursors séparés', () => {
    const out = computeCreditsFromAppUsage(
      {
        apps: [
          {
            app: APP_VSCODE,
            minutesByDay: new Map([['2026-05-04', 60]]),
            lastProcessedDate: null,
          },
          {
            app: APP_CHROME_FREE,
            minutesByDay: new Map([['2026-05-03', 40]]),
            lastProcessedDate: null,
          },
        ],
      },
      { today: '2026-05-05' },
    )
    expect(out.objectiveDeltas.get(OBJ_1)).toBe(30)
    expect(out.freeTimeDelta).toBe(10)
    expect(out.newCursorByApp.get(APP_VSCODE.id)).toBe('2026-05-04')
    expect(out.newCursorByApp.get(APP_CHROME_FREE.id)).toBe('2026-05-03')
  })

  it('aucune app à traiter = no-op', () => {
    const out = computeCreditsFromAppUsage({ apps: [] }, { today: '2026-05-05' })
    expect(out.objectiveDeltas.size).toBe(0)
    expect(out.freeTimeDelta).toBe(0)
    expect(out.freeTimeEntries).toHaveLength(0)
    expect(out.newCursorByApp.size).toBe(0)
  })

  it('appel répété avec le nouveau cursor = no-op', () => {
    const minutesByDay = new Map([['2026-05-04', 60]])
    const first = computeCreditsFromAppUsage(
      {
        apps: [{ app: APP_VSCODE, minutesByDay, lastProcessedDate: null }],
      },
      { today: '2026-05-05' },
    )
    const cursor = first.newCursorByApp.get(APP_VSCODE.id) ?? null
    const second = computeCreditsFromAppUsage(
      {
        apps: [{ app: APP_VSCODE, minutesByDay, lastProcessedDate: cursor }],
      },
      { today: '2026-05-05' },
    )
    expect(second.objectiveDeltas.size).toBe(0)
    expect(second.freeTimeDelta).toBe(0)
  })
})
