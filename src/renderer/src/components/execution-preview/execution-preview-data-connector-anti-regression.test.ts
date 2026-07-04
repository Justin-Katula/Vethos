import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('ExecutionPreview Data Connector Anti-Regression', () => {
  it('ensures pure files do not import real stores or action muscles', () => {
    const pureForbiddenImports = [
      'tasks.store',
      'levels.store',
      'schedule.store',
      'blocking.store',
      'settings.store',
      'registry.store',
      'declared-apps.store',
      'manager.ts',
      'createSessionManager',
      'startSession',
      'stopSession',
      'hydrateFromDisk',
      'strict-block-window',
      'process-window-probe',
      'hosts writer',
      'firewall/netsh',
      'BrowserWindow',
      'overlay',
      'localStorage',
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
        
        // Hooks and Panel are allowed to import read-only stores, but they MUST NOT import write muscles
        const isReactConnector = file.includes('useExecutionPreviewDataProvider') || file.includes('ExecutionPreviewDataConnectorPanel')
        
        const content = fs.readFileSync(path.join(dir, file), 'utf8')
        
        for (const forbidden of pureForbiddenImports) {
          if (isReactConnector && forbidden.includes('.store')) {
            // Connector hook is allowed to import stores to read them via getState()
            continue
          }

          const regex = new RegExp(`import.*${forbidden}`, 'i')
          const isImported = regex.test(content)
          if (isImported) {
            console.error(`Forbidden import ${forbidden} found in ${file}`)
          }
          expect(isImported).toBe(false)
        }
        
        // Add check that we don't dump the whole store into the snapshot or variables
        if (isReactConnector) {
          const regexStoreAssign = /([a-zA-Z]+Store(?:State)?(?:\.getState\(\))?)/
          // We just ensure we don't pass `use.*Store.getState()` directly to buildExecutionPreviewFromReadOnlyData
          const matches = content.match(/buildExecutionPreviewFromReadOnlyData\(\s*\{([^}]+)\}/s)
          if (matches) {
             expect(matches[1]).not.toMatch(/use[A-Za-z]+Store\.getState\(\)/)
          }
        }
      }
    }
  })
})
