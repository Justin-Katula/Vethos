import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildExecutionPreviewFromReadOnlyData } from '../lib/execution-preview-data-provider'
import { useExecutionPreviewDataProvider } from './useExecutionPreviewDataProvider'

const dangerousActions = vi.hoisted(() => ({
  markTaskCompleted: vi.fn(), saveTask: vi.fn(), saveObjective: vi.fn(), replaceAll: vi.fn(),
  activate: vi.fn(), recordOutcome: vi.fn(), classifyItem: vi.fn(), updateSettings: vi.fn(), recordEvent: vi.fn(),
}))

vi.mock('../lib/execution-preview-data-provider', () => ({ buildExecutionPreviewFromReadOnlyData: vi.fn() }))
vi.mock('../store/tasks.store', () => ({ useTasksStore: { getState: vi.fn(() => ({ tasks: [], userId: 'mock-user', loaded: true, ...dangerousActions })) } }))
vi.mock('../store/levels.store', () => ({ useLevelsStore: { getState: vi.fn(() => ({ objectives: [], loaded: true, ...dangerousActions })) } }))
vi.mock('../store/schedule.store', () => ({ useScheduleStore: { getState: vi.fn(() => ({ rules: [], entries: [], loaded: true, ...dangerousActions })) } }))
vi.mock('../store/session-v2.store', () => ({ useSessionV2Store: { getState: vi.fn(() => ({ records: [], loaded: true, ...dangerousActions })) } }))
vi.mock('../store/registry.store', () => ({ useRegistryStore: { getState: vi.fn(() => ({ items: [], loaded: true, ...dangerousActions })) } }))
vi.mock('../store/settings.store', () => ({ useSettingsStore: { getState: vi.fn(() => ({ userId: 'mock-user', loaded: true, sessionRulesEnabled: true, ...dangerousActions })) } }))
vi.mock('../store/user-model.store', () => ({ useUserModelStore: { getState: vi.fn(() => ({ model: null, loaded: true, ...dangerousActions })) } }))

describe('useExecutionPreviewDataProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(buildExecutionPreviewFromReadOnlyData).mockReturnValue({
      status: 'partial', warnings: ['partial'], errors: [], canGeneratePreview: true,
      canApplyPreview: false, confidence: 60,
    })
  })

  it('starts idle with canApplyPreview=false', () => {
    const { result } = renderHook(() => useExecutionPreviewDataProvider())
    expect(result.current.state.status).toBe('idle')
    expect(result.current.canApplyPreview).toBe(false)
  })

  it('never builds automatically during render', () => {
    renderHook(() => useExecutionPreviewDataProvider())
    expect(buildExecutionPreviewFromReadOnlyData).not.toHaveBeenCalled()
  })

  it('generates only after the manual callback', () => {
    const { result } = renderHook(() => useExecutionPreviewDataProvider())
    act(() => result.current.generatePreview())
    expect(buildExecutionPreviewFromReadOnlyData).toHaveBeenCalledTimes(1)
    expect(result.current.state.status).toBe('partial')
  })

  it('clears only local state', () => {
    const { result } = renderHook(() => useExecutionPreviewDataProvider())
    act(() => result.current.generatePreview())
    act(() => result.current.clearPreview())
    expect(result.current.state.status).toBe('idle')
    expect(buildExecutionPreviewFromReadOnlyData).toHaveBeenCalledTimes(1)
  })

  it('never calls a store action', () => {
    const { result } = renderHook(() => useExecutionPreviewDataProvider())
    act(() => result.current.generatePreview())
    act(() => result.current.clearPreview())
    for (const action of Object.values(dangerousActions)) expect(action).not.toHaveBeenCalled()
  })
})
