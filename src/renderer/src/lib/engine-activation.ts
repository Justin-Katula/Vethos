import { DEFAULT_ENGINE_FLAGS, EngineFlags } from '../../../shared/engine-results'
import { useToastStore } from '../store/toast.store'

export function getEngineFlags(settings: {
  engineV2Placement?: boolean
  engineV2Blocking?: boolean
  engineV2Priority?: boolean
  engineV2Completion?: boolean
  engineV2Execution?: boolean
}): EngineFlags {
  return {
    ...DEFAULT_ENGINE_FLAGS,
    newPriorityControlsPlacement: settings.engineV2Placement ?? DEFAULT_ENGINE_FLAGS.newPriorityControlsPlacement,
    newSessionPlanControlsBlocking: settings.engineV2Blocking ?? DEFAULT_ENGINE_FLAGS.newSessionPlanControlsBlocking,
    newPriorityControlsSorting: settings.engineV2Priority ?? DEFAULT_ENGINE_FLAGS.newPriorityControlsSorting,
    newCompletionGateControlsTaskStatus: settings.engineV2Completion ?? DEFAULT_ENGINE_FLAGS.newCompletionGateControlsTaskStatus,
    newExecutionPreviewControlsApplication: settings.engineV2Execution ?? DEFAULT_ENGINE_FLAGS.newExecutionPreviewControlsApplication,
  }
}

interface FallbackArgs<T> {
  v2: () => Promise<T> | T
  v1: () => Promise<T> | T
  label: string
  validate?: (res: T) => boolean
  onError?: (err: unknown) => void
}

export async function withV1Fallback<T>({
  v2,
  v1,
  label,
  validate,
  onError,
}: FallbackArgs<T>): Promise<T> {
  try {
    const resultV2 = await v2()
    if (validate && !validate(resultV2)) {
      throw new Error(`Validation failed for V2 result in: ${label}`)
    }
    return resultV2
  } catch (err) {
    console.error(`[EngineV2 Fallback] Error in V2 engine for ${label}:`, err)
    
    if (onError) {
      try {
        onError(err)
      } catch (e) {
        console.error('Error in onError callback:', e)
      }
    }

    useToastStore.getState().push({
      variant: 'error',
      title: 'Moteur V2 : Fallback V1 activé',
      description: `Une anomalie temporaire (${label}) a été contournée pour garantir la continuité du blocage.`,
    })

    return await v1()
  }
}

export function withV1FallbackSync<T>({
  v2,
  v1,
  label,
  validate,
  onError,
}: Omit<FallbackArgs<T>, 'v2' | 'v1'> & {
  v2: () => T
  v1: () => T
}): T {
  try {
    const resultV2 = v2()
    if (validate && !validate(resultV2)) {
      throw new Error(`Validation failed for V2 result in: ${label}`)
    }
    return resultV2
  } catch (err) {
    console.error(`[EngineV2 Fallback Sync] Error in V2 engine for ${label}:`, err)
    
    if (onError) {
      try {
        onError(err)
      } catch (e) {
        console.error('Error in onError callback:', e)
      }
    }

    useToastStore.getState().push({
      variant: 'error',
      title: 'Moteur V2 : Fallback V1 activé',
      description: `Une anomalie temporaire (${label}) a été contournée pour garantir la continuité du blocage.`,
    })

    return v1()
  }
}
