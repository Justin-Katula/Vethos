import { describe, expect, it } from 'vitest'
import { runSessionDiagnostics } from './session-diagnostics'
import { sessionPlanFixture } from './session-test-fixtures'

describe('session-diagnostics', () => {
  it('detects invalid durations', () => {
    expect(runSessionDiagnostics({ ...sessionPlanFixture(), plannedDurationMinutes: 0 }).issues[0]!.id).toBe('invalid_duration')
    expect(runSessionDiagnostics({ ...sessionPlanFixture(), plannedDurationMinutes: Number.NaN }).issues[0]!.id).toBe('invalid_duration')
  })

  it('detects a strategy block that could complete a task', () => {
    const plan = sessionPlanFixture()
    plan.targetType = 'strategy_block'
    plan.contract = { ...plan.contract, allowedToMarkTaskCompleted: true }
    expect(runSessionDiagnostics(plan).issues[0]!.id).toBe('strategy_block_completion_bug')
  })

  it('detects an empty strict allowlist', () => {
    const plan = sessionPlanFixture()
    plan.protection = { ...plan.protection, mode: 'strict_allowlist', usefulApps: [], usefulSites: [] }
    plan.protection.warnings = ['Ressources utiles manquantes.']
    const result = runSessionDiagnostics(plan)
    expect(result.status).toBe('warning')
    expect(result.issues[0]!.id).toBe('strict_allowlist_empty')
  })
})
