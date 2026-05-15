import type { StorageWriteResult } from '../../../preload'

export function assertStorageWrite(
  result: StorageWriteResult,
  context: string,
): asserts result is { ok: true } {
  if (!result.ok) {
    throw new Error(`${context}: ${result.error}`)
  }
}
