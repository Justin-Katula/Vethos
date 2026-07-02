import type { ProtectionLayer, ProtectionResult } from './engine-results'

export type ProtectionFailure = {
  layer: ProtectionLayer
  message?: string
}

export type ResolvedBlockingSnapshot = {
  blockedApps?: string[]
  blockedSites?: string[]
  allowedApps?: string[]
  allowedSites?: string[]
}

function unique(values: string[] | undefined): string[] {
  return Array.from(new Set((values ?? []).filter(Boolean)))
}

export function buildProtectionResult(
  _session: unknown,
  appliedLayers: ProtectionLayer[] = [],
  failures: Array<ProtectionFailure | ProtectionLayer> = [],
  resolvedBlocking: ResolvedBlockingSnapshot = {},
): ProtectionResult {
  const failedLayers = failures.map((failure) => (typeof failure === 'string' ? failure : failure.layer))
  const failureWarnings = failures
    .map((failure) => (typeof failure === 'string' ? `${failure} n’a pas été appliqué.` : failure.message))
    .filter((message): message is string => Boolean(message))
  const applied = appliedLayers.length > 0 && failedLayers.length === 0

  return {
    applied,
    appliedLayers: unique(appliedLayers) as ProtectionLayer[],
    failedLayers: unique(failedLayers) as ProtectionLayer[],
    blockedApps: unique(resolvedBlocking.blockedApps),
    blockedSites: unique(resolvedBlocking.blockedSites),
    allowedApps: unique(resolvedBlocking.allowedApps),
    allowedSites: unique(resolvedBlocking.allowedSites),
    warnings: failureWarnings,
    debug: {
      runtimeAudit: true,
    },
  }
}
