import { describe, it, expect } from 'vitest'
import { guardRealActivationUi } from './real-activation-ui-guards'

describe('real-activation-ui-guards', () => {
  it('allows healthy audit-only reports', () => {
    const mockReport = {
      canProceedToRealExecution: false,
      canCallRealManagersNow: false,
      protocolDraft: {
        canCallRealManagersNow: false,
        canWriteStoresNow: false,
        canCreateSessionsNow: false,
        canStartSessionsNow: false,
        canApplyPlanningNow: false,
        canEnableBlockingNow: false,
        canCompleteTasksNow: false,
        canTouchOsNow: false,
        canPersistProtocolNow: false,
        canProceedToRealExecution: false,
        boundary: {
          allowedNow: {
            callRealManagers: false,
            writeStores: false,
            writeLocalStorage: false,
            createSessions: false,
            startSessions: false,
            applyPlanning: false,
            enableBlocking: false,
            completeTasks: false,
            touchOs: false
          },
          futureBoundaryCandidates: []
        },
        permissionMatrix: {
          permissions: []
        },
        moduleAudit: []
      }
    } as any

    expect(guardRealActivationUi(mockReport)).toBe(true)
  })

  it('throws on canProceedToRealExecution violation', () => {
    const badReport = {
      canProceedToRealExecution: true,
      canCallRealManagersNow: false,
      protocolDraft: {
        canCallRealManagersNow: false,
        boundary: { allowedNow: {}, futureBoundaryCandidates: [] },
        permissionMatrix: { permissions: [] },
        moduleAudit: []
      }
    } as any

    expect(() => guardRealActivationUi(badReport)).toThrow('VIOLATION CRITIQUE DE SÉCURITÉ')
  })

  it('throws when any allowedNow action is true', () => {
    const badReport = {
      canProceedToRealExecution: false,
      canCallRealManagersNow: false,
      protocolDraft: {
        canCallRealManagersNow: false,
        boundary: {
          allowedNow: {
            callRealManagers: true
          },
          futureBoundaryCandidates: []
        },
        permissionMatrix: { permissions: [] },
        moduleAudit: []
      }
    } as any

    expect(() => guardRealActivationUi(badReport)).toThrow('VIOLATION CRITIQUE DE SÉCURITÉ')
  })

  it('throws when any permission is grantedNow or canRequestNow', () => {
    const badReport = {
      canProceedToRealExecution: false,
      canCallRealManagersNow: false,
      protocolDraft: {
        canCallRealManagersNow: false,
        boundary: { allowedNow: {}, futureBoundaryCandidates: [] },
        permissionMatrix: {
          permissions: [
            { id: '1', label: 'Test', grantedNow: true }
          ]
        },
        moduleAudit: []
      }
    } as any

    expect(() => guardRealActivationUi(badReport)).toThrow('VIOLATION CRITIQUE DE SÉCURITÉ')

    const badReport2 = {
      canProceedToRealExecution: false,
      canCallRealManagersNow: false,
      protocolDraft: {
        canCallRealManagersNow: false,
        boundary: { allowedNow: {}, futureBoundaryCandidates: [] },
        permissionMatrix: {
          permissions: [
            { id: '2', label: 'Test 2', canRequestNow: true }
          ]
        },
        moduleAudit: []
      }
    } as any

    expect(() => guardRealActivationUi(badReport2)).toThrow('VIOLATION CRITIQUE DE SÉCURITÉ')
  })

  it('throws when any futureBoundaryCandidate has canExecuteNow set to true', () => {
    const badReport = {
      canProceedToRealExecution: false,
      canCallRealManagersNow: false,
      protocolDraft: {
        canCallRealManagersNow: false,
        boundary: {
          allowedNow: {},
          futureBoundaryCandidates: [
            { id: 'cand-1', name: 'Cand 1', canExecuteNow: true }
          ]
        },
        permissionMatrix: { permissions: [] },
        moduleAudit: []
      }
    } as any

    expect(() => guardRealActivationUi(badReport)).toThrow('VIOLATION CRITIQUE DE SÉCURITÉ')
  })

  it('throws when any audited function has canCallInPoint16 set to true', () => {
    const badReport = {
      canProceedToRealExecution: false,
      canCallRealManagersNow: false,
      protocolDraft: {
        canCallRealManagersNow: false,
        boundary: { allowedNow: {}, futureBoundaryCandidates: [] },
        permissionMatrix: { permissions: [] },
        moduleAudit: [
          {
            id: 'mod-1',
            kind: 'hosts_writer',
            name: 'Hosts Writer',
            realFunctions: [
              { name: 'write', canCallInPoint16: true }
            ]
          }
        ]
      }
    } as any

    expect(() => guardRealActivationUi(badReport)).toThrow('VIOLATION CRITIQUE DE SÉCURITÉ')
  })
})

