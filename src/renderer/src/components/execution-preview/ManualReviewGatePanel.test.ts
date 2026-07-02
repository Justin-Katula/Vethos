import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('ManualReviewGatePanel (static analysis)', () => {
  it('meets all security constraints and UI requirements', () => {
    const filePath = path.resolve(__dirname, 'ManualReviewGatePanel.tsx')
    const content = fs.readFileSync(filePath, 'utf-8')

    // 1. composant existe (nom)
    expect(content).toContain('export const ManualReviewGatePanel')

    // 2. contient contrôles
    expect(content).toContain('ManualReviewDecisionControls')
    expect(content).toContain('approve_preview_in_principle')

    // 3. aucun bouton apply/start/block/autofix
    const forbiddenPatterns = [
      /\bapply\b/i,
      /\bstart session\b/i,
      /startSession/i,
      /\bblock now\b/i,
      /\bautofix\b/i,
      /\bauto-fix\b/i
    ]

    for (const pattern of forbiddenPatterns) {
      if (pattern.test(content)) {
        throw new Error(`Forbidden pattern found in UI: ${pattern.source}`)
      }
    }

    // 4. aucun import store
    expect(content).not.toContain('useTaskStore')
    expect(content).not.toContain('useSessionStore')

    // 5. aucun localStorage
    expect(content).not.toContain('localStorage')

    // 6. aucun handler métier dangereux
    expect(content).not.toContain('handleApply')
    expect(content).not.toContain('buildRealPlan')

    // 7. indique clairement que l'approbation est en principe seulement
    expect(content).toContain('en principe seulement')
  })
})
