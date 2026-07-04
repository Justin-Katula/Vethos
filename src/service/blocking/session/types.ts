export type SessionPhase = 'idle' | 'starting' | 'active' | 'ending'

export type LayerStatusValue = 'ok' | 'drifted' | 'error' | 'inactive'

export type LayerStatus = {
  hosts: LayerStatusValue
  processes: LayerStatusValue
  firewall: LayerStatusValue
}

export const INACTIVE_LAYERS: LayerStatus = {
  hosts: 'inactive',
  processes: 'inactive',
  firewall: 'inactive',
}
