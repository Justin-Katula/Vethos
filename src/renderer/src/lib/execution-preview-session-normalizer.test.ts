import { describe, expect, it } from 'vitest'
import { normalizeExecutionPreviewSessions } from './execution-preview-session-normalizer'

describe('normalizeExecutionPreviewSessions', () => {
  it('flattens runtime records without leaking the nested plan or protection data', () => {
    const sessions = normalizeExecutionPreviewSessions([{
      plan: {
        id: 'plan-1',
        targetType: 'task',
        targetId: 'task-1',
        linkedTaskId: 'task-1',
        title: 'Session utile',
        date: '2026-07-03',
        plannedStart: '09:00',
        plannedEnd: '10:00',
        protection: { blockedSites: ['sensitive.example'] },
      },
      state: 'completed',
      startedAt: '2026-07-03T09:05:00.000Z',
      endedAt: '2026-07-03T09:50:00.000Z',
      integrity: { activeDurationMinutes: 42 },
    }])

    expect(sessions).toEqual([expect.objectContaining({
      id: 'plan-1',
      targetType: 'task',
      taskId: 'task-1',
      durationMinutes: 42,
      status: 'completed',
    })])
    expect(JSON.stringify(sessions)).not.toContain('protection')
    expect(JSON.stringify(sessions)).not.toContain('sensitive.example')
  })

  it('drops nested arrays and malformed session entries', () => {
    expect(normalizeExecutionPreviewSessions([[{ id: 'nested' }], null, { status: 'active' }])).toEqual([])
  })

  it('does not mutate its input', () => {
    const input = [{ id: 'session-1', targetType: 'objective', targetId: 'objective-1' }]
    const before = structuredClone(input)
    normalizeExecutionPreviewSessions(input)
    expect(input).toEqual(before)
  })
})
