import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('RealActivationProtocolPanel (static analysis)', () => {
  it('meets all security constraints and UI requirements', () => {
    const filePath = path.resolve(__dirname, 'RealActivationProtocolPanel.tsx')
    const content = fs.readFileSync(filePath, 'utf-8')

    // 1. Component exists (name)
    expect(content).toContain('export const RealActivationProtocolPanel')

    // 2. Contains subcomponents
    expect(content).toContain('RealActivationBlockedControls')
    expect(content).toContain('RealActivationPermissionMatrix')
    expect(content).toContain('RealActivationRiskList')
    expect(content).toContain('RealActivationBoundarySummary')

    // 3. No dangerous button (execute/activate/apply/start/block/autofix/request permission)
    const forbiddenPatterns = [
      /<button[^>]*>\s*(activer|appliquer|démarrer|bloquer|exécuter|auto-fix|demander permission|start|apply|activate|execute|autofix|request)\s*<\/button>/i,
      /onClick=\{.*(handle|apply|start|activate|execute|autofix|request)/i
    ]

    for (const pattern of forbiddenPatterns) {
      if (pattern.test(content)) {
        throw new Error(`Forbidden pattern found in UI: ${pattern.source}`)
      }
    }

    // 4. No direct imports of business engines
    expect(content).not.toContain('useTasksStore')
    expect(content).not.toContain('useSessionStore')
    expect(content).not.toContain('manager.ts')
    
    // 5. No persistence/localStorage
    expect(content).not.toContain('localStorage')
    expect(content).not.toContain('save')

    // 6. No dangerous handler defined
    expect(content).not.toContain('handleActivate')
    expect(content).not.toContain('applyDraft')

    // 7. Shows protocol status / audit only text
    expect(content).toContain('Audit seul')
  })
})
