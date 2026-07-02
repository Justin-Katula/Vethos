import { describe, expect, it } from 'vitest'
import { buildAppSitePreferenceModel, getBestClassificationForContext } from './app-site-context-model'

describe('app/site context model', () => {
  it('préfère la règle de tâche à la règle globale', () => {
    const preferences = buildAppSitePreferenceModel([{ identifier:'tool.exe', kind:'app', demoted:true, usefulFor:{ standaloneTasks:['task-1'] } }], [], [], [], [], undefined, { now:'2026-07-02T00:00:00.000Z' })
    expect(getBestClassificationForContext(preferences, 'tool.exe', { taskId:'task-1' })?.classification).toBe('useful')
  })
})
