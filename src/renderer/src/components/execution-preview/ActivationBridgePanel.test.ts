import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('ActivationBridgePanel (static analysis)', () => {
  it('meets all security constraints and UI requirements', () => {
    const filePath = path.resolve(__dirname, 'ActivationBridgePanel.tsx')
    const content = fs.readFileSync(filePath, 'utf-8')

    // 1. composant existe (nom)
    expect(content).toContain('export const ActivationBridgePanel')

    // 2. contient affichage preconditions et actions
    expect(content).toContain('ActivationPreconditionList')
    expect(content).toContain('ActivationBlockedActions')

    // 3. aucun bouton dangereux (activate/apply/start/block/execute/autofix)
    const forbiddenPatterns = [
      /<button[^>]*>\s*(activer|appliquer|démarrer|bloquer|exécuter|auto-fix|start|apply|activate|execute)\s*<\/button>/i,
      /onClick=\{.*(handle|apply|start|activate|execute)/i
    ]

    for (const pattern of forbiddenPatterns) {
      if (pattern.test(content)) {
        throw new Error(`Forbidden pattern found in UI: ${pattern.source}`)
      }
    }

    // 4. aucun import métier direct
    expect(content).not.toContain('useTasksStore')
    expect(content).not.toContain('useSessionStore')
    expect(content).not.toContain('manager.ts')
    
    // 5. aucune persistance/localStorage
    expect(content).not.toContain('localStorage')
    expect(content).not.toContain('save')

    // 6. Aucun handler métier n'est défini ni appelé
    expect(content).not.toContain('handleActivate')
    expect(content).not.toContain('applyDraft')

    // 7. Indique le read-only
    expect(content).toContain('Read-Only')
  })
})
