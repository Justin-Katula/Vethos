import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useExecutionPreviewDataProvider } from './useExecutionPreviewDataProvider'

// Mock des stores de façon rudimentaire (sans Zustand complet pour le test unitaire du hook)
vi.mock('../store/tasks.store', () => ({
  useTasksStore: { getState: vi.fn(() => ({ tasks: [], userId: 'mock-user' })) }
}))
vi.mock('../store/levels.store', () => ({
  useLevelsStore: { getState: vi.fn(() => ({ objectives: [] })) }
}))
vi.mock('../store/schedule.store', () => ({
  useScheduleStore: { getState: vi.fn(() => ({ rules: [], entries: [] })) }
}))
vi.mock('../store/blocking.store', () => ({
  useBlockingStore: { getState: vi.fn(() => ({ state: { profiles: [] }, active: null })) }
}))
vi.mock('../store/registry.store', () => ({
  useRegistryStore: { getState: vi.fn(() => ({ items: [] })) }
}))
vi.mock('../store/settings.store', () => ({
  useSettingsStore: { getState: vi.fn(() => ({ userId: 'mock-user', sessionRulesEnabled: true })) }
}))

describe('useExecutionPreviewDataProvider', () => {
  it('starts in idle state', () => {
    const { result } = renderHook(() => useExecutionPreviewDataProvider())
    expect(result.current.state.status).toBe('idle')
    expect(result.current.canApplyPreview).toBe(false)
  })

  it('generates a preview manually', () => {
    const { result } = renderHook(() => useExecutionPreviewDataProvider())
    
    act(() => {
      result.current.generatePreview()
    })

    // Because it's sync in our current mock (buildExecutionPreviewFromReadOnlyData is sync)
    // the state should quickly transition to something like partial/ready_with_warnings.
    expect(result.current.state.status).not.toBe('idle')
    expect(result.current.state.status).not.toBe('building')
    expect(result.current.canApplyPreview).toBe(false)
  })

  it('clears preview locally', () => {
    const { result } = renderHook(() => useExecutionPreviewDataProvider())
    
    act(() => {
      result.current.generatePreview()
    })
    
    act(() => {
      result.current.clearPreview()
    })

    expect(result.current.state.status).toBe('idle')
  })
})
