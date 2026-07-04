export type UpdaterCheckResult =
  | {
      status: 'disabled'
      currentVersion: string
      message: string
    }
  | {
      status: 'skipped'
      currentVersion: string
      reason: 'focus-session-active'
      message: string
    }
  | {
      status: 'available'
      currentVersion: string
      version: string
    }
  | {
      status: 'not-available'
      currentVersion: string
      version?: string
    }
  | {
      status: 'error'
      currentVersion: string
      message: string
    }

export type UpdaterEventInfo = {
  version?: string
}
