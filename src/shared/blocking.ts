export const SLEEP_LOCKDOWN_PROFILE_ID = '00000000-0000-4000-8000-000000000043'
export const SLEEP_LOCKDOWN_PROCESS_MARKER = 'vethos-sleep-lockdown.exe'

export type BlockedAttemptPayload = {
  kind: 'app'
  processName: string
  pid: number
  blockAll: boolean
  mode: 'work' | 'sleep'
  sessionId: string
  profileId: string
  sessionName: string
}
