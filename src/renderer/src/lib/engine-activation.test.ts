import { describe, it, expect, vi } from 'vitest'
import { getEngineFlags, withV1Fallback, withV1FallbackSync } from './engine-activation'
import { DEFAULT_ENGINE_FLAGS } from '../../../shared/engine-results'
import { useToastStore } from '../store/toast.store'

// Mock toast store
vi.mock('../store/toast.store', () => {
  const push = vi.fn()
  return {
    useToastStore: {
      getState: () => ({ push })
    }
  }
})

describe('engine-activation', () => {
  describe('getEngineFlags', () => {
    it('should return default flags when settings are empty', () => {
      const flags = getEngineFlags({})
      expect(flags).toEqual(DEFAULT_ENGINE_FLAGS)
    })

    it('should override defaults with settings toggles', () => {
      const flags = getEngineFlags({
        engineV2Placement: false,
        engineV2Blocking: false,
      })
      expect(flags.newPriorityControlsPlacement).toBe(false)
      expect(flags.newSessionPlanControlsBlocking).toBe(false)
      expect(flags.newPriorityControlsSorting).toBe(true) // remains default
    })
  })

  describe('withV1Fallback (async)', () => {
    it('should return V2 result when V2 succeeds and is valid', async () => {
      const v2 = vi.fn().mockResolvedValue('v2-success')
      const v1 = vi.fn().mockResolvedValue('v1-success')
      
      const res = await withV1Fallback({
        v2, v1, label: 'test-async-success'
      })

      expect(res).toBe('v2-success')
      expect(v2).toHaveBeenCalledTimes(1)
      expect(v1).not.toHaveBeenCalled()
    })

    it('should fallback to V1 and push toast when V2 throws', async () => {
      const v2 = vi.fn().mockRejectedValue(new Error('v2-failure'))
      const v1 = vi.fn().mockResolvedValue('v1-success')
      const onError = vi.fn()

      const res = await withV1Fallback({
        v2, v1, label: 'test-async-failure', onError
      })

      expect(res).toBe('v1-success')
      expect(v2).toHaveBeenCalledTimes(1)
      expect(v1).toHaveBeenCalledTimes(1)
      expect(onError).toHaveBeenCalled()
      expect(useToastStore.getState().push).toHaveBeenCalled()
    })

    it('should fallback to V1 and push toast when V2 fails validation', async () => {
      const v2 = vi.fn().mockResolvedValue('invalid-val')
      const v1 = vi.fn().mockResolvedValue('v1-success')
      const validate = (val: string) => val === 'valid-val'

      const res = await withV1Fallback({
        v2, v1, label: 'test-async-validation', validate
      })

      expect(res).toBe('v1-success')
      expect(v2).toHaveBeenCalledTimes(1)
      expect(v1).toHaveBeenCalledTimes(1)
    })
  })

  describe('withV1FallbackSync (sync)', () => {
    it('should return V2 result when V2 succeeds and is valid', () => {
      const v2 = vi.fn().mockReturnValue('v2-success')
      const v1 = vi.fn().mockReturnValue('v1-success')
      
      const res = withV1FallbackSync({
        v2, v1, label: 'test-sync-success'
      })

      expect(res).toBe('v2-success')
      expect(v2).toHaveBeenCalledTimes(1)
      expect(v1).not.toHaveBeenCalled()
    })

    it('should fallback to V1 when V2 throws', () => {
      const v2 = vi.fn(() => { throw new Error('v2-failure') })
      const v1 = vi.fn().mockReturnValue('v1-success')
      const onError = vi.fn()

      const res = withV1FallbackSync({
        v2, v1, label: 'test-sync-failure', onError
      })

      expect(res).toBe('v1-success')
      expect(v2).toHaveBeenCalledTimes(1)
      expect(v1).toHaveBeenCalledTimes(1)
      expect(onError).toHaveBeenCalled()
    })

    it('should fallback to V1 when V2 fails validation', () => {
      const v2 = vi.fn().mockReturnValue('invalid-val')
      const v1 = vi.fn().mockReturnValue('v1-success')
      const validate = (val: string) => val === 'valid-val'

      const res = withV1FallbackSync({
        v2, v1, label: 'test-sync-validation', validate
      })

      expect(res).toBe('v1-success')
      expect(v2).toHaveBeenCalledTimes(1)
      expect(v1).toHaveBeenCalledTimes(1)
    })
  })
})
