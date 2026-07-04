import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import fg from 'fast-glob'

describe('manual-review-gate-anti-regression', () => {
  it('enforces strict boundaries for all manual review files', async () => {
    // Collect all manual review files (lib + components)
    const libDir = path.resolve(__dirname, '../../lib')
    const componentsDir = path.resolve(__dirname)

    const libFiles = fg.sync('manual-review-*.ts', { cwd: libDir, absolute: true })
    const compFiles = fg.sync('ManualReview*.tsx', { cwd: componentsDir, absolute: true })

    const allFiles = [...libFiles, ...compFiles]

    // We must find at least the ones we created
    expect(allFiles.length).toBeGreaterThan(5)

    const forbiddenImports = [
      { regex: /useTasks?Store/, name: 'TaskStore' },
      { regex: /useSessionStore/, name: 'SessionStore' },
      { regex: /createSessionManager/, name: 'createSessionManager' },
      { regex: /startSession/, name: 'startSession' },
      { regex: /generatePreview/, name: 'generatePreview' },
      { regex: /buildExecutionPreviewFromReadOnlyData/, name: 'buildExecutionPreviewFromReadOnlyData' },
      { regex: /runExecutionPreviewQa/, name: 'runExecutionPreviewQa' },
      { regex: /localStorage/, name: 'localStorage' },
      { regex: /netsh|firewall|hosts|process-window-probe/, name: 'muscles' }
    ]

    for (const file of allFiles) {
      // Don't test the test files themselves for these strict rules as they might mention the words
      if (file.includes('.test.')) continue

      const content = fs.readFileSync(file, 'utf-8')

      for (const rule of forbiddenImports) {
        if (rule.regex.test(content)) {
          throw new Error(`File ${path.basename(file)} violates anti-regression rule: contains ${rule.name}`)
        }
      }

      // Check dangerous flags are strictly assigned false and never true
      // (Exception: type definitions and tests might have 'false')
      // So we check we don't assign `true` to any dangerous flag.
      const dangerousAssignTrue = [
        /canCreateSessions\s*:\s*true/,
        /canStartSessions\s*:\s*true/,
        /canApplyPlanning\s*:\s*true/,
        /canApplyBlocking\s*:\s*true/,
        /canCompleteTasks\s*:\s*true/,
        /canPersistReview\s*:\s*true/,
        /canProceedToActivationBridge\s*:\s*true/,
        /canApplyAnything\s*:\s*true/
      ]

      for (const danger of dangerousAssignTrue) {
        if (danger.test(content)) {
          throw new Error(`File ${path.basename(file)} dangerously assigns a forbidden execution flag to true!`)
        }
      }
    }
  })
})
