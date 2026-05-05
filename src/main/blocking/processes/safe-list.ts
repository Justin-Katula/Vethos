/**
 * Processus système Windows qu'on refuse de tuer même si l'utilisateur l'inscrit
 * dans un profile. Validation au save du profile + au kill.
 */
export const SYSTEM_SAFE_LIST = new Set([
  'svchost.exe',
  'explorer.exe',
  'dwm.exe',
  'csrss.exe',
  'winlogon.exe',
  'lsass.exe',
  'services.exe',
  'smss.exe',
  'wininit.exe',
  'system',
  'system idle process',
  'registry',
  'fontdrvhost.exe',
  'searchhost.exe',
  'searchindexer.exe',
  'taskmgr.exe',
])

export function isSafeListed(name: string): boolean {
  return SYSTEM_SAFE_LIST.has(name.trim().toLowerCase())
}
