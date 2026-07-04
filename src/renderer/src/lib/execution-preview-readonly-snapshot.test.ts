import { describe, it, expect } from 'vitest'
import { buildExecutionPreviewRawSnapshot } from './execution-preview-readonly-snapshot'

describe('execution-preview-readonly-snapshot', () => {
  it('converts absent arrays to empty arrays', () => {
    const raw = buildExecutionPreviewRawSnapshot({})
    expect(raw.tasks).toEqual([])
    expect(raw.objectives).toEqual([])
    expect(raw.schedules).toEqual([])
    expect(raw.sessions).toEqual([])
    expect(raw.apps).toEqual([])
    expect(raw.sites).toEqual([])
  })

  it('does not mutate inputs', () => {
    const inputTasks = [{ id: '1' }]
    const raw = buildExecutionPreviewRawSnapshot({ tasks: inputTasks })
    expect(raw.tasks).not.toBe(inputTasks)
    expect(raw.tasks).toEqual(inputTasks)
  })

  it('adds warnings if userId is absent', () => {
    const raw = buildExecutionPreviewRawSnapshot({})
    expect(raw.warnings).toContain("Le 'userId' n'est pas fourni. Le snapshot risque d'être rejeté par le sanitizer.")
  })

  it('uses now parameter for capturedAt', () => {
    const now = '2025-01-01T00:00:00Z'
    const raw = buildExecutionPreviewRawSnapshot({ now })
    expect(raw.capturedAt).toBe(now)
  })
})
