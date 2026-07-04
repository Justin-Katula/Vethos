import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('ExecutionPreviewQaPanel (static analysis)', () => {
  it('renders required QA data and contains NO dangerous action buttons', () => {
    const filePath = path.resolve(__dirname, 'ExecutionPreviewQaPanel.tsx')
    const content = fs.readFileSync(filePath, 'utf-8')

    // 1. Rend le score QA
    expect(content).toContain('qualityScore.status')
    expect(content).toContain('qualityScore.overall')

    // 2. Rend le mapping audit
    expect(content).toContain('mappingAudit.tasks.mappedCount')
    expect(content).toContain('mappingAudit.planning.hasScheduleData')

    // 3. Rend les recommandations / calibration
    expect(content).toContain('calibration.recommendations')

    // 4. Affiche les diagnostics en mode debug
    expect(content).toContain('diagnostics.issues')
    expect(content).toContain('debug &&')
    expect(content).toContain('Afficher')

    // 5. Ne contient aucun bouton apply/start/blocking/auto-fix et aucun handler métier
    const forbiddenPatterns: { regex: RegExp, name: string }[] = [
      { regex: /\bapply\b/i, name: 'apply' },
      { regex: /startSession/i, name: 'startSession' },
      { regex: /start session/i, name: 'start session' },
      { regex: /<button[^>]*>.*block.*<\/button>/i, name: 'block button' },
      { regex: /autofix/i, name: 'autofix' },
      { regex: /auto-fix/i, name: 'auto-fix' },
      { regex: /handle[A-Z]/, name: 'handler' }
    ]

    for (const pattern of forbiddenPatterns) {
      if (pattern.regex.test(content)) {
        throw new Error(`Forbidden pattern found: ${pattern.name}`)
      }
    }
  })
})
