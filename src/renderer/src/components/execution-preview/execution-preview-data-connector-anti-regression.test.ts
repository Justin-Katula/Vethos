import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '../../../../..')
const pureFiles = [
  'src/shared/execution-preview-data-connector-model.ts',
  'src/renderer/src/lib/execution-preview-readonly-snapshot.ts',
  'src/renderer/src/lib/execution-preview-snapshot-sanitizer.ts',
  'src/renderer/src/lib/execution-preview-session-normalizer.ts',
  'src/renderer/src/lib/execution-preview-proposed-pipeline-runner.ts',
  'src/renderer/src/lib/execution-preview-data-provider.ts',
]
const hookFile = 'src/renderer/src/hooks/useExecutionPreviewDataProvider.ts'
const panelFile = 'src/renderer/src/components/execution-preview/ExecutionPreviewDataConnectorPanel.tsx'
const source = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('ExecutionPreview data connector anti-regression', () => {
  it('keeps every pure Point 12 file free of stores', () => {
    for (const file of pureFiles) expect(source(file), file).not.toMatch(/from ['"][^'"]*store\//u)
  })

  it('allows store imports only in the hook, never in the panel', () => {
    expect(source(hookFile)).toMatch(/store\/tasks\.store/u)
    expect(source(panelFile)).not.toMatch(/from ['"][^'"]*store\//u)
  })

  it('imports or calls no native muscle anywhere in Point 12', () => {
    const all = [...pureFiles, hookFile, panelFile].map(source).join('\n')
    for (const pattern of [
      /createSessionManager|hydrateFromDisk|strict-block-window|process-window-probe/iu,
      /hosts\/writer|firewall|netsh|BrowserWindow|process.?watcher|media.?control/iu,
      /\blocalStorage\b/u,
    ]) expect(all).not.toMatch(pattern)
  })

  it('contains no automatic generation or store action call in the hook', () => {
    const hook = source(hookFile)
    expect(hook).not.toContain('useEffect')
    for (const call of ['markTaskCompleted', 'saveTask', 'saveObjective', 'replaceAll', 'activate', 'recordOutcome', 'classifyItem', 'updateSettings', 'recordEvent']) {
      expect(hook).not.toMatch(new RegExp(`\\.${call}\\s*\\(`, 'u'))
    }
  })

  it('does not drive behavior by parsing example words', () => {
    const all = pureFiles.map(source).join('\n')
    expect(all).not.toMatch(/(?:includes|startsWith|endsWith|match|test)\s*\([^\n]*(?:examen|chapitre|youtube|discord|steam|vs code|école)/iu)
  })

  it('parcourt le dossier hooks : seul useExecutionPreviewDataProvider importe un store', () => {
    // B.7 — La couverture statique par nom est complétée par un scan dynamique du
    // dossier hooks. Tout fichier y touchant à execution-preview ne doit pas importer
    // de store (sauf le hook connu qui est le seul point de contact autorisé).
    const hooksDir = path.join(root, 'src/renderer/src/hooks')
    const hookFiles = fs.existsSync(hooksDir)
      ? fs.readdirSync(hooksDir).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))
      : []
    const previewHookFiles = hookFiles.filter((f) => {
      const content = fs.readFileSync(path.join(hooksDir, f), 'utf8')
      return /execution.?preview/u.test(content)
    })
    // Le hook connu doit apparaître dans le scan.
    expect(previewHookFiles).toContain('useExecutionPreviewDataProvider.ts')
    // Aucun autre hook lié à execution-preview ne doit importer un store.
    for (const f of previewHookFiles) {
      if (f === 'useExecutionPreviewDataProvider.ts') continue
      const content = fs.readFileSync(path.join(hooksDir, f), 'utf8')
      expect(content, `hooks/${f} ne doit pas importer de store`).not.toMatch(/from ['"][^'"]*store\//u)
    }
  })
})
