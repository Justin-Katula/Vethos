import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('ExecutionPreview UI Anti-Regression', () => {
  it('does not import real domain stores or muscles in UI components', () => {
    const forbiddenImports = [
      'TaskStore',
      'SessionStore',
      'PlanningStore',
      'BlockingStore',
      'manager.ts',
      'strict-block-window',
      'process-window-probe',
      'hosts writer',
      'firewall/netsh',
      'BrowserWindow',
      'overlay',
      'process watcher',
      'media control',
      'startSession',
      'stopSession',
      'hydrateFromDisk',
      'createSessionManager'
    ]

    const directoriesToCheck = [
      path.join(__dirname, '../../lib'),
      path.join(__dirname, '../execution-preview')
    ]

    for (const dir of directoriesToCheck) {
      if (!fs.existsSync(dir)) continue
      
      const files = fs.readdirSync(dir)
      
      for (const file of files) {
        if (!file.includes('execution-preview')) continue
        if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue
        
        const content = fs.readFileSync(path.join(dir, file), 'utf8')
        
        for (const forbidden of forbiddenImports) {
          const regex = new RegExp(`import.*${forbidden}`, 'i')
          const isImported = regex.test(content)
          expect(isImported).toBe(false)
        }
      }
    }
  })
})
