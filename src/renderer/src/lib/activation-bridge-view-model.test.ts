import { describe, expect, it } from 'vitest'
import { buildActivationBridgeViewModel } from './activation-bridge-view-model'
import { executionContractFixture } from './activation-test-fixtures'
import { runActivationBridgeGate } from './activation-bridge-gate-engine'

describe('activation-bridge-view-model', () => {
  it('keeps future actions non executable', () => {
    const contract = executionContractFixture()
    const gate = runActivationBridgeGate({ contractDraft: contract })
    const vm = buildActivationBridgeViewModel({ contractDraft: contract, gateResult: gate })
    expect(vm.futureActionRows[0]!.canExecuteNow).toBe(false)
    expect(vm.forbiddenActionNotice).toBeTruthy()
    expect(vm.canApplyAnythingNow).toBe(false)
  })
})
