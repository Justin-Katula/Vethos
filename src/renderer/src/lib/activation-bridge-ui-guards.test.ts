import { describe, it, expect } from 'vitest'
import { guardActivationBridgeUi } from './activation-bridge-ui-guards'
import { ActivationBridgeViewModel } from './activation-bridge-view-model'

describe('activation-bridge-ui-guards', () => {
  const safeVm: ActivationBridgeViewModel = {
    title: 'Contrat',
    statusLabel: 'Draft',
    statusSeverity: 'neutral',
    summaryCards: [],
    futureActionRows: [
      { id: '1', label: 'Future session creation', statusLabel: 'Blocked', reason: '', canExecuteNow: false }
    ],
    preconditionRows: [],
    warnings: [],
    blockers: [],
    canProceedToRealActivation: false,
    canApplyAnythingNow: false,
    forbiddenActionNotice: 'Aucune action.'
  }

  it('safe model passe', () => {
    const res = guardActivationBridgeUi(safeVm)
    expect(res.safe).toBe(true)
  })

  it('détecte canProceedToRealActivation true', () => {
    const res = guardActivationBridgeUi({ ...safeVm, canProceedToRealActivation: true as any })
    expect(res.safe).toBe(false)
    expect(res.issues.some(i => i.id === 'guard_can_proceed')).toBe(true)
  })

  it('détecte futureAction canExecuteNow true', () => {
    const badRows = [...safeVm.futureActionRows, { id: '2', label: 'Test', statusLabel: '', reason: '', canExecuteNow: true as any }]
    const res = guardActivationBridgeUi({ ...safeVm, futureActionRows: badRows })
    expect(res.safe).toBe(false)
    expect(res.issues.some(i => i.id === 'guard_can_execute_now')).toBe(true)
  })

  it('détecte wording dangereux', () => {
    const badRows = [...safeVm.futureActionRows, { id: '2', label: 'Appliquer maintenant', statusLabel: '', reason: '', canExecuteNow: false as const }]
    const res = guardActivationBridgeUi({ ...safeVm, futureActionRows: badRows })
    expect(res.safe).toBe(false)
    expect(res.issues.some(i => i.id === 'guard_imperative_wording')).toBe(true)
  })
})
