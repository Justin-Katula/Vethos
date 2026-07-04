import { describe, it, expect } from 'vitest'
import { resolveExecutionPreviewDependencies } from './execution-preview-dependency-resolver'
import type { ExecutionPreviewAdaptedInput } from './execution-preview-input-adapter'

describe('execution-preview-dependency-resolver', () => {
  const baseInput: ExecutionPreviewAdaptedInput = {
    userId: 'u1',
    dateRange: { startDate: '2026-06-26T00:00:00Z', endDate: '2026-06-26T23:59:59Z' },
    objectiveModelsV2: [],
    taskModelsV2: [],
    priorityScoresV2: [],
    sessionPlansV2: [],
    runtimeCoordinatorPlansV2: [],
    warnings: [],
    confidence: 100
  }

  it('marks all dependencies as missing if empty', () => {
    const reports = resolveExecutionPreviewDependencies(baseInput)
    expect(reports.every(r => r.status === 'missing')).toBe(true)
  })

  it('detects missing planningContext', () => {
    const reports = resolveExecutionPreviewDependencies(baseInput)
    const pc = reports.find(r => r.name === 'planning_context')
    expect(pc?.status).toBe('missing')
  })

  it('detects available dependencies', () => {
    const reports = resolveExecutionPreviewDependencies({
      ...baseInput,
      planningContextV2: {},
      placementPlanV2: {},
      sessionPlansV2: [{ id: 's1' }],
      runtimeCoordinatorPlansV2: [{ id: 'rc1' }]
    })
    
    expect(reports.find(r => r.name === 'planning_context')?.status).toBe('available')
    expect(reports.find(r => r.name === 'placement_plan')?.status).toBe('available')
    expect(reports.find(r => r.name === 'session_plans')?.status).toBe('available')
    expect(reports.find(r => r.name === 'runtime_coordinator_plans')?.status).toBe('available')
  })
})
