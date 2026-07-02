import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import fg from 'fast-glob'

describe('activation-bridge-anti-regression', () => {
  it('enforces strict boundaries for all activation bridge files', async () => {
    // Collect all activation-bridge files
    const libDir = path.resolve(__dirname, '../../lib')
    const componentsDir = path.resolve(__dirname)

    const libFiles = fg.sync('activation-*.ts', { cwd: libDir, absolute: true })
    const compFiles = fg.sync('Activation*.tsx', { cwd: componentsDir, absolute: true })
    const manualReviewGateFile = path.resolve(componentsDir, 'ManualReviewGatePanel.tsx')

    const allFiles = [...libFiles, ...compFiles, manualReviewGateFile]
    expect(allFiles.length).toBeGreaterThan(6)

    const forbiddenImports = [
      { regex: /useTasks?Store/, name: 'TaskStore' },
      { regex: /useSessionStore/, name: 'SessionStore' },
      { regex: /usePlanningStore/, name: 'PlanningStore' },
      { regex: /useBlockingStore/, name: 'BlockingStore' },
      { regex: /createSessionManager/, name: 'createSessionManager' },
      { regex: /\bmanager\.ts\b/, name: 'manager.ts' },
      { regex: /startSession/, name: 'startSession' },
      { regex: /stopSession/, name: 'stopSession' },
      { regex: /hydrateFromDisk/, name: 'hydrateFromDisk' },
      { regex: /generatePreview/, name: 'generatePreview' },
      { regex: /buildExecutionPreviewFromReadOnlyData/, name: 'buildExecutionPreviewFromReadOnlyData' },
      { regex: /buildExecutionPreviewPlanV2/, name: 'buildExecutionPreviewPlanV2' },
      { regex: /runExecutionPreviewQa/, name: 'runExecutionPreviewQa' },
      { regex: /applyManualReviewDecisionToDraft/, name: 'applyManualReviewDecisionToDraft' },
      { regex: /localStorage/, name: 'localStorage' },
      { regex: /netsh|firewall|hosts|process-window-probe|strict-block-window|media/, name: 'muscles natifs' },
      { regex: /BrowserWindow/, name: 'BrowserWindow' }
    ]

    for (const file of allFiles) {
      // Skip test files for word occurrence checks since tests might mention forbidden words in assertions
      if (file.includes('.test.')) continue

      const content = fs.readFileSync(file, 'utf-8')

      for (const rule of forbiddenImports) {
        if (rule.name === 'applyManualReviewDecisionToDraft' && file.includes('ManualReviewGatePanel.tsx')) {
          continue // ManualReviewGatePanel is explicitly allowed to call this as it manages the manual review
        }
        if (rule.regex.test(content)) {
          throw new Error(`File ${path.basename(file)} violates anti-regression rule: contains ${rule.name}`)
        }
      }

      // Check dangerous flags are strictly assigned false and never true
      // The regex looks for true assigned to dangerous flags
      const dangerousAssignTrue = [
        /canCreateSessions(Now)?\s*:\s*true/,
        /canStartSessions(Now)?\s*:\s*true/,
        /canApplyPlanning(Now)?\s*:\s*true/,
        /canEnableBlocking(Now)?\s*:\s*true/,
        /canCompleteTasks(Now)?\s*:\s*true/,
        /canPersistContract(Now)?\s*:\s*true/,
        /canActivateNow\s*:\s*true/,
        /canProceedToRealActivation\s*:\s*true/,
        /canApplyAnythingNow\s*:\s*true/,
        /canExecuteNow\s*:\s*true/
      ]

      for (const danger of dangerousAssignTrue) {
        if (danger.test(content)) {
          throw new Error(`File ${path.basename(file)} dangerously assigns a forbidden execution flag to true!`)
        }
      }

      // Check for any UI active buttons in TSX files
      if (file.endsWith('.tsx')) {
        const forbiddenPatterns = [
          /<button[^>]*>\s*(activer|appliquer|démarrer|bloquer|exécuter|auto-fix|start|apply|activate|execute)\s*<\/button>/i,
          /onClick=\{.*(handle|apply|start|activate|execute)/i
        ]

        for (const pattern of forbiddenPatterns) {
          if (pattern.test(content)) {
            throw new Error(`Forbidden active button pattern found in UI ${path.basename(file)}: ${pattern.source}`)
          }
        }
      }
    }
  })
})
