import { describe, it, expect } from 'vitest'
import { sanitizeExecutionPreviewSnapshot } from './execution-preview-snapshot-sanitizer'
import type { ExecutionPreviewRawSnapshot } from '@shared/execution-preview-data-connector-model'

describe('execution-preview-snapshot-sanitizer', () => {
  const baseRaw: ExecutionPreviewRawSnapshot = {
    userId: 'user_123',
    tasks: [{ id: 't1' }],
    objectives: [{ id: 'o1' }],
    schedules: [{}],
    sessions: [{}],
    apps: [{}],
    sites: [{}],
    sourceReports: [],
    capturedAt: '2025-01-01T00:00:00Z',
    warnings: [],
    confidence: 100,
  }

  it('sanitizes a healthy snapshot', () => {
    const san = sanitizeExecutionPreviewSnapshot({ rawSnapshot: baseRaw, dateRange: { startDate: '2025-01-01', endDate: '2025-01-02' } })
    expect(san.userId).toBe('user_123')
    expect(san.tasks.length).toBe(1)
    expect(san.warnings.length).toBe(0)
  })

  it('handles missing userId and adds warning', () => {
    const raw = { ...baseRaw, userId: undefined }
    const san = sanitizeExecutionPreviewSnapshot({ rawSnapshot: raw, dateRange: { startDate: '2025-01-01', endDate: '2025-01-02' } })
    expect(san.userId).toBe('MISSING_USER_ID')
    expect(san.confidence).toBe(0)
    expect(san.warnings.some(w => w.includes('userId est manquant'))).toBe(true)
  })

  it('generates a fallback dateRange and warns if not provided', () => {
    const san = sanitizeExecutionPreviewSnapshot({ rawSnapshot: baseRaw, now: '2025-01-01T10:00:00Z' })
    expect(san.dateRange.startDate).toBe('2025-01-01')
    expect(san.dateRange.endDate).toBe('2025-01-02')
    expect(san.warnings.some(w => w.includes('fallback utilisé'))).toBe(true)
  })

  it('filters invalid tasks and adds a warning', () => {
    const raw = { ...baseRaw, tasks: [{ id: 't1' }, null, undefined, { title: 'NoId' }] }
    const san = sanitizeExecutionPreviewSnapshot({ rawSnapshot: raw, dateRange: { startDate: '2025-01-01', endDate: '2025-01-02' } })
    expect(san.tasks.length).toBe(1)
    expect(san.warnings.some(w => w.includes('3 tâches ont été ignorées'))).toBe(true)
  })

  it('keeps an invalid date range for manual review instead of inventing dates', () => {
    const san = sanitizeExecutionPreviewSnapshot({ rawSnapshot: baseRaw, dateRange: { startDate: '2025-02-02', endDate: '2025-01-01' } })
    expect(san.dateRange).toEqual({ startDate: '2025-02-02', endDate: '2025-01-01' })
    expect(san.confidence).toBe(0)
    expect(san.warnings.some((warning) => warning.includes('examen manuel requis'))).toBe(true)
  })

  it('does not mutate the raw snapshot or invent tasks/objectives', () => {
    const raw = structuredClone(baseRaw)
    const before = structuredClone(raw)
    const san = sanitizeExecutionPreviewSnapshot({ rawSnapshot: raw, dateRange: { startDate: '2025-01-01', endDate: '2025-01-02' } })
    expect(raw).toEqual(before)
    expect(san.tasks).toEqual(baseRaw.tasks)
    expect(san.objectives).toEqual(baseRaw.objectives)
  })
})
