import { describe, expect, it, vi } from 'vitest'
import { buildExecutionPreviewFromReadOnlyData } from './execution-preview-data-provider'

const input = {
  userId: 'user-1',
  tasks: [], objectives: [], schedules: [], sessions: [], apps: [], sites: [], settings: {},
  dateRange: { startDate: '2026-07-03', endDate: '2026-07-04' },
  now: '2026-07-03T12:00:00.000Z',
  idFactory: () => 'preview-id',
}

describe('buildExecutionPreviewFromReadOnlyData', () => {
  it('builds through snapshot, sanitizer and pipeline', () => {
    const result = buildExecutionPreviewFromReadOnlyData(input)
    expect(result.status).not.toBe('idle')
    expect(result.lastBuildAt).toBe(input.now)
    expect(result.canApplyPreview).toBe(false)
  })

  it('keeps canApplyPreview=false even with engineV2Execution=true', () => {
    const result = buildExecutionPreviewFromReadOnlyData({ ...input, settings: { engineV2Execution: true } })
    expect(result.canApplyPreview).toBe(false)
  })

  it('returns unsafe for a missing userId without throwing', () => {
    const result = buildExecutionPreviewFromReadOnlyData({ ...input, userId: undefined })
    expect(result.status).toBe('unsafe')
    expect(result.canApplyPreview).toBe(false)
  })

  it('does not mutate its input', () => {
    const mutable = { ...input, idFactory: undefined, tasks: [{ id: 'task-1', title: 'T', deadline: '2026-07-04' }] }
    const before = structuredClone(mutable)
    buildExecutionPreviewFromReadOnlyData(mutable)
    expect(mutable).toEqual(before)
  })

  it('rejects unnecessary sensitive data without echoing its value', () => {
    const result = buildExecutionPreviewFromReadOnlyData({ ...input, auth: { accessToken: 'private-value' } })
    expect(result.status).toBe('unsafe')
    expect(result.previewPlan).toBeUndefined()
    expect(result.errors.join(' ')).not.toContain('private-value')
  })

  it('never writes localStorage', () => {
    const write = vi.fn()
    vi.stubGlobal('localStorage', { setItem: write })
    buildExecutionPreviewFromReadOnlyData(input)
    expect(write).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
