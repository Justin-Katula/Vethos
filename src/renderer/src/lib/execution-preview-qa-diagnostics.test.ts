import { describe, it, expect } from 'vitest'
import { runExecutionPreviewQaDiagnostics } from './execution-preview-qa-diagnostics'

describe('execution-preview-qa-diagnostics', () => {
  it('detects canProceedToActivationPlanning is true', () => {
    const diag = runExecutionPreviewQaDiagnostics({
      qaReport: { canProceedToActivationPlanning: true as boolean }
    })
    
    expect(diag.issues.some(i => i.severity === 'critical')).toBe(true)
    expect(diag.status).toBe('critical')
  })

  it('detects missing quality score', () => {
    const diag = runExecutionPreviewQaDiagnostics({})
    expect(diag.issues.some(i => i.message.includes('missing'))).toBe(true)
  })
})
