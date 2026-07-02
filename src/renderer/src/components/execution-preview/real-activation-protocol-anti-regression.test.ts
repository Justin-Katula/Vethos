import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('real-activation-protocol-anti-regression', () => {
  const libDir = path.resolve(__dirname, '../../lib')
  const sharedDir = path.resolve(__dirname, '../../../../shared')
  const uiDir = __dirname

  // Helper to list files matching a prefix or pattern
  function getSourceFiles(): string[] {
    const files: string[] = []

    // Lib files
    const libFiles = fs.readdirSync(libDir)
    for (const f of libFiles) {
      if (f.startsWith('real-activation') || f === 'minimal-execution-boundary-builder.ts') {
        files.push(path.join(libDir, f))
      }
    }

    // Shared files
    const sharedFiles = fs.readdirSync(sharedDir)
    for (const f of sharedFiles) {
      if (f.startsWith('real-activation')) {
        files.push(path.join(sharedDir, f))
      }
    }

    // UI files
    const uiFiles = fs.readdirSync(uiDir)
    for (const f of uiFiles) {
      if (f.startsWith('RealActivation') && f.endsWith('.tsx')) {
        files.push(path.join(uiDir, f))
      }
    }

    return files
  }

  it('scans all real-activation files to ensure zero forbidden imports or calls', () => {
    const files = getSourceFiles()
    expect(files.length).toBeGreaterThan(0)

    // Separate checks for imports and runtime code
    const forbiddenImports = [
      /import.*\bstore\b/i,
      /import.*\bSessionManager\b/,
      /import.*\bstartSession\b/,
      /import.*\bstopSession\b/,
      /import.*\bhydrateFromDisk\b/,
      /import.*\bBrowserWindow\b/,
      /import.*electron/i,
      /import.*\bipcRenderer\b/,
      /import.*\bipcMain\b/,
      /import.*hosts/i,
      /import.*firewall/i,
      /import.*netsh/i,
      /import.*strict-block-window/i,
      /import.*process-window-probe/i,
      /import.*watcher/i,
      /import.*killer/i,
      /import.*media/i,
      /import.*provider/i,
      /import.*qa/i,
      /import.*preview/i,
      /import.*manual-review/i
    ]

    const forbiddenRuntimeTokens = [
      /\blocalStorage\b/,
      /\bchild_process\b/,
      /\bspawn\b/,
      /\bexec\b/,
      /\bnetsh\b/,
      /\bwriteFile\b/,
      /writeFileSync/
    ]

    for (const file of files) {
      // Don't scan test files or directories
      if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) {
        continue
      }
      
      const content = fs.readFileSync(file, 'utf-8')
      const lines = content.split('\n')

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        // Allow imports of models/flags of real-activation itself
        if (line.includes('real-activation-protocol') || line.includes('real-activation-view-model') || line.includes('real-activation-ui-guards')) {
          continue
        }

        // Exclude comments
        if (line.trim().startsWith('//') || line.trim().startsWith('*') || line.trim().startsWith('/*')) {
          continue
        }

        // Check imports
        if (line.trim().startsWith('import')) {
          for (const pattern of forbiddenImports) {
            if (pattern.test(line)) {
              throw new Error(`VIOLATION: Forbidden import pattern "${pattern.source}" found in ${path.basename(file)} at line ${i + 1}: ${line}`)
            }
          }
        } else {
          // Check runtime tokens
          for (const pattern of forbiddenRuntimeTokens) {
            if (pattern.test(line)) {
              // Exclude references to filenames like netsh.ts
              if (pattern.source.includes('netsh') && line.includes('netsh.ts')) {
                continue
              }
              throw new Error(`VIOLATION: Forbidden runtime pattern "${pattern.source}" found in ${path.basename(file)} at line ${i + 1}: ${line}`)
            }
          }
        }
      }
    }
  })

  it('scans ActivationBridgePanel.tsx for safety conformance', () => {
    const filePath = path.resolve(__dirname, 'ActivationBridgePanel.tsx')
    const content = fs.readFileSync(filePath, 'utf-8')

    // 1. No execute/activate/apply/start/block/request permission/autofix buttons
    const forbiddenPatterns = [
      /<button[^>]*>\s*(activer|appliquer|démarrer|bloquer|exécuter|auto-fix|demander permission|start|apply|activate|execute|autofix|request)\s*<\/button>/i,
      /onClick=\{.*(handle|apply|start|activate|execute|autofix|request)/i
    ]

    for (const pattern of forbiddenPatterns) {
      if (pattern.test(content)) {
        throw new Error(`Forbidden button or click handler pattern found in ActivationBridgePanel.tsx: ${pattern.source}`)
      }
    }

    // 2. No localStorage
    expect(content).not.toContain('localStorage')

    // 3. No direct stores
    expect(content).not.toContain('useTasksStore')
    expect(content).not.toContain('useSessionStore')

    // 4. No provider or QA runner references in imports
    expect(content).not.toContain('ExecutionPreviewProvider')
    expect(content).not.toContain('runExecutionPreviewQa')

    // 5. No persistence or system calls
    expect(content).not.toContain('fs.write')
    expect(content).not.toContain('child_process')
  })
})
