import { describe, it, expect } from 'vitest'
import { buildMinimalExecutionBoundary } from './minimal-execution-boundary-builder'

describe('minimal-execution-boundary-builder', () => {
  it('allowedNow safe true seulement pour read/show', () => {
    const res = buildMinimalExecutionBoundary({ moduleAudit: [], contractDraft: {} })
    expect(res.allowedNow.readContract).toBe(true)
    expect(res.allowedNow.showProtocolDraft).toBe(true)
  })

  it('dangerous allowedNow false', () => {
    const res = buildMinimalExecutionBoundary({ moduleAudit: [], contractDraft: {} })
    expect(res.allowedNow.callRealManagers).toBe(false)
    expect(res.allowedNow.writeStores).toBe(false)
    expect(res.allowedNow.startSessions).toBe(false)
    expect(res.allowedNow.touchOs).toBe(false)
  })

  it('future candidates canExecuteNow false', () => {
    const audit = [{
      id: '1', kind: 'session_manager', name: 'M', realFunctions: [{ name: 'f', candidateForFuturePoint: true, requiredPreconditions: [], dangerLevel: 'high' }]
    }] as any
    const res = buildMinimalExecutionBoundary({ moduleAudit: audit, contractDraft: {} })
    expect(res.futureBoundaryCandidates[0]!.canExecuteNow).toBe(false)
  })

  it('earliest future point >= 17', () => {
    const audit = [{
      id: '1', kind: 'session_manager', name: 'M', realFunctions: [{ name: 'f', candidateForFuturePoint: true, requiredPreconditions: [], dangerLevel: 'high' }]
    }] as any
    const res = buildMinimalExecutionBoundary({ moduleAudit: audit, contractDraft: {} })
    expect(res.futureBoundaryCandidates[0]!.futurePointEarliest).toBeGreaterThanOrEqual(17)
  })
})
