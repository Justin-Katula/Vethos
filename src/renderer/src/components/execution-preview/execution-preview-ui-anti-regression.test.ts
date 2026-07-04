import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '../../../../..')
const point11Files = [
  'src/renderer/src/lib/execution-preview-view-model.ts',
  'src/renderer/src/lib/execution-preview-ui-guards.ts',
  'src/renderer/src/lib/execution-preview-empty-state.ts',
  'src/renderer/src/components/execution-preview/ExecutionPreviewPanel.tsx',
  'src/renderer/src/components/execution-preview/ExecutionPreviewReadinessBanner.tsx',
  'src/renderer/src/components/execution-preview/ExecutionPreviewSafetyBanner.tsx',
  'src/renderer/src/components/execution-preview/ExecutionPreviewDayCard.tsx',
  'src/renderer/src/components/execution-preview/ExecutionPreviewBlockCard.tsx',
  'src/renderer/src/components/execution-preview/ExecutionPreviewWarningList.tsx',
  'src/renderer/src/components/execution-preview/ExecutionPreviewDiagnosticsPanel.tsx',
  'src/renderer/src/components/execution-preview/ExecutionPreviewActions.tsx',
]
const source = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('ExecutionPreview UI anti-regression', () => {
  it('imports no store, session manager or native muscle', () => {
    const all = point11Files.map(source).join('\n')
    expect(all).not.toMatch(/from ['"][^'"]*store\//u)
    expect(all).not.toMatch(/createSessionManager|manager\.ts|strict-block-window|process-window-probe|hosts|firewall|netsh|BrowserWindow|overlay|media-controls/iu)
  })

  it('contains no real mutation or pipeline rebuild call', () => {
    const all = point11Files.map(source).join('\n')
    expect(all).not.toMatch(/\b(?:startSession|markTaskCompleted|setRemainingMinutes|buildPlacementPlanV2|buildSessionPlanV2|buildRuntimeCoordinatorPlanV2|buildExecutionPreviewPlanV2)\s*\(/u)
  })

  it('keeps rebuild_proposed and rejects the retired shadow vocabulary', () => {
    const all = point11Files.map(source).join('\n')
    expect(all).toContain('rebuild_proposed')
    expect(all).not.toContain('rebuild_shadow')
  })

  it('contains none of the misleading product phrases', () => {
    const all = point11Files.map(source).join('\n')
    for (const phrase of ['Tout est prêt pour application automatique', 'Clique pour appliquer', 'Démarrer maintenant']) expect(all).not.toContain(phrase)
  })

  it('rebuild_proposed ne déclenche que la reconstruction légère (jamais les builders lourds)', () => {
    // A.1 — Garantie explicite Point 11.11 : l'action rebuild_proposed, quel que soit
    // son nom, n'appelle QUE la reconstruction de ExecutionPreviewPlanV2 depuis les
    // inputs déjà disponibles — jamais les builders lourds (placement, sessions,
    // runtime coordination). On vérifie sur le composant Actions et le view-model.
    const actionsSource = source('src/renderer/src/components/execution-preview/ExecutionPreviewActions.tsx')
    const viewModelSource = source('src/renderer/src/lib/execution-preview-view-model.ts')
    // Le composant Actions ne référence aucun builder lourd.
    expect(actionsSource).not.toMatch(/buildPlacementPlanV2|buildSessionPlanV2|buildRuntimeCoordinatorPlanV2/u)
    // L'action rebuild_proposed est créée enabled:false dans le view-model (pas de handler).
    expect(viewModelSource).toContain('rebuild_proposed')
    expect(viewModelSource).toMatch(/rebuild_proposed[\s\S]*enabled:\s*false/u)
    // Aucun onClick/handler n'est attaché aux boutons du composant Actions.
    expect(actionsSource).not.toMatch(/onClick/u)
  })
})
