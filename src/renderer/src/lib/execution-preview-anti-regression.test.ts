import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

describe('execution-preview-anti-regression', () => {
  it('must never import real store or manager muscles', () => {
    const dir = __dirname
    const files = fs.readdirSync(dir).filter(f => f.startsWith('execution-preview-') && f.endsWith('.ts') && !f.endsWith('.test.ts'))

    const forbiddenImports = [
      'TaskStore',
      'SessionStore',
      'PlanningStore',
      'BlockingStore',
      'createSessionManager',
      'manager.ts',
      'strict-block-window',
      'process-window-probe',
      'hosts writer',
      'netsh',
      'BrowserWindow',
      'overlay',
      'process watcher',
      'media control'
    ]

    for (const file of files) {
      const content = fs.readFileSync(path.join(dir, file), 'utf-8')
      for (const forbidden of forbiddenImports) {
        const importRegex = new RegExp(`import\\s+.*${forbidden}`, 'i')
        if (importRegex.test(content)) {
          console.log(`Failed on file: ${file}, forbidden import: ${forbidden}`)
        }
        expect(importRegex.test(content)).toBe(false)
      }
    }
  })
})
