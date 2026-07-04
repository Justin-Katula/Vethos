/**
 * Processus système Windows qu'on refuse de tuer même si l'utilisateur l'inscrit
 * dans un profile. Validation au save du profile + au kill.
 */
export const SYSTEM_SAFE_LIST = new Set([
  'applicationframehost.exe',
  'audiodg.exe',
  'conhost.exe',
  'svchost.exe',
  'explorer.exe',
  'dwm.exe',
  'csrss.exe',
  'ctfmon.exe',
  'winlogon.exe',
  'lsass.exe',
  'services.exe',
  'smss.exe',
  'wininit.exe',
  'system',
  'system idle process',
  'registry',
  'fontdrvhost.exe',
  'runtimebroker.exe',
  'searchhost.exe',
  'searchindexer.exe',
  'screenclippinghost.exe',
  'screensketch.exe',
  'shellexperiencehost.exe',
  'sihost.exe',
  'startmenuexperiencehost.exe',
  'systemsettings.exe',
  'snippingtool.exe',
  'taskhostw.exe',
  'taskkill.exe',
  'tasklist.exe',
  'textinputhost.exe',
  'vethos.exe',
  'vethosblockingservice.exe',
  'nexus.exe',
  'nexusblockingservice.exe',
  'electron.exe',
  'node.exe',
])

export function isSafeListed(name: string): boolean {
  return SYSTEM_SAFE_LIST.has(name.trim().toLowerCase())
}
