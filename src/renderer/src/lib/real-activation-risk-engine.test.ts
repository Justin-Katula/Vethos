import { describe, it, expect } from 'vitest'
import { runRealActivationRiskEngine } from './real-activation-risk-engine'
import { RealExecutableModuleAudit } from '../../../shared/real-activation-protocol-model'

describe('real-activation-risk-engine', () => {
  it('enforces canProceedToRealExecution as false', () => {
    const report = runRealActivationRiskEngine({ moduleAudit: [] })
    expect(report.canProceedToRealExecution).toBe(false)
  })

  it('detects high/critical danger functions as critical status and blocks activation', () => {
    const mockAudit: RealExecutableModuleAudit[] = [
      {
        id: '1',
        kind: 'hosts_writer',
        name: 'Hosts Writer',
        path: 'src/service/blocking/hosts/writer.ts',
        realFunctions: [
          {
            name: 'writeHosts',
            effect: 'writes_hosts',
            dangerLevel: 'critical',
            canCallInPoint16: false,
            canReferenceSymbolically: true,
            candidateForFuturePoint: true,
            requiredPreconditions: [],
            risks: []
          }
        ],
        warnings: [],
        confidence: 1
      }
    ]

    const report = runRealActivationRiskEngine({ moduleAudit: mockAudit })
    expect(report.status).toBe('critical')
    expect(report.risks.length).toBeGreaterThan(0)
    const blocks = report.risks.some(r => r.blocksActivation)
    expect(blocks).toBe(true)
  })
})
