import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('execution-preview-qa-anti-regression', () => {
  it('ensures QA files do not import forbidden modules or call dangerous actions', () => {
    const qaFiles = [
      'src/shared/execution-preview-qa-model.ts',
      'src/shared/execution-preview-qa-flags.ts',
      'src/renderer/src/lib/execution-preview-mapping-audit.ts',
      'src/renderer/src/lib/execution-preview-consistency-checks.ts',
      'src/renderer/src/lib/execution-preview-calibration-engine.ts',
      'src/renderer/src/lib/execution-preview-quality-score.ts',
      'src/renderer/src/lib/execution-preview-qa-diagnostics.ts',
      'src/renderer/src/lib/execution-preview-qa-explanation.ts',
      'src/renderer/src/lib/execution-preview-qa-engine.ts',
      'src/renderer/src/components/execution-preview/ExecutionPreviewQaPanel.tsx'
    ]

    const forbiddenImports = [
      /import.*use[A-Za-z]+Store/, // No store imports
      /import.*useExecutionPreviewDataProvider/, // No Point 12 hook import
      /import.*buildExecutionPreviewFromReadOnlyData/,
      /import.*buildExecutionPreviewPlanV2/,
      /import.*SessionManager/,
      /import.*startSession/,
      /import.*manager\.ts/,
      /import.*overlay/,
      /import.*hosts/,
      /import.*firewall/,
      /import.*process-watcher/,
      /import.*BrowserWindow/,
      /import.*media-controls/
    ]

    const forbiddenCalls = [
      /generatePreview\(/,
      /buildExecutionPreviewFromReadOnlyData\(/,
      /buildExecutionPreviewPlanV2\(/,
      /localStorage\./,
      /use[A-Za-z]+Store\(\)/,
      /\.getState\(\)/
    ]

    for (const filePath of qaFiles) {
      const fullPath = path.resolve(process.cwd(), filePath)
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8')
        
        for (const pattern of forbiddenImports) {
          if (pattern.test(content)) {
            throw new Error(`File ${filePath} contains forbidden import: ${pattern}`)
          }
        }

        for (const pattern of forbiddenCalls) {
          if (pattern.test(content)) {
            throw new Error(`File ${filePath} contains forbidden call: ${pattern}`)
          }
        }
      }
    }
  })
})
