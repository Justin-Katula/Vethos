import { describe, expect, it } from 'vitest'
import { runActivationBridgeSafetyCheck } from './activation-bridge-safety-engine'
import { executionContractFixture, executionQaFixture } from './activation-test-fixtures'

describe('activation-bridge-safety-engine', () => {
  it('detects a contract that can activate now', () => {
    const contract = { ...executionContractFixture(), canActivateNow: true }
    const result = runActivationBridgeSafetyCheck({ contractDraft: contract })
    expect(result.status).toBe('critical')
  })

  it('detects a future action executable now', () => {
    const contract = executionContractFixture()
    contract.futureActions = [{
      id: 'a1', kind: 'future_start_session', targetType: 'session', label: 'Future session',
      status: 'blocked', reason: 'Test', canExecuteNow: true,
      requiredFutureFlags: [], requiredSafetyChecks: [], confidence: 100,
    }]
    expect(runActivationBridgeSafetyCheck({ contractDraft: contract }).status).toBe('critical')
  })

  it('detects executable wording without a blocking status', () => {
    const contract = executionContractFixture()
    contract.futureActions = [{
      id: 'a1', kind: 'future_apply_planning', targetType: 'planning', label: 'Apply plan',
      status: 'not_supported_yet', reason: 'Test', canExecuteNow: false,
      requiredFutureFlags: [], requiredSafetyChecks: [], confidence: 100,
    }]
    expect(runActivationBridgeSafetyCheck({ contractDraft: contract }).status).toBe('critical')
  })

  it('detects unsafe QA paired with a ready contract', () => {
    const qa = { ...executionQaFixture(), status: 'unsafe' as const }
    expect(runActivationBridgeSafetyCheck({ contractDraft: executionContractFixture(), qaReport: qa }).status).toBe('critical')
  })
})
